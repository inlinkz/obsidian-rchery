import { Notice, TFolder } from 'obsidian';
import type { TFile } from 'obsidian';
import type { App } from 'obsidian';
import {
	createSessionState,
	DEFAULT_CONFIG,
	emptyArrow,
	MISS_SCORE,
	normalizeConfig,
	computeSessionStats,
	type ArrowShot,
	type SessionConfig,
	type SessionStats,
	type SessionState,
} from '../model/scorecard';
import { roundCoord } from '../model/targetScoring';
import { normalizeScorecardFolder } from '../settings';

export const MARKER_START = '<!-- archery-scorecard:start -->';
export const MARKER_END = '<!-- archery-scorecard:end -->';
export const CONFIG_PREFIX = '<!-- archery-config:';
export const META_PREFIX = '<!-- archery-meta:';
export const ARCHERY_EXTENSION = 'rchery';

const COORD_SUFFIX = /^(.+?)@(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/;

function formatCoord(value: number): string {
	return String(roundCoord(value));
}

function formatCell(shot: ArrowShot): string {
	if (shot.score === null) return '';
	const scorePart = shot.score === MISS_SCORE ? 'M' : String(shot.score);
	if (shot.x !== null && shot.y !== null) {
		return `${scorePart}@${formatCoord(shot.x)},${formatCoord(shot.y)}`;
	}
	return scorePart;
}

function parseArrowCell(cell: string): ArrowShot {
	const trimmed = cell.trim();
	if (!trimmed) return emptyArrow();

	let scorePart = trimmed;
	let x: number | null = null;
	let y: number | null = null;
	const coordMatch = trimmed.match(COORD_SUFFIX);
	if (coordMatch) {
		scorePart = coordMatch[1]!.trim();
		x = Number.parseFloat(coordMatch[2]!);
		y = Number.parseFloat(coordMatch[3]!);
		if (Number.isNaN(x) || Number.isNaN(y)) {
			x = null;
			y = null;
		}
	}

	if (scorePart.toUpperCase() === 'M') {
		return { score: MISS_SCORE, x, y };
	}

	const value = Number.parseInt(scorePart, 10);
	if (Number.isNaN(value) || value < MISS_SCORE || value > 10) {
		return emptyArrow();
	}
	return { score: value, x, y };
}

function formatDateForFilename(date = new Date()): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	return `${year}-${month}-${day} ${hours}-${minutes}`;
}

export function serializeConfig(config: SessionConfig): string {
	return `${CONFIG_PREFIX} ${JSON.stringify(normalizeConfig(config))} -->`;
}

export function parseConfigLine(line: string): SessionConfig | null {
	const trimmed = line.trim();
	if (!trimmed.startsWith(CONFIG_PREFIX)) return null;
	const json = trimmed.slice(CONFIG_PREFIX.length).replace(/-->\s*$/, '').trim();
	try {
		return normalizeConfig(JSON.parse(json) as Partial<SessionConfig>);
	} catch {
		return null;
	}
}

export interface SessionMetaSnapshot extends SessionStats {
	roundType: string;
}

export function buildSessionMeta(state: SessionState): SessionMetaSnapshot {
	const stats = computeSessionStats(state);
	return {
		roundType: state.config.roundType ?? 'Custom',
		...stats,
	};
}

export function serializeMeta(state: SessionState): string {
	return `${META_PREFIX} ${JSON.stringify(buildSessionMeta(state))} -->`;
}

export function parseMetaLine(line: string): SessionMetaSnapshot | null {
	const trimmed = line.trim();
	if (!trimmed.startsWith(META_PREFIX)) return null;
	const json = trimmed.slice(META_PREFIX.length).replace(/-->\s*$/, '').trim();
	try {
		return JSON.parse(json) as SessionMetaSnapshot;
	} catch {
		return null;
	}
}

function stripMetaComment(content: string): string {
	const lines = content.split('\n');
	return lines.filter((line) => !line.trim().startsWith(META_PREFIX)).join('\n');
}

function parseTableHeader(line: string): number | null {
	if (!/\|\s*End\s*\|/i.test(line)) return null;
	const parts = line
		.split('|')
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
	if (parts.length < 3) return null;
	return parts.length - 2;
}

function parseScorecardSection(section: string): {
	ends: ArrowShot[][];
	arrowsPerEnd: number;
} {
	const lines = section.split('\n');
	let arrowsPerEnd = 0;
	const ends: ArrowShot[][] = [];

	for (const line of lines) {
		if (!line.startsWith('|')) continue;
		if (line.includes('---')) continue;

		const headerArrows = parseTableHeader(line);
		if (headerArrows !== null) {
			arrowsPerEnd = headerArrows;
			continue;
		}

		const parts = line
			.split('|')
			.map((part) => part.trim())
			.filter((part) => part.length > 0);

		if (parts.length < 3) continue;
		if (!/^\d+$/.test(parts[0]!)) continue;

		const arrowCells = parts.slice(1, parts.length - 1).map(parseArrowCell);
		if (arrowCells.length > 0) {
			arrowsPerEnd = Math.max(arrowsPerEnd, arrowCells.length);
		}
		ends.push(arrowCells);
	}

	return { ends, arrowsPerEnd };
}

