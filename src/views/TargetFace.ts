import {
	clientToTargetCoords,
	ringFillClass,
	scoreFromPoint,
	TARGET_RADIUS,
} from '../model/targetScoring';
import {
	endColorClass,
	formatScore,
	nextCursor,
	type ArrowShot,
	type SessionState,
} from '../model/scorecard';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface TargetFaceOptions {
	cardIndex: number;
	touchOffsetY: number;
	onPlace: (x: number, y: number, score: number) => void;
}

export class TargetFace {
	private doc: Document;
	private root: HTMLElement;
	private svg: SVGSVGElement;
	private markersLayer: SVGGElement;
	private previewMarker: SVGGElement | null = null;
	private cardIndex: number;
	private touchOffsetY: number;
	private visibleEnds = new Set<number>();
	private currentEndIndex: number | null = null;
	private onPlace: (x: number, y: number, score: number) => void;
	private dragging = false;
	private active = false;

	constructor(parent: HTMLElement, options: TargetFaceOptions) {
		this.cardIndex = options.cardIndex;
		this.touchOffsetY = options.touchOffsetY;
		this.onPlace = options.onPlace;

		this.root = parent.createDiv({ cls: 'archery-target-face' });
		this.doc = this.root.ownerDocument;
		this.svg = this.doc.createElementNS(SVG_NS, 'svg');
		this.svg.setAttribute(
			'viewBox',
			`${-TARGET_RADIUS - 1} ${-TARGET_RADIUS - 1} ${TARGET_RADIUS * 2 + 2} ${TARGET_RADIUS * 2 + 2}`,
		);
		this.svg.setAttribute('class', 'archery-target-svg');
		this.root.appendChild(this.svg);

		this.drawRings();
		this.markersLayer = this.doc.createElementNS(SVG_NS, 'g');
		this.markersLayer.setAttribute('class', 'archery-target-markers');
		this.svg.appendChild(this.markersLayer);

		this.svg.addEventListener('pointerdown', this.onPointerDown);
		this.svg.addEventListener('pointermove', this.onPointerMove);
		this.svg.addEventListener('pointerup', this.onPointerUp);
		this.svg.addEventListener('pointerleave', this.onPointerLeave);
	}

	destroy(): void {
		this.svg.removeEventListener('pointerdown', this.onPointerDown);
		this.svg.removeEventListener('pointermove', this.onPointerMove);
		this.svg.removeEventListener('pointerup', this.onPointerUp);
		this.svg.removeEventListener('pointerleave', this.onPointerLeave);
		this.root.remove();
	}

	update(state: SessionState, visibleEnds: Set<number>, touchOffsetY: number): void {
		this.touchOffsetY = touchOffsetY;
		this.visibleEnds = visibleEnds;

		const cursor = nextCursor(state);
		this.currentEndIndex =
			cursor !== null && cursor.card === this.cardIndex ? cursor.end : null;
		this.active = cursor !== null && cursor.card === this.cardIndex;
		this.root.toggleClass('archery-target-face-active', this.active);
		this.root.toggleClass('archery-target-face-inactive', !this.active);
		this.svg.style.pointerEvents = this.active ? 'auto' : 'none';

		this.renderMarkers(state);
		if (!this.dragging) {
			this.clearPreview();
		}
	}

	private drawRings(): void {
		for (let score = 1; score <= 10; score++) {
			const circle = this.doc.createElementNS(SVG_NS, 'circle');
			circle.setAttribute('cx', '0');
			circle.setAttribute('cy', '0');
			circle.setAttribute('r', String(11 - score));
			circle.setAttribute('class', `archery-target-ring ${ringFillClass(score)}`);
			this.svg.appendChild(circle);
		}

		const border = this.doc.createElementNS(SVG_NS, 'circle');
		border.setAttribute('cx', '0');
		border.setAttribute('cy', '0');
		border.setAttribute('r', String(TARGET_RADIUS));
		border.setAttribute('class', 'archery-target-border');
		this.svg.appendChild(border);
	}

	private renderMarkers(state: SessionState): void {
		this.markersLayer.replaceChildren();

		const scorecard = state.cards[this.cardIndex];
		if (!scorecard) return;

		for (const endIndex of this.visibleEnds) {
			const end = scorecard.ends[endIndex];
			if (!end) continue;
			for (const shot of end) {
				if (shot.x === null || shot.y === null || shot.score === null) continue;
				this.markersLayer.appendChild(this.createMarker(shot, false, endIndex));
			}
		}
	}

	private createMarker(shot: ArrowShot, preview: boolean, endIndex: number): SVGGElement {
		const group = this.doc.createElementNS(SVG_NS, 'g');
		const colorClass = endColorClass(endIndex);
		group.setAttribute(
			'class',
			preview
				? `archery-target-marker archery-target-marker-preview ${colorClass}`
				: `archery-target-marker ${colorClass}`,
		);
		group.setAttribute('transform', `translate(${shot.x}, ${-shot.y!})`);

		const dot = this.doc.createElementNS(SVG_NS, 'circle');
		dot.setAttribute('r', '0.35');
		dot.setAttribute('class', 'archery-target-marker-dot');
		group.appendChild(dot);

		const label = this.doc.createElementNS(SVG_NS, 'text');
		label.setAttribute('y', '-0.55');
		label.setAttribute('text-anchor', 'middle');
		label.setAttribute('class', 'archery-target-marker-label');
		label.textContent = formatScore(shot.score);
		group.appendChild(label);

		return group;
	}

	private onPointerDown = (event: PointerEvent): void => {
		if (!this.active || event.button !== 0) return;
		this.dragging = true;
		this.svg.setPointerCapture(event.pointerId);
		this.updatePreview(event.clientX, event.clientY);
	};

	private onPointerMove = (event: PointerEvent): void => {
		if (!this.dragging) return;
		this.updatePreview(event.clientX, event.clientY);
	};

	private arrowCoordsFromTouch(clientX: number, clientY: number): { x: number; y: number } {
		return clientToTargetCoords(this.svg, clientX, clientY, this.touchOffsetY);
	}

	private onPointerUp = (event: PointerEvent): void => {
		if (!this.dragging) return;
		this.dragging = false;
		this.svg.releasePointerCapture(event.pointerId);

		const { x, y } = this.arrowCoordsFromTouch(event.clientX, event.clientY);
		const score = scoreFromPoint(x, y);
		this.clearPreview();
		if (score !== null) {
			this.onPlace(x, y, score);
		}
	};

	private onPointerLeave = (): void => {
		if (!this.dragging) return;
		this.clearPreview();
	};

	private updatePreview(clientX: number, clientY: number): void {
		const { x, y } = this.arrowCoordsFromTouch(clientX, clientY);
		const score = scoreFromPoint(x, y);
		this.clearPreview();
		if (score === null) return;

		const endIndex = this.currentEndIndex ?? 0;
		this.previewMarker = this.createMarker({ score, x, y }, true, endIndex);
		this.markersLayer.appendChild(this.previewMarker);
	}

	private clearPreview(): void {
		this.previewMarker = null;
		this.markersLayer
			.querySelectorAll('.archery-target-marker-preview')
			.forEach((el) => el.remove());
	}
}
