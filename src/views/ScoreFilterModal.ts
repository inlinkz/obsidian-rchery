import { App, Modal } from 'obsidian';
import { ScoreRangeSlider } from '../components/ScoreRangeSlider';
import {
	countMatchingShots,
	describeScoreFilter,
	EMPTY_SCORE_FILTER,
	isScoreFilterActive,
	normalizeScoreFilter,
	scoreFilterFromRange,
	scoreFilterToRange,
	type ScoreFilter,
} from '../model/scoreFilter';
import { collectTargetShots } from './renderReadonly';
import type { SessionState } from '../model/scorecard';

export class ScoreFilterModal extends Modal {
	private filter: ScoreFilter;
	private previewEl: HTMLElement | null = null;
	private onApply: (filter: ScoreFilter) => void;
	private state: SessionState;
	private rangeMin = 0;
	private rangeMax = 10;

	constructor(
		app: App,
		state: SessionState,
		initial: ScoreFilter,
		onApply: (filter: ScoreFilter) => void,
	) {
		super(app);
		this.titleEl.setText('Filter arrows by score');
		this.state = state;
		this.filter = { ...initial };
		const range = scoreFilterToRange(initial);
		this.rangeMin = range.min;
		this.rangeMax = range.max;
		this.onApply = onApply;
	}

	onOpen(): void {
		this.modalEl.addClass('archery-score-filter-modal-container');
		const { contentEl } = this;
		contentEl.addClass('archery-score-filter-modal');

		contentEl.createDiv({
			cls: 'archery-score-filter-hint',
			text: 'Drag the two handles to set an inclusive score range. Full range (Miss–10) shows every placed arrow.',
		});

		new ScoreRangeSlider(contentEl.createDiv({ cls: 'archery-score-range-slider-wrap' }), {
			min: this.rangeMin,
			max: this.rangeMax,
			onChange: (min, max) => {
				this.rangeMin = min;
				this.rangeMax = max;
				this.filter = scoreFilterFromRange(min, max);
				this.updatePreview();
			},
		});

		this.previewEl = contentEl.createDiv({ cls: 'archery-score-filter-preview' });
		this.updatePreview();

		const actions = contentEl.createDiv({ cls: 'archery-score-filter-actions' });
		if (isScoreFilterActive(this.filter)) {
			actions
				.createEl('button', { text: 'Clear filter', cls: 'mod-warning' })
				.addEventListener('click', () => {
					this.onApply(EMPTY_SCORE_FILTER);
					this.close();
				});
		}
		actions.createEl('button', { text: 'Cancel' }).addEventListener('click', () => {
			this.close();
		});
		actions
			.createEl('button', { text: 'Apply', cls: 'mod-cta' })
			.addEventListener('click', () => {
				this.onApply(scoreFilterFromRange(this.rangeMin, this.rangeMax));
				this.close();
			});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private updatePreview(): void {
		if (!this.previewEl) return;
		const normalized = normalizeScoreFilter(this.filter);
		const shots = collectTargetShots(this.state);
		const matchCount = countMatchingShots(shots, normalized);
		this.previewEl.empty();
		this.previewEl.createDiv({
			cls: 'archery-score-filter-preview-summary',
			text: describeScoreFilter(normalized),
		});
		this.previewEl.createDiv({
			cls: 'archery-score-filter-preview-count',
			text: `${matchCount} arrow${matchCount === 1 ? '' : 's'} with placement`,
		});
	}
}