const END_NOTES_HEADING = /^###\s*End notes\s*$/i;
const END_NOTE_ITEM = /^####\s*(\d+)\.(\d+)\s*$/;

function emptyEndNotes(config: SessionConfig): string[] {
	return Array.from({ length: config.endsPerCard }, () => '');
}

function parseEndNotes(block: string, state: SessionState): SessionState {
	const lines = block.split('\n');
	let inNotes = false;
	let currentCard = -1;
	let currentEnd = -1;
	let buffer: string[] = [];
	const noteByKey = new Map<string, string>();

	const flush = (): void => {
		if (currentCard < 0 || currentEnd < 0) return;
		const text = buffer.join('\n').trim();
		if (text) {
			noteByKey.set(`${currentCard}.${currentEnd}`, text);
		}
		buffer = [];
	};

	for (const line of lines) {
		const trimmed = line.trim();
		if (END_NOTES_HEADING.test(trimmed)) {
			inNotes = true;
			continue;
		}
		if (!inNotes) continue;
		if (trimmed === MARKER_END) {
			flush();
			break;
		}

		const match = trimmed.match(END_NOTE_ITEM);
		if (match) {
			flush();
			currentCard = Number.parseInt(match[1]!, 10) - 1;
			currentEnd = Number.parseInt(match[2]!, 10) - 1;
			continue;
		}

		if (currentCard >= 0 && currentEnd >= 0) {
			buffer.push(line);
		}
	}

	const cards = state.cards.map((card, cardIndex) => {
		const endNotes = Array.from({ length: state.config.endsPerCard }, (_, endIndex) => {
			return noteByKey.get(`${cardIndex}.${endIndex}`) ?? card.endNotes[endIndex] ?? '';
		});
		return { ...card, endNotes };
	});

	return { ...state, cards };
}

function buildEndNotesSection(state: SessionState): string[] {
	const items: string[] = [];

	for (let cardIndex = 0; cardIndex < state.config.cardsCount; cardIndex++) {
		const notes = state.cards[cardIndex]?.endNotes ?? [];
		for (let endIndex = 0; endIndex < state.config.endsPerCard; endIndex++) {
			const text = notes[endIndex]?.trim();
			if (!text) continue;
			items.push(`#### ${cardIndex + 1}.${endIndex + 1}`, text, '');
		}
	}

	if (items.length === 0) return [];
	return ['### End notes', '', ...items];
}

function padScorecard(
	ends: ArrowShot[][],
	config: SessionConfig,
): ArrowShot[][] {
	const padded: ArrowShot[][] = [];

	for (let endIndex = 0; endIndex < config.endsPerCard; endIndex++) {
		const source = ends[endIndex] ?? [];
		const row = Array.from({ length: config.arrowsPerEnd }, () => emptyArrow());
		for (let arrow = 0; arrow < config.arrowsPerEnd; arrow++) {
			row[arrow] = source[arrow] ?? emptyArrow();
		}
		padded.push(row);
	}

	return padded;
}

export function extractScorecardContent(content: string): string {
	const withoutMeta = stripMetaComment(content);
	const markers = findMarkerBlock(withoutMeta);
	if (markers) {
		return withoutMeta.slice(markers.start, markers.end);
	}
	return withoutMeta;
}

