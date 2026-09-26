export type RSessionTextBlock = {
	type: 'text';
	content: string;
};

export type RSessionScorecardBlock = {
	type: 'scorecard';
	/** Empty until the archer starts this step from a template. */
	path: string;
	label?: string;
};

export type RSessionBulkBlock = {
	type: 'bulk';
	/** Empty until the archer starts this step from a template. */
	path: string;
	label?: string;
};

/** Extensible block union — future types can be added here. */
export type RSessionBlock = RSessionTextBlock | RSessionScorecardBlock | RSessionBulkBlock;

export type RSessionLinkedBlock = RSessionScorecardBlock | RSessionBulkBlock;

export interface RSessionState {
	date: string;
	blocks: RSessionBlock[];
}

/** Same blocks as a session, without a date. Scorecards stay unstarted until a session is run. */
export interface RSessionTemplateState {
	blocks: RSessionBlock[];
}

/** @deprecated Prefer RSessionBlock; kept for migration helpers. */
export interface RSessionCard {
	type: string;
	path: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidSessionDate(date: string): boolean {
	if (!DATE_RE.test(date)) return false;
	const [year, month, day] = date.split('-').map((part) => Number.parseInt(part, 10));
	if (year === undefined || month === undefined || day === undefined) return false;
	const parsed = new Date(year, month - 1, day);
	return (
		parsed.getFullYear() === year &&
		parsed.getMonth() === month - 1 &&
		parsed.getDate() === day
	);
}

export function formatSessionDate(date = new Date()): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export function sessionBasename(date: string): string {
	return `Session ${date}`;
}

export function createRSessionState(
	date: string,
	blocks: RSessionBlock[] = [],
): RSessionState {
	return {
		date,
		blocks: blocks.map(cloneBlock),
	};
}

function cloneBlock(block: RSessionBlock): RSessionBlock {
	if (block.type === 'text') {
		return { type: 'text', content: block.content };
	}
	if (block.type === 'bulk') {
		return { type: 'bulk', path: block.path, label: block.label };
	}
	return { type: 'scorecard', path: block.path, label: block.label };
}

export function createRSessionTemplateState(blocks: RSessionBlock[] = []): RSessionTemplateState {
	return { blocks: blocks.map(cloneBlock) };
}

export function isPendingScorecard(block: RSessionBlock): block is RSessionScorecardBlock {
	return block.type === 'scorecard' && !block.path.trim();
}

export function isPendingBulk(block: RSessionBlock): block is RSessionBulkBlock {
	return block.type === 'bulk' && !block.path.trim();
}

export function isBulkBlock(block: RSessionBlock): block is RSessionBulkBlock {
	return block.type === 'bulk';
}

export function isScorecardBlock(block: RSessionBlock): block is RSessionScorecardBlock {
	return block.type === 'scorecard';
}

export function isTextBlock(block: RSessionBlock): block is RSessionTextBlock {
	return block.type === 'text';
}
