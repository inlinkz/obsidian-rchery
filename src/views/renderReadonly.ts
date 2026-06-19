import {
	applyScoreColorClass,
	cardGrandTotal,
	endIsComplete,
	endTotal,
	formatScore,
	gridColumnStyle,
	sessionGrandTotal,
	type ArrowShot,
	type SessionState,
} from '../model/scorecard';
import { ringFillClass, TARGET_RADIUS } from '../model/targetScoring';

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

export function renderReadonlyTarget(parent: HTMLElement, shots: ArrowShot[]): void {
	const wrap = parent.createDiv({ cls: 'archery-target-face archery-target-face-readonly' });
	const svg = activeDocument.createElementNS(SVG_NS, 'svg');
	svg.setAttribute(
		'viewBox',
		`${-TARGET_RADIUS - 1} ${-TARGET_RADIUS - 1} ${TARGET_RADIUS * 2 + 2} ${TARGET_RADIUS * 2 + 2}`,
	);
	svg.setAttribute('class', 'archery-target-svg');
	wrap.appendChild(svg);

	for (let score = 1; score <= 10; score++) {
		const circle = activeDocument.createElementNS(SVG_NS, 'circle');
		circle.setAttribute('cx', '0');
		circle.setAttribute('cy', '0');
		circle.setAttribute('r', String(11 - score));
		circle.setAttribute('class', `archery-target-ring ${ringFillClass(score)}`);
		svg.appendChild(circle);
	}

	const border = activeDocument.createElementNS(SVG_NS, 'circle');
	border.setAttribute('cx', '0');
	border.setAttribute('cy', '0');
	border.setAttribute('r', String(TARGET_RADIUS));
	border.setAttribute('class', 'archery-target-border');
	svg.appendChild(border);

	const markersLayer = activeDocument.createElementNS(SVG_NS, 'g');
	markersLayer.setAttribute('class', 'archery-target-markers');
	svg.appendChild(markersLayer);

	for (const shot of shots) {
		markersLayer.appendChild(createMarker(shot));
	}
}

function createMarker(shot: ArrowShot): SVGGElement {
	const group = activeDocument.createElementNS(SVG_NS, 'g');
	group.setAttribute('class', 'archery-target-marker');
	group.setAttribute('transform', `translate(${shot.x}, ${-shot.y!})`);

	const dot = activeDocument.createElementNS(SVG_NS, 'circle');
	dot.setAttribute('r', '0.35');
	dot.setAttribute('class', 'archery-target-marker-dot');
	group.appendChild(dot);

	const label = activeDocument.createElementNS(SVG_NS, 'text');
	label.setAttribute('y', '-0.55');
	label.setAttribute('text-anchor', 'middle');
	label.setAttribute('class', 'archery-target-marker-label');
	label.textContent = formatScore(shot.score);
	group.appendChild(label);

	return group;
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
		totalCell.setText(hasAny ? String(endTotal(arrows)) : '');
		if (endIsComplete(arrows)) {
			totalCell.addClass('archery-cell-complete');
		}
	}

	if (config.cardsCount > 1) {
		const cardTotal = section.createDiv({ cls: 'archery-embed-card-total' });
		cardTotal.setText(`Total: ${cardGrandTotal(scorecard)}`);
	}
}