export function parseScorecardBlock(content: string): SessionState | null {
	const block = extractScorecardContent(content);
	const lines = block.split('\n');

	let config: SessionConfig | null = null;
	for (const line of lines) {
		const parsed = parseConfigLine(line);
		if (parsed) {
			config = parsed;
			break;
		}
	}

	const sections = block.split(/###\s*Scorecard\s+\d+/i).slice(1);
	if (sections.length === 0) {
		return null;
	}

	const parsedCards = sections.map((section) => parseScorecardSection(section));
	const inferredConfig = normalizeConfig({
		endsPerCard: Math.max(
			config?.endsPerCard ?? DEFAULT_CONFIG.endsPerCard,
			...parsedCards.map((card) => card.ends.length),
		),
		arrowsPerEnd: Math.max(
			config?.arrowsPerEnd ?? DEFAULT_CONFIG.arrowsPerEnd,
			...parsedCards.map((card) => card.arrowsPerEnd),
		),
		cardsCount: Math.max(config?.cardsCount ?? DEFAULT_CONFIG.cardsCount, parsedCards.length),
	});

	const state = createSessionState(inferredConfig);
	for (let cardIndex = 0; cardIndex < inferredConfig.cardsCount; cardIndex++) {
		const parsed = parsedCards[cardIndex];
		state.cards[cardIndex] = {
			ends: padScorecard(parsed?.ends ?? [], inferredConfig),
			endNotes: emptyEndNotes(inferredConfig),
		};
	}

	return parseEndNotes(block, state);
}

export function buildScorecardBlock(state: SessionState): string {
	const config = normalizeConfig(state.config);
	const lines: string[] = [
		MARKER_START,
		serializeConfig(config),
		'',
	];

	for (let cardIndex = 0; cardIndex < config.cardsCount; cardIndex++) {
		const arrowHeaders = Array.from({ length: config.arrowsPerEnd }, (_, i) => String(i + 1));
		lines.push(`### Scorecard ${cardIndex + 1}`);
		lines.push(`| End | ${arrowHeaders.join(' | ')} | Total |`);
		lines.push(
			`| --- | ${Array.from({ length: config.arrowsPerEnd }, () => '---').join(' | ')} | --- |`,
		);

		const card = state.cards[cardIndex];
		for (let endIndex = 0; endIndex < config.endsPerCard; endIndex++) {
			const end = card?.ends[endIndex] ?? [];
			const cells = Array.from({ length: config.arrowsPerEnd }, (_, arrow) =>
				formatCell(end[arrow] ?? emptyArrow()),
			);
			const total = end.reduce<number>((sum, shot) => sum + (shot.score ?? 0), 0);
			const hasAny = end.some((shot) => shot.score !== null);
			lines.push(
				`| ${endIndex + 1} | ${cells.join(' | ')} | ${hasAny ? total : ''} |`,
			);
		}

		const cardTotal = card?.ends.reduce(
			(sum, end) => sum + end.reduce<number>((s, shot) => s + (shot.score ?? 0), 0),
			0,
		) ?? 0;
		lines.push('');
		lines.push(`**Scorecard ${cardIndex + 1} total:** ${cardTotal}`);
		lines.push('');
	}

	lines.push(`**Grand total:** ${sessionGrandTotalFromState(state)}`);
	lines.push('');
	lines.push(...buildEndNotesSection(state));
	lines.push(MARKER_END);

	return lines.join('\n');
}

function sessionGrandTotalFromState(state: SessionState): number {
	return state.cards.reduce(
		(sum, card) =>
			sum +
			card.ends.reduce(
				(s, end) =>
					s + end.reduce<number>((total, shot) => total + (shot.score ?? 0), 0),
				0,
			),
		0,
	);
}

export function serializeSession(state: SessionState): string {
	return `${serializeMeta(state)}\n\n${buildScorecardBlock(state)}`;
}

export function findMarkerBlock(content: string): { start: number; end: number } | null {
	const startIndex = content.indexOf(MARKER_START);
	const endIndex = content.indexOf(MARKER_END);
	if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
		return null;
	}
	return {
		start: startIndex,
		end: endIndex + MARKER_END.length,
	};
}

export async function loadSessionFromFile(
	app: App,
	file: TFile,
): Promise<SessionState> {
	const content = await app.vault.read(file);
	return parseScorecardBlock(content) ?? createSessionState();
}

export async function saveSessionToFile(
	app: App,
	file: TFile,
	state: SessionState,
): Promise<void> {
	await app.vault.modify(file, serializeSession(state));
}

export async function createScorecardFile(
	app: App,
	config: SessionConfig = DEFAULT_CONFIG,
	defaultFolder = '',
): Promise<TFile | null> {
	const dateLabel = formatDateForFilename();
	const baseName = `Scorecard ${dateLabel}`;
	const folder = resolveScorecardParentFolder(app, defaultFolder);
	let path = `${folder.path}/${baseName}.${ARCHERY_EXTENSION}`;
	let counter = 2;

	while (app.vault.getAbstractFileByPath(path)) {
		path = `${folder.path}/${baseName} ${counter}.${ARCHERY_EXTENSION}`;
		counter++;
	}

	try {
		return await app.vault.create(
			path,
			serializeSession(createSessionState(normalizeConfig(config))),
		);
	} catch {
		new Notice('Could not create scorecard file.');
		return null;
	}
}

function resolveScorecardParentFolder(app: App, configuredFolder: string): TFolder {
	const folderPath = normalizeScorecardFolder(configuredFolder);
	if (folderPath) {
		const folder = app.vault.getAbstractFileByPath(folderPath);
		if (folder instanceof TFolder) return folder;
		new Notice(`Scorecard folder not found: ${folderPath}. Using default location.`);
	}
	return app.fileManager.getNewFileParent('', `Scorecard.${ARCHERY_EXTENSION}`);
}
