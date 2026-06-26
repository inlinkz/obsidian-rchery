import {
	applyScoreColorClass,
	cardGrandTotal,
	endColorClass,
	endIsComplete,
	formatEndScoreDisplay,
	formatScore,
	gridColumnStyle,
	sessionGrandTotal,
	type ArrowShot,
	type Scorecard,
	type SessionState,
} from '../model/scorecard';
import { ringFillClass, TARGET_RADIUS } from '../model/targetScoring';
import { createTargetShotMarker, DEFAULT_SHOT_MARKER_SIZE } from '../model/targetMarker';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function sessionHasTargetCoords(state: SessionState): boolean {
	for (const card of state.cards) {
		for (const end of card.ends) {
			for (const shot of end) {
				if (shot.score !== null && shot.x !== null && shot.y !== null) {
					return true;
				}
			}
		}
	}
	return false;
}

export function collectTargetShots(state: SessionState): ArrowShot[] {
	const shots: ArrowShot[] = [];
	for (const card of state.cards) {
		for (const end of card.ends) {
			for (const shot of end) {
				if (shot.score !== null && shot.x !== null && shot.y !== null) {
					shots.push(shot);
				}
			}
		}
	}
	return shots;
}

export function renderReadonlyTarget(
	parent: HTMLElement,
	shots: ArrowShot[],
	markerSize = DEFAULT_SHOT_MARKER_SIZE,
	showShotScores = true,
): void {
	const wrap = parent.createDiv({ cls: 'archery-target-face archery-target-face-readonly' });
	const doc = wrap.ownerDocument;
	const svg = doc.createElementNS(SVG_NS, 'svg');
	svg.setAttribute(
		'viewBox',
		`${-TARGET_RADIUS - 1} ${-TARGET_RADIUS - 1} ${TARGET_RADIUS * 2 + 2} ${TARGET_RADIUS * 2 + 2}`,
	);
	svg.setAttribute('class', 'archery-target-svg');
	wrap.appendChild(svg);

	for (let score = 1; score <= 10; score++) {
		const circle = doc.createElementNS(SVG_NS, 'circle');
		circle.setAttribute('cx', '0');
		circle.setAttribute('cy', '0');
		circle.setAttribute('r', String(11 - score));
		circle.setAttribute('class', `archery-target-ring ${ringFillClass(score)}`);
		svg.appendChild(circle);
	}

	const border = doc.createElementNS(SVG_NS, 'circle');
	border.setAttribute('cx', '0');
	border.setAttribute('cy', '0');
	border.setAttribute('r', String(TARGET_RADIUS));
	border.setAttribute('class', 'archery-target-border');
	svg.appendChild(border);

	const markersLayer = doc.createElementNS(SVG_NS, 'g');
	markersLayer.setAttribute('class', 'archery-target-markers');
	svg.appendChild(markersLayer);

	for (const shot of shots) {
		markersLayer.appendChild(
			createTargetShotMarker(doc, shot, { markerSize, showScore: showShotScores }),
		);
	}
}

export function collectEndTargetShots(end: ArrowShot[]): ArrowShot[] {
	return end.filter((shot) => shot.score !== null && shot.x !== null && shot.y !== null);
}

export function endHasReviewContent(scorecard: Scorecard, endIndex: number): boolean {
	const arrows = scorecard.ends[endIndex];
	const hasScore = arrows?.some((shot) => shot.score !== null) ?? false;
	const hasNote = (scorecard.endNotes[endIndex]?.trim().length ?? 0) > 0;
	return hasScore || hasNote;
}

export function renderReadonlyEndTarget(
	parent: HTMLElement,
	shots: ArrowShot[],
	endIndex: number,
	markerSize = DEFAULT_SHOT_MARKER_SIZE,
	showShotScores = true,
): void {
	const wrap = parent.createDiv({ cls: 'archery-target-face archery-target-face-readonly' });
	const doc = wrap.ownerDocument;
	const svg = doc.createElementNS(SVG_NS, 'svg');
	svg.setAttribute(
		'viewBox',
		`${-TARGET_RADIUS - 1} ${-TARGET_RADIUS - 1} ${TARGET_RADIUS * 2 + 2} ${TARGET_RADIUS * 2 + 2}`,
	);
	svg.setAttribute('class', 'archery-target-svg');
	wrap.appendChild(svg);

	for (let score = 1; score <= 10; score++) {
		const circle = doc.createElementNS(SVG_NS, 'circle');
		circle.setAttribute('cx', '0');
		circle.setAttribute('cy', '0');
		circle.setAttribute('r', String(11 - score));
		circle.setAttribute('class', `archery-target-ring ${ringFillClass(score)}`);
		svg.appendChild(circle);
	}

	const border = doc.createElementNS(SVG_NS, 'circle');
	border.setAttribute('cx', '0');
	border.setAttribute('cy', '0');
	border.setAttribute('r', String(TARGET_RADIUS));
	border.setAttribute('class', 'archery-target-border');
	svg.appendChild(border);

	const markersLayer = doc.createElementNS(SVG_NS, 'g');
	markersLayer.setAttribute('class', 'archery-target-markers');
	svg.appendChild(markersLayer);

	for (const shot of shots) {
		markersLayer.appendChild(
			createTargetShotMarker(doc, shot, { endIndex, markerSize, showScore: showShotScores }),
		);
	}
}

