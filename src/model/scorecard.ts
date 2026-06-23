import { roundCoord } from './targetScoring';

export const DEFAULT_ENDS_PER_CARD = 6;
export const DEFAULT_ARROWS_PER_END = 6;
export const DEFAULT_CARDS_COUNT = 2;

export const MISS_SCORE = 0;

export type ArrowScore = number | null;

export interface ArrowShot {
	score: ArrowScore;
	x: number | null;
	y: number | null;
}

export function emptyArrow(): ArrowShot {
	return { score: null, x: null, y: null };
}

export function shotHasPlacement(shot: ArrowShot | undefined): boolean {
	return shot !== undefined && shot.score !== null && shot.x !== null && shot.y !== null;
}

export interface SessionConfig {
	endsPerCard: number;
	arrowsPerEnd: number;
	cardsCount: number;
	roundType?: string;
}

export interface SessionStats {
	arrows: number;
	score: number;
	tens: number;
	nines: number;
	eights: number;
	sevens: number;
	sixes: number;
	fives: number;
	fours: number;
	threes: number;
	twos: number;
	ones: number;
	misses: number;
	average: number | null;
}

const SCORE_STAT_FIELDS: { score: number; key: keyof SessionStats; label: string }[] = [
	{ score: 10, key: 'tens', label: '10' },
	{ score: 9, key: 'nines', label: '9' },
	{ score: 8, key: 'eights', label: '8' },
	{ score: 7, key: 'sevens', label: '7' },
	{ score: 6, key: 'sixes', label: '6' },
	{ score: 5, key: 'fives', label: '5' },
	{ score: 4, key: 'fours', label: '4' },
	{ score: 3, key: 'threes', label: '3' },
	{ score: 2, key: 'twos', label: '2' },
	{ score: 1, key: 'ones', label: '1' },
	{ score: MISS_SCORE, key: 'misses', label: 'M' },
];

export const DEFAULT_CONFIG: SessionConfig = {
	endsPerCard: DEFAULT_ENDS_PER_CARD,
	arrowsPerEnd: DEFAULT_ARROWS_PER_END,
	cardsCount: DEFAULT_CARDS_COUNT,
};

const SCORE_COLOR_CLASSES = [
	'archery-score-yellow',
	'archery-score-red',
	'archery-score-blue',
	'archery-score-grey',
	'archery-score-white',
	'archery-score-miss',
] as const;

export const END_COLOR_COUNT = 12;

export const END_COLOR_CLASSES = Array.from(
	{ length: END_COLOR_COUNT },
	(_, i) => `archery-end-color-${i}`,
) as readonly string[];

export function endColorClass(endIndex: number): string {
	return `archery-end-color-${endIndex % END_COLOR_COUNT}`;
}

export function applyEndColorClass(el: HTMLElement, endIndex: number | null): void {
	for (const cls of END_COLOR_CLASSES) {
		el.removeClass(cls);
	}
	if (endIndex !== null) {
		el.addClass(endColorClass(endIndex));
	}
}

export const CONFIG_LIMITS = {
	endsPerCard: { min: 1, max: 60 },
	arrowsPerEnd: { min: 1, max: 24 },
	cardsCount: { min: 1, max: 10 },
} as const;

export function normalizeConfig(
	partial?: Partial<SessionConfig>,
): SessionConfig {
	const roundType = partial?.roundType?.trim();
	return {
		endsPerCard: clamp(
			partial?.endsPerCard ?? DEFAULT_ENDS_PER_CARD,
			CONFIG_LIMITS.endsPerCard.min,
			CONFIG_LIMITS.endsPerCard.max,
		),
		arrowsPerEnd: clamp(
			partial?.arrowsPerEnd ?? DEFAULT_ARROWS_PER_END,
			CONFIG_LIMITS.arrowsPerEnd.min,
			CONFIG_LIMITS.arrowsPerEnd.max,
		),
		cardsCount: clamp(
			partial?.cardsCount ?? DEFAULT_CARDS_COUNT,
			CONFIG_LIMITS.cardsCount.min,
			CONFIG_LIMITS.cardsCount.max,
		),
		...(roundType ? { roundType } : {}),
	};
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, Math.floor(value)));
}

