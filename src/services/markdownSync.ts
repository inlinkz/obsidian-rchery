import { Notice } from 'obsidian';
import type { TFile } from 'obsidian';
import type { App } from 'obsidian';
import {
	createSessionState,
	DEFAULT_CONFIG,
	MISS_SCORE,
	normalizeConfig,
	type ArrowScore,
	type SessionConfig,
	type SessionState,
} from '../model/scorecard';

export const MARKER_START = '<!-- archery-scorecard:start -->';
export const MARKER_END = '<!-- archery-scorecard:end -->';
export const CONFIG_PREFIX = '<!-- archery-config:';
export const ARCHERY_EXTENSION = 'archery';

function formatCell(score: ArrowScore): string {
	if (score === null) return '';
	if (score === MISS_SCORE) return 'M';
	return String(score);
}

function parseArrowCell(cell: string): ArrowScore {
	const trimmed = cell.trim();
	if (!trimmed) return null;
	if (trimmed.toUpperCase() === 'M') return MISS_SCORE;
	const value = Number.parseInt(trimmed, 10);
	if (Number.isNaN(value) || value < MISS_SCORE || value > 10) return null;
	return value;
}

function formatDateForFilename(date = new Date()): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
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
	ends: ArrowScore[][];
	arrowsPerEnd: number;
} {
	const lines = section.split('\n');
	let arrowsPerEnd = 0;
	const ends: ArrowScore[][] = [];

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

function padScorecard(
	ends: ArrowScore[][],
	config: SessionConfig,
): ArrowScore[][] {
	const padded: ArrowScore[][] = [];

	for (let endIndex = 0; endIndex < config.endsPerCard; endIndex++) {
		const source = ends[endIndex] ?? [];
		const row = Array.from<ArrowScore>({ length: config.arrowsPerEnd }).fill(null);
		for (let arrow = 0; arrow < config.arrowsPerEnd; arrow++) {
			row[arrow] = source[arrow] ?? null;
		}
		padded.push(row);
	}

	return padded;
}

export function extractScorecardContent(content: string): string {
	const markers = findMarkerBlock(content);
	if (markers) {
		return content.slice(markers.start, markers.end);
	}
	return content;
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
		};
	}

	return state;
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
				formatCell(end[arrow] ?? null),
			);
			const total = end.reduce<number>((sum, score) => sum + (score ?? 0), 0);
			const hasAny = end.some((score) => score !== null);
			lines.push(
				`| ${endIndex + 1} | ${cells.join(' | ')} | ${hasAny ? total : ''} |`,
			);
		}

		const cardTotal = card?.ends.reduce(
			(sum, end) => sum + end.reduce<number>((s, score) => s + (score ?? 0), 0),
			0,
		) ?? 0;
		lines.push('');
		lines.push(`**Scorecard ${cardIndex + 1} total:** ${cardTotal}`);
		lines.push('');
	}

	lines.push(`**Grand total:** ${sessionGrandTotalFromState(state)}`);
	lines.push('');
	lines.push(MARKER_END);

	return lines.join('\n');
}

function sessionGrandTotalFromState(state: SessionState): number {
	return state.cards.reduce(
		(sum, card) =>
			sum +
			card.ends.reduce(
				(s, end) =>
					s + end.reduce<number>((total, score) => total + (score ?? 0), 0),
				0,
			),
		0,
	);
}

export function serializeSession(state: SessionState): string {
	return buildScorecardBlock(state);
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
): Promise<TFile | null> {
	const folder = app.fileManager.getNewFileParent('');
	const dateLabel = formatDateForFilename();
	const baseName = `Scorecard ${dateLabel}`;
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