export function renderEndReviewScores(
	parent: HTMLElement,
	scorecard: Scorecard,
	endIndex: number,
	arrowsPerEnd: number,
): void {
	const arrows = scorecard.ends[endIndex];
	if (!arrows) return;

	const row = parent.createDiv({ cls: 'archery-review-scores' });
	let hasAny = false;

	for (let arrow = 0; arrow < arrowsPerEnd; arrow++) {
		const shot = arrows[arrow];
		const score = shot?.score ?? null;
		const cell = row.createDiv({ cls: 'archery-review-score' });
		cell.setText(formatScore(score));
		if (score !== null) {
			hasAny = true;
			cell.addClass('archery-cell-filled');
			applyScoreColorClass(cell, score);
		}
	}

	if (hasAny) {
		const total = row.createDiv({ cls: 'archery-review-score-total' });
		total.setText(formatEndScoreDisplay(scorecard, endIndex));
		if (endIsComplete(arrows)) {
			total.addClass('archery-cell-complete');
		}
	}
}

export function renderReadonlySessionTables(parent: HTMLElement, state: SessionState): void {
	const { config } = state;
	const grids = parent.createDiv({
		cls: config.cardsCount > 1 ? 'archery-grids archery-grids--multi' : 'archery-grids',
	});

	for (let cardIndex = 0; cardIndex < config.cardsCount; cardIndex++) {
		renderReadonlyScorecard(grids, state, cardIndex);
	}

	const footer = parent.createDiv({ cls: 'archery-embed-footer' });
	footer.setText(`Grand total: ${sessionGrandTotal(state)}`);
}

function renderReadonlyScorecard(
	parent: HTMLElement,
	state: SessionState,
	cardIndex: number,
): void {
	const { config } = state;
	const scorecard = state.cards[cardIndex];
	if (!scorecard) return;

	const section = parent.createDiv({ cls: 'archery-scorecard-section' });
	if (config.cardsCount > 1) {
		section.createEl('h4', { text: `Scorecard ${cardIndex + 1}` });
	}

	const grid = section.createDiv({ cls: 'archery-scorecard-grid archery-scorecard-grid--compact' });

	const headerRow = grid.createDiv({ cls: 'archery-grid-row archery-grid-header' });
	headerRow.style.gridTemplateColumns = gridColumnStyle(config.arrowsPerEnd);
	headerRow.createDiv({ cls: 'archery-cell archery-cell-label', text: 'End' });
	headerRow.createDiv({ cls: 'archery-cell archery-cell-header archery-cell-note-header' });
	for (let arrow = 1; arrow <= config.arrowsPerEnd; arrow++) {
		headerRow.createDiv({
			cls: 'archery-cell archery-cell-header',
			text: String(arrow),
		});
	}
	headerRow.createDiv({ cls: 'archery-cell archery-cell-header', text: 'Total' });

	for (let end = 0; end < config.endsPerCard; end++) {
		const arrows = scorecard.ends[end];
		if (!arrows) continue;

		const row = grid.createDiv({ cls: 'archery-grid-row' });
		row.style.gridTemplateColumns = gridColumnStyle(config.arrowsPerEnd);
		row.createDiv({ cls: 'archery-cell archery-cell-label', text: String(end + 1) });
		row.createDiv({ cls: 'archery-cell archery-cell-note' });

		for (let arrow = 0; arrow < config.arrowsPerEnd; arrow++) {
			const shot = arrows[arrow];
			const score = shot?.score ?? null;
			const cell = row.createDiv({ cls: 'archery-cell archery-cell-score' });
			cell.setText(formatScore(score));
			if (score !== null) {
				cell.addClass('archery-cell-filled');
				applyScoreColorClass(cell, score);
			}
		}

		const hasAny = arrows.some((shot) => shot.score !== null);
		const totalCell = row.createDiv({ cls: 'archery-cell archery-cell-total' });
		totalCell.setText(hasAny ? formatEndScoreDisplay(scorecard, end) : '');
		if (endIsComplete(arrows)) {
			totalCell.addClass('archery-cell-complete');
		}
	}

	if (config.cardsCount > 1) {
		const cardTotal = section.createDiv({ cls: 'archery-embed-card-total' });
		cardTotal.setText(`Total: ${cardGrandTotal(scorecard)}`);
	}
}