export function scoreColorClass(score: ArrowScore): string | null {
	if (score === null) return null;
	if (score === MISS_SCORE) return 'archery-score-miss';
	if (score >= 9) return 'archery-score-yellow';
	if (score >= 7) return 'archery-score-red';
	if (score >= 5) return 'archery-score-blue';
	if (score >= 3) return 'archery-score-grey';
	return 'archery-score-white';
}

export function applyScoreColorClass(el: HTMLElement, score: ArrowScore): void {
	for (const cls of SCORE_COLOR_CLASSES) {
		el.removeClass(cls);
	}
	const colorClass = scoreColorClass(score);
	if (colorClass) {
		el.addClass(colorClass);
	}
}

export interface Scorecard {
	ends: ArrowShot[][];
	endNotes: string[];
}

export interface Cursor {
	card: number;
	end: number;
	arrow: number;
}

export interface SessionState {
	config: SessionConfig;
	cards: Scorecard[];
}

export function createEmptyScorecard(config: SessionConfig): Scorecard {
	return {
		ends: Array.from({ length: config.endsPerCard }, () =>
			Array.from({ length: config.arrowsPerEnd }, () => emptyArrow()),
		),
		endNotes: Array.from({ length: config.endsPerCard }, () => ''),
	};
}

export function getEndNote(state: SessionState, card: number, end: number): string {
	return state.cards[card]?.endNotes[end] ?? '';
}

export function hasEndNote(state: SessionState, card: number, end: number): boolean {
	return getEndNote(state, card, end).trim().length > 0;
}

export function setEndNote(
	state: SessionState,
	card: number,
	end: number,
	note: string,
): SessionState {
	const cards = state.cards.map((scorecard, cardIndex) => {
		if (cardIndex !== card) return scorecard;
		const endNotes = [...scorecard.endNotes];
		endNotes[end] = note;
		return { ...scorecard, endNotes };
	});
	return { ...state, cards };
}

export function createSessionState(config: SessionConfig = DEFAULT_CONFIG): SessionState {
	const normalized = normalizeConfig(config);
	return {
		config: normalized,
		cards: Array.from({ length: normalized.cardsCount }, () =>
			createEmptyScorecard(normalized),
		),
	};
}

export function endTotal(end: ArrowShot[]): number {
	return end.reduce<number>((sum, shot) => sum + (shot.score ?? 0), 0);
}

export function endIsComplete(end: ArrowShot[]): boolean {
	return end.every((shot) => shot.score !== null);
}

export function cardGrandTotal(card: Scorecard): number {
	return card.ends.reduce((sum, end) => sum + endTotal(end), 0);
}

export function sessionGrandTotal(state: SessionState): number {
	return state.cards.reduce((sum, card) => sum + cardGrandTotal(card), 0);
}

export function computeSessionStats(state: SessionState): SessionStats {
	const scores: number[] = [];
	for (const card of state.cards) {
		for (const end of card.ends) {
			for (const shot of end) {
				if (shot.score !== null) {
					scores.push(shot.score);
				}
			}
		}
	}

	const count = (n: number) => scores.filter((score) => score === n).length;
	const score = scores.reduce((sum, value) => sum + value, 0);

	return {
		arrows: scores.length,
		score,
		tens: count(10),
		nines: count(9),
		eights: count(8),
		sevens: count(7),
		sixes: count(6),
		fives: count(5),
		fours: count(4),
		threes: count(3),
		twos: count(2),
		ones: count(1),
		misses: count(MISS_SCORE),
		average: scores.length > 0 ? score / scores.length : null,
	};
}

export function formatSessionStatsLabel(
	roundType: string,
	stats: SessionStats,
): string {
	const parts = [roundType];
	if (stats.arrows > 0) {
		parts.push(`${stats.score} pts`, `${stats.arrows} arrows`);
		for (const { key, label } of SCORE_STAT_FIELDS) {
			const count = stats[key] as number;
			if (count > 0) {
				parts.push(`${count}×${label}`);
			}
		}
		if (stats.average !== null) {
			parts.push(`avg ${stats.average.toFixed(1)}`);
		}
	}
	return parts.join(' · ');
}

