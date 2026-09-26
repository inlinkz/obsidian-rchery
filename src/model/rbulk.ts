export interface BulkRound {
	arrows: number;
	/** ISO timestamp of the commit. */
	at: string;
}

export interface BulkState {
	rounds: BulkRound[];
}

export function createBulkState(rounds: BulkRound[] = []): BulkState {
	return { rounds: rounds.map((round) => ({ arrows: round.arrows, at: round.at })) };
}

export function bulkTotal(state: BulkState): number {
	return state.rounds.reduce((sum, round) => sum + round.arrows, 0);
}

export function bulkStartedAt(state: BulkState): string | null {
	return state.rounds[0]?.at ?? null;
}

export function bulkFinishedAt(state: BulkState): string | null {
	if (state.rounds.length < 2) return null;
	return state.rounds[state.rounds.length - 1]?.at ?? null;
}

export function formatClock(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return '';
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	return `${hours}:${minutes}`;
}

export function formatDuration(ms: number): string {
	if (!Number.isFinite(ms) || ms < 0) return '';
	const totalSeconds = Math.floor(ms / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	if (hours > 0) return `${hours}h ${minutes}m`;
	if (minutes > 0) return `${minutes}m ${seconds}s`;
	return `${seconds}s`;
}

export function roundGapMs(state: BulkState, index: number): number | null {
	if (index <= 0) return null;
	const prev = state.rounds[index - 1];
	const current = state.rounds[index];
	if (!prev || !current) return null;
	const delta = new Date(current.at).getTime() - new Date(prev.at).getTime();
	return Number.isFinite(delta) ? delta : null;
}

export function elapsedMs(state: BulkState): number | null {
	const start = bulkStartedAt(state);
	const end = bulkFinishedAt(state);
	if (!start || !end) return null;
	const delta = new Date(end).getTime() - new Date(start).getTime();
	return Number.isFinite(delta) ? delta : null;
}
