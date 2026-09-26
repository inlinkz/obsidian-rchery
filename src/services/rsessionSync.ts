import { Notice, TFolder, TFile, type App } from 'obsidian';
import {
	createRSessionState,
	createRSessionTemplateState,
	isValidSessionDate,
	sessionBasename,
	type RSessionBlock,
	type RSessionState,
	type RSessionTemplateState,
} from '../model/rsession';
import { normalizeScorecardFolder } from '../settings';

export const SESSION_EXTENSION = 'rsession';
export const TEMPLATE_EXTENSION = 'rsessiont';
export const TEMPLATE_META = '<!-- rsession-template -->';
export const META_PREFIX = '<!-- rsession-meta:';
export const BLOCKS_START = '<!-- rsession-blocks:start -->';
export const BLOCKS_END = '<!-- rsession-blocks:end -->';
export const BLOCK_PREFIX = '<!-- rsession-block:';

/** Legacy markers — still parsed for migration. */
export const CARDS_START = '<!-- rsession-cards:start -->';
export const CARDS_END = '<!-- rsession-cards:end -->';
export const CARD_PREFIX = '<!-- rsession-card:';

const SESSION_BASENAME_RE = /^Session (\d{4}-\d{2}-\d{2})$/;
const WIKI_EMBED_RE = /^!\[\[([^\]]+)\]\]\s*$/;

export function dateFromSessionBasename(basename: string): string | null {
	const match = SESSION_BASENAME_RE.exec(basename);
	if (!match) return null;
	const date = match[1]!;
	return isValidSessionDate(date) ? date : null;
}

export function isSessionFile(file: TFile): boolean {
	return file.extension === SESSION_EXTENSION;
}

export function isSessionTemplateFile(file: TFile): boolean {
	return file.extension === TEMPLATE_EXTENSION;
}

export function serializeRSession(state: RSessionState): string {
	const lines: string[] = [`${META_PREFIX} ${JSON.stringify({ date: state.date })} -->`, ''];
	lines.push(BLOCKS_START);
	for (const block of state.blocks) {
		if (block.type === 'text') {
			lines.push(`${BLOCK_PREFIX} ${JSON.stringify({ type: 'text' })} -->`);
			if (block.content.trimEnd()) {
				lines.push(block.content.trimEnd());
			}
			lines.push('');
		} else {
			const marker: { type: string; path: string; label?: string } = {
				type: block.type,
				path: block.path,
			};
			if (block.label?.trim()) marker.label = block.label.trim();
			lines.push(`${BLOCK_PREFIX} ${JSON.stringify(marker)} -->`);
			if (block.path.trim()) {
				lines.push(`![[${block.path}]]`);
			}
			lines.push('');
		}
	}
	lines.push(BLOCKS_END);
	lines.push('');
	return lines.join('\n');
}

export function parseRSession(content: string, fallbackDate = ''): RSessionState {
	const date = parseMetaDate(content) ?? fallbackDate;

	const blocksStart = content.indexOf(BLOCKS_START);
	const blocksEnd = content.indexOf(BLOCKS_END);
	if (blocksStart !== -1 && blocksEnd !== -1 && blocksEnd > blocksStart) {
		const blocks = parseBlocksRegion(
			content.slice(blocksStart + BLOCKS_START.length, blocksEnd),
		);
		return createRSessionState(date || fallbackDate, blocks);
	}

	// Legacy: notes above cards region + card markers
	return createRSessionState(date || fallbackDate, parseLegacyBlocks(content));
}

function parseMetaDate(content: string): string | null {
	const start = content.indexOf(META_PREFIX);
	if (start === -1) return null;
	const jsonStart = start + META_PREFIX.length;
	const jsonEnd = content.indexOf('-->', jsonStart);
	if (jsonEnd === -1) return null;
	try {
		const raw = JSON.parse(content.slice(jsonStart, jsonEnd).trim()) as { date?: unknown };
		return typeof raw.date === 'string' && isValidSessionDate(raw.date) ? raw.date : null;
	} catch {
		return null;
	}
}

function stripMeta(content: string): string {
	const start = content.indexOf(META_PREFIX);
	if (start === -1) return content;
	const end = content.indexOf('-->', start);
	if (end === -1) return content;
	return (content.slice(0, start) + content.slice(end + 3)).replace(/^\s*\n/, '');
}

function parseBlocksRegion(region: string): RSessionBlock[] {
	const blocks: RSessionBlock[] = [];
	const lines = region.split(/\r?\n/);
	let i = 0;

	while (i < lines.length) {
		const line = lines[i]!.trim();
		if (!line.startsWith(BLOCK_PREFIX)) {
			i++;
			continue;
		}

		const marker = parseBlockMarker(line);
		i++;
		if (!marker) continue;

		if (marker.type === 'text') {
			const bodyLines: string[] = [];
			while (i < lines.length) {
				const next = lines[i]!.trim();
				if (next.startsWith(BLOCK_PREFIX)) break;
				bodyLines.push(lines[i]!);
				i++;
			}
			blocks.push({ type: 'text', content: trimBlockBody(bodyLines) });
			continue;
		}

		if (marker.type === 'scorecard' || marker.type === 'bulk') {
			if (i < lines.length && WIKI_EMBED_RE.test(lines[i]!.trim())) {
				i++;
			}
			blocks.push({
				type: marker.type,
				path: marker.path ?? '',
				label: marker.label,
			});
			continue;
		}

		// Unknown typed block with path — treat as scorecard if path looks like one
		if (marker.path) {
			if (i < lines.length && WIKI_EMBED_RE.test(lines[i]!.trim())) {
				i++;
			}
			blocks.push({
				type: 'scorecard',
				path: marker.path,
			});
		}
	}

	return blocks;
}

