export const DEFAULT_ENDS_PER_CARD = 6;
export const DEFAULT_ARROWS_PER_END = 6;
export const DEFAULT_CARDS_COUNT = 2;

export const MISS_SCORE = 0;

export type ArrowScore = number | null;

export interface SessionConfig {
	endsPerCard: number;
	arrowsPerEnd: number;
	cardsCount: number;
}

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

export const CONFIG_LIMITS = {
	endsPerCard: { min: 1, max: 60 },
	arrowsPerEnd: { min: 1, max: 24 },
	cardsCount: { min: 1, max: 10 },
} as const;

export function normalizeConfig(
	partial?: Partial<SessionConfig>,
): SessionConfig {
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
	ends: ArrowScore[][];
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
			Array.from<ArrowScore>({ length: config.arrowsPerEnd }).fill(null),
		),
	};
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

export function endTotal(end: ArrowScore[]): number {
	return end.reduce<number>((sum, score) => sum + (score ?? 0), 0);
}

export function endIsComplete(end: ArrowScore[]): boolean {
	return end.every((score) => score !== null);
}

export function cardGrandTotal(card: Scorecard): number {
	return card.ends.reduce((sum, end) => sum + endTotal(end), 0);
}

export function sessionGrandTotal(state: SessionState): number {
	return state.cards.reduce((sum, card) => sum + cardGrandTotal(card), 0);
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
				if (arrows[arrow] === null) {
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
				if (arrows[arrow] !== null) {
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
			ends: card.ends.map((end) => [...end]),
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
	const end = next.cards[cursor.card]?.ends[cursor.end];
	if (!end) return state;
	end[cursor.arrow] = value;
	return next;
}

export function undoLast(state: SessionState): SessionState {
	const cursor = lastFilledCursor(state);
	if (!cursor) return state;

	const next = cloneState(state);
	const end = next.cards[cursor.card]?.ends[cursor.end];
	if (!end) return state;
	end[cursor.arrow] = null;
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
		const ends: ArrowScore[][] = [];

		for (let endIndex = 0; endIndex < config.endsPerCard; endIndex++) {
			const oldEnd = oldCard?.ends[endIndex];
			const row: ArrowScore[] = [];
			for (let arrow = 0; arrow < config.arrowsPerEnd; arrow++) {
				row.push(oldEnd?.[arrow] ?? null);
			}
			ends.push(row);
		}

		cards.push({ ends });
	}

	return { config, cards };
}
