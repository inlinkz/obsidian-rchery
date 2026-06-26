import { endColorClass, formatScore, type ArrowShot } from './scorecard';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const SHOT_MARKER_SIZE_MIN = 1;
export const SHOT_MARKER_SIZE_MAX = 10;
export const DEFAULT_SHOT_MARKER_SIZE = 6;

export function normalizeShotMarkerSize(size: number): number {
	return Math.min(
		SHOT_MARKER_SIZE_MAX,
		Math.max(SHOT_MARKER_SIZE_MIN, Math.round(size)),
	);
}

export function markerRadiusForSize(size: number): number {
	const normalized = normalizeShotMarkerSize(size);
	if (normalized === 1) return 0.06;
	return 0.12 + ((normalized - 2) / (SHOT_MARKER_SIZE_MAX - 2)) * (0.55 - 0.12);
}

export function markerStrokeWidthForSize(size: number): number {
	const normalized = normalizeShotMarkerSize(size);
	if (normalized === 1) return 0;
	return 0.06 + ((normalized - 2) / (SHOT_MARKER_SIZE_MAX - 2)) * 0.06;
}

export function isMinimalShotMarkerSize(size: number): boolean {
	return normalizeShotMarkerSize(size) === 1;
}

export function markerPaddingForSize(size: number): number {
	return markerRadiusForSize(size) + 0.1;
}

export interface TargetMarkerOptions {
	endIndex?: number;
	preview?: boolean;
	filtered?: boolean;
	markerSize?: number;
	showScore?: boolean;
}

export function createTargetShotMarker(
	doc: Document,
	shot: ArrowShot,
	options: TargetMarkerOptions = {},
): SVGGElement {
	const markerSize = normalizeShotMarkerSize(options.markerSize ?? DEFAULT_SHOT_MARKER_SIZE);
	const minimal = isMinimalShotMarkerSize(markerSize);
	const radius = markerRadiusForSize(markerSize);
	const endIndex = options.endIndex;
	const colorClass = endIndex === undefined ? '' : endColorClass(endIndex);

	const group = doc.createElementNS(SVG_NS, 'g');
	group.setAttribute(
		'class',
		[
			'archery-target-marker',
			options.preview ? 'archery-target-marker-preview' : '',
			options.filtered ? 'archery-target-marker-filtered' : '',
			colorClass,
		]
			.filter(Boolean)
			.join(' '),
	);
	group.setAttribute('transform', `translate(${shot.x}, ${-shot.y!})`);

	const dot = doc.createElementNS(SVG_NS, 'circle');
	dot.setAttribute('r', String(radius));
	dot.setAttribute(
		'class',
		minimal
			? 'archery-target-marker-dot archery-target-marker-dot-minimal'
			: 'archery-target-marker-dot',
	);
	if (!minimal) {
		dot.setAttribute('stroke-width', String(markerStrokeWidthForSize(markerSize)));
	}
	group.appendChild(dot);

	if (!minimal && options.showScore !== false && shot.score !== null) {
		const label = doc.createElementNS(SVG_NS, 'text');
		label.setAttribute('y', String(-(radius + 0.2)));
		label.setAttribute('text-anchor', 'middle');
		label.setAttribute('class', 'archery-target-marker-label');
		label.textContent = formatScore(shot.score);
		group.appendChild(label);
	}

	return group;
}