function parseBlockMarker(line: string): { type: string; path?: string; label?: string } | null {
	const jsonEnd = line.lastIndexOf('-->');
	if (jsonEnd === -1) return null;
	try {
		const raw = JSON.parse(line.slice(BLOCK_PREFIX.length, jsonEnd).trim()) as {
			type?: unknown;
			path?: unknown;
			label?: unknown;
		};
		const type = typeof raw.type === 'string' && raw.type ? raw.type : 'unknown';
		const path = typeof raw.path === 'string' && raw.path.trim() ? raw.path.trim() : undefined;
		const label = typeof raw.label === 'string' ? raw.label : undefined;
		return { type, path, label };
	} catch {
		return null;
	}
}

function trimBlockBody(lines: string[]): string {
	while (lines.length > 0 && lines[0]!.trim() === '') lines.shift();
	while (lines.length > 0 && lines[lines.length - 1]!.trim() === '') lines.pop();
	return lines.join('\n');
}

function parseLegacyBlocks(content: string): RSessionBlock[] {
	const blocks: RSessionBlock[] = [];
	const cardsStart = content.indexOf(CARDS_START);
	const cardsEnd = content.indexOf(CARDS_END);

	let notes = '';
	if (cardsStart !== -1 && cardsEnd !== -1 && cardsEnd > cardsStart) {
		notes = stripMeta(content.slice(0, cardsStart)).trimEnd();
		const cardBlocks = parseLegacyCards(
			content.slice(cardsStart + CARDS_START.length, cardsEnd),
		);
		if (notes.trim()) {
			blocks.push({ type: 'text', content: notes });
		}
		blocks.push(...cardBlocks);
		return blocks;
	}

	notes = stripMeta(content).trimEnd();
	const loose = parseLooseEmbeds(content);
	if (notes.trim() && loose.length === 0) {
		blocks.push({ type: 'text', content: notes });
	} else if (loose.length > 0) {
		// Notes that aren't pure embeds — keep as text if any non-embed content remains
		const withoutEmbeds = notes
			.split(/\r?\n/)
			.filter((line) => !WIKI_EMBED_RE.test(line.trim()))
			.join('\n')
			.trimEnd();
		if (withoutEmbeds.trim()) {
			blocks.push({ type: 'text', content: withoutEmbeds });
		}
		blocks.push(...loose);
	}

	return blocks;
}

function parseLegacyCards(block: string): RSessionBlock[] {
	const blocks: RSessionBlock[] = [];
	const lines = block.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!.trim();
		if (line.startsWith(CARD_PREFIX)) {
			const jsonEnd = line.lastIndexOf('-->');
			if (jsonEnd === -1) continue;
			try {
				const raw = JSON.parse(line.slice(CARD_PREFIX.length, jsonEnd).trim()) as {
					type?: unknown;
					path?: unknown;
				};
				if (typeof raw.path === 'string' && raw.path.trim()) {
					blocks.push({ type: 'scorecard', path: raw.path.trim() });
				}
			} catch {
				// skip malformed
			}
			continue;
		}
		const embed = WIKI_EMBED_RE.exec(line);
		if (embed && !blocks.some((b) => b.type === 'scorecard' && b.path === embed[1])) {
			blocks.push({ type: 'scorecard', path: embed[1]! });
		}
	}
	return blocks;
}

function parseLooseEmbeds(content: string): RSessionBlock[] {
	const blocks: RSessionBlock[] = [];
	for (const line of content.split(/\r?\n/)) {
		const embed = WIKI_EMBED_RE.exec(line.trim());
		if (!embed) continue;
		blocks.push({ type: 'scorecard', path: embed[1]! });
	}
	return blocks;
}

function resolveSessionParentFolder(app: App, configuredFolder: string): TFolder {
	const folderPath = normalizeScorecardFolder(configuredFolder);
	if (folderPath) {
		const folder = app.vault.getAbstractFileByPath(folderPath);
		if (folder instanceof TFolder) return folder;
		new Notice(`Session folder not found: ${folderPath}. Using default location.`);
	}
	return app.fileManager.getNewFileParent('', `Session.${SESSION_EXTENSION}`);
}

export function findSessionFileByDate(app: App, date: string): TFile | null {
	if (!isValidSessionDate(date)) return null;
	const expectedName = `${sessionBasename(date)}.${SESSION_EXTENSION}`;
	for (const file of app.vault.getFiles()) {
		if (file.extension !== SESSION_EXTENSION) continue;
		if (file.name === expectedName || dateFromSessionBasename(file.basename) === date) {
			return file;
		}
	}
	return null;
}

