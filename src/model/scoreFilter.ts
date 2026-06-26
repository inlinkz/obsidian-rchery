import { MISS_SCORE, type ArrowShot } from './scorecard';

export interface ScoreFilter {
	minScore: number | null;
	maxScore: number | null;
}

export const EMPTY_SCORE_FILTER: ScoreFilter = {
	minScore: null,
	maxScore: null,
};

export function isScoreFilterActive(filter: ScoreFilter): boolean {
	return filter.minScore !== null || filter.maxScore !== null;
}

export function shotMatchesScoreFilter(shot: ArrowShot, filter: ScoreFilter): boolean {
	if (!isScoreFilterActive(filter)) return true;
	if (shot.score === null || shot.x === null || shot.y === null) return false;
	if (filter.minScore !== null && shot.score < filter.minScore) return false;
	if (filter.maxScore !== null && shot.score > filter.maxScore) return false;
	return true;
}

export function normalizeScoreFilter(filter: ScoreFilter): ScoreFilter {
	let minScore = filter.minScore;
	let maxScore = filter.maxScore;
	if (minScore !== null) minScore = clampScore(minScore);
	if (maxScore !== null) maxScore = clampScore(maxScore);
	if (minScore !== null && maxScore !== null && minScore > maxScore) {
		[minScore, maxScore] = [maxScore, minScore];
	}
	return { minScore, maxScore };
}

export function describeScoreFilter(filter: ScoreFilter): string {
	if (!isScoreFilterActive(filter)) return 'No filter applied';
	const min = filter.minScore;
	const max = filter.maxScore;
	if (min !== null && max !== null) {
		if (min === max) return `Showing ${formatFilterScore(min)} only`;
		return `Showing scores ${formatFilterScore(min)}–${formatFilterScore(max)}`;
	}
	if (min !== null) return `Showing ${formatFilterScore(min)} and above`;
	return `Showing ${formatFilterScore(max!)} and below`;
}

export function countMatchingShots(
	shots: ArrowShot[],
	filter: ScoreFilter,
): number {
	return shots.filter((shot) => shotMatchesScoreFilter(shot, filter)).length;
}

export function scoreFilterToRange(filter: ScoreFilter): { min: number; max: number } {
	return {
		min: filter.minScore ?? MISS_SCORE,
		max: filter.maxScore ?? 10,
	};
}

export function scoreFilterFromRange(min: number, max: number): ScoreFilter {
	const normalized = normalizeScoreFilter({ minScore: min, maxScore: max });
	if (normalized.minScore === MISS_SCORE && normalized.maxScore === 10) {
		return EMPTY_SCORE_FILTER;
	}
	return normalized;
}

function clampScore(score: number): number {
	return Math.min(10, Math.max(MISS_SCORE, Math.round(score)));
}

function formatFilterScore(score: number): string {
	return score === MISS_SCORE ? 'misses' : String(score);
}
