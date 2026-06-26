import { MISS_SCORE } from '../model/scorecard';

const MIN_SCORE = MISS_SCORE;
const MAX_SCORE = 10;
const SCORE_SPAN = MAX_SCORE - MIN_SCORE;

export interface ScoreRangeSliderOptions {
	min: number;
	max: number;
	onChange: (min: number, max: number) => void;
}

export class ScoreRangeSlider {
	private root: HTMLElement;
	private minHandle: HTMLElement;
	private maxHandle: HTMLElement;
	private rangeFill: HTMLElement;
	private minLabel: HTMLElement;
	private maxLabel: HTMLElement;
	private track: HTMLElement;
	private minValue: number;
	private maxValue: number;
	private onChange: (min: number, max: number) => void;
	private activeHandle: 'min' | 'max' | null = null;

	constructor(parent: HTMLElement, options: ScoreRangeSliderOptions) {
		this.minValue = options.min;
		this.maxValue = options.max;
		this.onChange = options.onChange;

		this.root = parent.createDiv({ cls: 'archery-score-range-slider' });

		const values = this.root.createDiv({ cls: 'archery-score-range-values' });
		this.minLabel = values.createDiv({ cls: 'archery-score-range-value archery-score-range-value-min' });
		this.maxLabel = values.createDiv({ cls: 'archery-score-range-value archery-score-range-value-max' });

		this.track = this.root.createDiv({ cls: 'archery-score-range-track' });
		this.rangeFill = this.track.createDiv({ cls: 'archery-score-range-fill' });
		this.minHandle = this.track.createDiv({
			cls: 'archery-score-range-handle archery-score-range-handle-min',
			attr: { role: 'slider', 'aria-label': 'Minimum score' },
		});
		this.maxHandle = this.track.createDiv({
			cls: 'archery-score-range-handle archery-score-range-handle-max',
			attr: { role: 'slider', 'aria-label': 'Maximum score' },
		});

		const ticks = this.root.createDiv({ cls: 'archery-score-range-ticks' });
		for (let score = MIN_SCORE; score <= MAX_SCORE; score++) {
			const tick = ticks.createDiv({ cls: 'archery-score-range-tick' });
			tick.createDiv({ cls: 'archery-score-range-tick-mark' });
			tick.createDiv({
				cls: 'archery-score-range-tick-label',
				text: score === MISS_SCORE ? 'M' : String(score),
			});
		}

		this.minHandle.addEventListener('pointerdown', (event) => this.startDrag('min', event));
		this.maxHandle.addEventListener('pointerdown', (event) => this.startDrag('max', event));
		this.track.addEventListener('pointerdown', (event) => this.onTrackPointerDown(event));

		this.render();
	}

	destroy(): void {
		this.root.remove();
	}

	private startDrag(handle: 'min' | 'max', event: PointerEvent): void {
		event.preventDefault();
		event.stopPropagation();
		this.activeHandle = handle;
		const move = (moveEvent: PointerEvent) => this.onPointerMove(moveEvent);
		const up = () => {
			this.activeHandle = null;
			this.root.ownerDocument.removeEventListener('pointermove', move);
			this.root.ownerDocument.removeEventListener('pointerup', up);
			this.root.ownerDocument.removeEventListener('pointercancel', up);
		};
		this.root.ownerDocument.addEventListener('pointermove', move);
		this.root.ownerDocument.addEventListener('pointerup', up);
		this.root.ownerDocument.addEventListener('pointercancel', up);
		this.onPointerMove(event);
	}

	private onTrackPointerDown(event: PointerEvent): void {
		if (event.target !== this.track && event.target !== this.rangeFill) return;
		const score = this.scoreFromPointer(event.clientX);
		const distToMin = Math.abs(score - this.minValue);
		const distToMax = Math.abs(score - this.maxValue);
		this.startDrag(distToMin <= distToMax ? 'min' : 'max', event);
	}

	private onPointerMove(event: PointerEvent): void {
		if (!this.activeHandle) return;
		const score = this.scoreFromPointer(event.clientX);
		if (this.activeHandle === 'min') {
			this.minValue = Math.min(score, this.maxValue);
		} else {
			this.maxValue = Math.max(score, this.minValue);
		}
		this.render();
		this.onChange(this.minValue, this.maxValue);
	}

	private scoreFromPointer(clientX: number): number {
		const rect = this.track.getBoundingClientRect();
		const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
		return Math.round(ratio * SCORE_SPAN) + MIN_SCORE;
	}

	private percentForScore(score: number): number {
		return ((score - MIN_SCORE) / SCORE_SPAN) * 100;
	}

	private formatScore(score: number): string {
		return score === MISS_SCORE ? 'Miss' : String(score);
	}

	private render(): void {
		const minPct = this.percentForScore(this.minValue);
		const maxPct = this.percentForScore(this.maxValue);
		this.minHandle.style.left = `${minPct}%`;
		this.maxHandle.style.left = `${maxPct}%`;
		this.rangeFill.style.left = `${minPct}%`;
		this.rangeFill.style.width = `${maxPct - minPct}%`;
		this.minLabel.setText(`Min: ${this.formatScore(this.minValue)}`);
		this.maxLabel.setText(`Max: ${this.formatScore(this.maxValue)}`);
		this.minHandle.setAttribute('aria-valuenow', String(this.minValue));
		this.maxHandle.setAttribute('aria-valuenow', String(this.maxValue));
	}
}