export function nextCursor(state: SessionState): Cursor | null {
	const { config } = state;
	for (let card = 0; card < config.cardsCount; card++) {
		const scorecard = state.cards[card];
		if (!scorecard) continue;
		for (let end = 0; end < config.endsPerCard; end++) {
			const arrows = scorecard.ends[end];
			if (!arrows) continue;
			for (let arrow = 0; arrow < config.arrowsPerEnd; arrow++) {
				if (arrows[arrow]?.score === null) {
					return { card, end, arrow };
				}
			}
		}
	}
	return null;
}

export function lastFilledCursor(state: SessionState): Cursor | null {
	const { config } = state;
	for (let card = config.cardsCount - 1; card >= 0; card--) {
		const scorecard = state.cards[card];
		if (!scorecard) continue;
		for (let end = config.endsPerCard - 1; end >= 0; end--) {
			const arrows = scorecard.ends[end];
			if (!arrows) continue;
			for (let arrow = config.arrowsPerEnd - 1; arrow >= 0; arrow--) {
				if (arrows[arrow]?.score !== null) {
					return { card, end, arrow };
				}
			}
		}
	}
	return null;
}

function cloneState(state: SessionState): SessionState {
	return {
		config: { ...state.config },
		cards: state.cards.map((card) => ({
			ends: card.ends.map((end) => end.map((shot) => ({ ...shot }))),
			endNotes: [...card.endNotes],
		})),
	};
}

export function hasAnyScore(state: SessionState): boolean {
	return lastFilledCursor(state) !== null;
}

export function applyScore(state: SessionState, value: number): SessionState {
	const cursor = nextCursor(state);
	if (!cursor) return state;

	const next = cloneState(state);
	const shot = next.cards[cursor.card]?.ends[cursor.end]?.[cursor.arrow];
	if (!shot) return state;
	shot.score = value;
	shot.x = null;
	shot.y = null;
	return next;
}

export function applyScoreAt(
	state: SessionState,
	x: number,
	y: number,
	score: number,
): SessionState {
	const cursor = nextCursor(state);
	if (!cursor) return state;

	const next = cloneState(state);
	const shot = next.cards[cursor.card]?.ends[cursor.end]?.[cursor.arrow];
	if (!shot) return state;
	shot.score = score;
	shot.x = roundCoord(x);
	shot.y = roundCoord(y);
	return next;
}

export function undoLast(state: SessionState): SessionState {
	const cursor = lastFilledCursor(state);
	if (!cursor) return state;

	const next = cloneState(state);
	const shot = next.cards[cursor.card]?.ends[cursor.end]?.[cursor.arrow];
	if (!shot) return state;
	shot.score = null;
	shot.x = null;
	shot.y = null;
	return next;
}

export function formatScore(score: ArrowScore): string {
	if (score === null) return '·';
	if (score === MISS_SCORE) return 'M';
	return String(score);
}

export function isValidArrowScore(value: number): boolean {
	return Number.isInteger(value) && value >= MISS_SCORE && value <= 10;
}

export function gridColumnStyle(arrowsPerEnd: number): string {
	return `2.5rem repeat(${arrowsPerEnd}, minmax(1.5rem, 1fr)) 3rem`;
}

export function resizeSessionState(
	state: SessionState,
	partial: Partial<SessionConfig>,
): SessionState {
	const config = normalizeConfig({ ...state.config, ...partial });
	const cards: Scorecard[] = [];

	for (let cardIndex = 0; cardIndex < config.cardsCount; cardIndex++) {
		const oldCard = state.cards[cardIndex];
		const ends: ArrowShot[][] = [];

		for (let endIndex = 0; endIndex < config.endsPerCard; endIndex++) {
			const oldEnd = oldCard?.ends[endIndex];
			const row: ArrowShot[] = [];
			for (let arrow = 0; arrow < config.arrowsPerEnd; arrow++) {
				row.push(oldEnd?.[arrow] ? { ...oldEnd[arrow]! } : emptyArrow());
			}
			ends.push(row);
		}

		const oldNotes = oldCard?.endNotes ?? [];
		const endNotes = Array.from(
			{ length: config.endsPerCard },
			(_, endIndex) => oldNotes[endIndex] ?? '',
		);

		cards.push({ ends, endNotes });
	}

	return { config, cards };
}