export async function createSessionFile(
	app: App,
	date: string,
	defaultFolder = '',
): Promise<TFile | null> {
	if (!isValidSessionDate(date)) {
		new Notice('Invalid session date.');
		return null;
	}

	const existing = findSessionFileByDate(app, date);
	if (existing) return existing;

	const folder = resolveSessionParentFolder(app, defaultFolder);
	const path = `${folder.path}/${sessionBasename(date)}.${SESSION_EXTENSION}`;
	const already = app.vault.getAbstractFileByPath(path);
	if (already instanceof TFile) return already;

	try {
		return await app.vault.create(path, serializeRSession(createRSessionState(date)));
	} catch {
		new Notice('Could not create session file.');
		return null;
	}
}

/** Open existing session for the date, or create one. */
export async function findOrCreateSessionFile(
	app: App,
	date: string,
	defaultFolder = '',
): Promise<TFile | null> {
	return findSessionFileByDate(app, date) ?? createSessionFile(app, date, defaultFolder);
}

export function serializeRSessionTemplate(state: RSessionTemplateState): string {
	const asSession = serializeRSession(createRSessionState('', state.blocks));
	return `${TEMPLATE_META}\n${asSession.replace(/^<!-- rsession-meta:.*-->\n*/, '')}`;
}

export function parseRSessionTemplate(content: string): RSessionTemplateState {
	const session = parseRSession(content.replace(TEMPLATE_META, ''), '');
	return createRSessionTemplateState(
		session.blocks.map((block) =>
			block.type === 'scorecard' || block.type === 'bulk' ? { ...block, path: '' } : block,
		),
	);
}

/** Create a dated session that copies the template. An existing session for that date is left unchanged. */
export async function createSessionFromTemplate(
	app: App,
	date: string,
	template: RSessionTemplateState,
	defaultFolder = '',
): Promise<TFile | null> {
	if (!isValidSessionDate(date)) {
		new Notice('Invalid session date.');
		return null;
	}

	const existing = findSessionFileByDate(app, date);
	if (existing) {
		new Notice('A session for that date already exists.');
		return existing;
	}

	const folder = resolveSessionParentFolder(app, defaultFolder);
	const path = `${folder.path}/${sessionBasename(date)}.${SESSION_EXTENSION}`;
	const state = createRSessionState(
		date,
		template.blocks.map((block) => {
			if (block.type === 'scorecard') return { type: 'scorecard', path: '', label: block.label };
			if (block.type === 'bulk') return { type: 'bulk', path: '', label: block.label };
			return { ...block };
		}),
	);

	try {
		return await app.vault.create(path, serializeRSession(state));
	} catch {
		new Notice('Could not create session file.');
		return null;
	}
}

export async function createSessionTemplateFile(app: App, defaultFolder = ''): Promise<TFile | null> {
	const folder = resolveSessionParentFolder(app, defaultFolder);
	let path = `${folder.path}/Session template.${TEMPLATE_EXTENSION}`;
	let n = 2;
	while (app.vault.getAbstractFileByPath(path)) {
		path = `${folder.path}/Session template ${n}.${TEMPLATE_EXTENSION}`;
		n += 1;
	}
	try {
		return await app.vault.create(path, serializeRSessionTemplate(createRSessionTemplateState()));
	} catch {
		new Notice('Could not create session template.');
		return null;
	}
}

export async function loadRSessionTemplateFromFile(
	app: App,
	file: TFile,
): Promise<RSessionTemplateState> {
	return parseRSessionTemplate(await app.vault.read(file));
}

export async function saveRSessionTemplate(
	app: App,
	file: TFile,
	state: RSessionTemplateState,
): Promise<void> {
	await app.vault.process(file, () => serializeRSessionTemplate(state));
}

export async function loadRSessionFromFile(app: App, file: TFile): Promise<RSessionState> {
	const content = await app.vault.read(file);
	const fallback = dateFromSessionBasename(file.basename) ?? '';
	return parseRSession(content, fallback);
}

export async function saveRSession(app: App, file: TFile, state: RSessionState): Promise<void> {
	await app.vault.process(file, () => serializeRSession(state));
}

export async function appendBlockToSession(
	app: App,
	file: TFile,
	block: RSessionBlock,
): Promise<boolean> {
	try {
		const state = await loadRSessionFromFile(app, file);
		if (
			block.type === 'scorecard' &&
			state.blocks.some((existing) => existing.type === 'scorecard' && existing.path === block.path)
		) {
			return true;
		}
		state.blocks.push(block);
		await saveRSession(app, file, state);
		return true;
	} catch {
		return false;
	}
}

/** @deprecated Use appendBlockToSession */
export async function appendCardToSession(
	app: App,
	file: TFile,
	card: { type: string; path: string },
): Promise<boolean> {
	return appendBlockToSession(app, file, { type: 'scorecard', path: card.path });
}
