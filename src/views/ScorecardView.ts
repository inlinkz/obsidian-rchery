import { Component, FileView, Notice, WorkspaceLeaf, setIcon, type TFile } from 'obsidian';
import type ArcheryPlugin from '../main';
import {
	applyScore,
	applyScoreAt,
	applyEndColorClass,
	applyScoreColorClass,
	cardGrandTotal,
	createSessionState,
	endIsComplete,
	endTotal,
	formatEndScoreDisplay,
	formatScore,
	getEndNote,
	gridColumnStyle,
	hasAnyScore,
	hasEndNote,
	MISS_SCORE,
	nextCursor,
	resizeSessionState,
	scoreColorClass,
	setEndNote,
	shotHasPlacement,
	sessionGrandTotal,
	undoLast,
	type SessionConfig,
	type SessionState,
} from '../model/scorecard';
import {
	parseScorecardBlock,
	serializeSession,
} from '../services/markdownSync';
import { getAllPresets, type LayoutPreset } from '../settings';
import { isScoreFilterActive, describeScoreFilter, type ScoreFilter, EMPTY_SCORE_FILTER } from '../model/scoreFilter';
import { EndNoteModal } from './EndNoteModal';
import { EndEllipseModal } from './EndEllipseModal';
import { ScoreFilterModal } from './ScoreFilterModal';
import { renderSessionReview } from './renderSessionReview';
import { TargetFace } from './TargetFace';

export const VIEW_TYPE_SCORECARD = 'obsidian-archery-scorecard';

type ViewMode = 'view' | 'edit';

interface CellRef {
	el: HTMLElement;
}

interface EndLabelRef {
	el: HTMLElement;
}

interface EndTotalRef {
	el: HTMLElement;
	valueEl: HTMLElement;
	visibilityZone?: HTMLElement;
}

export class ScorecardView extends FileView {
	private plugin: ArcheryPlugin;
	private state: SessionState = createSessionState();
	private mode: ViewMode = 'view';
	private cellRefs: CellRef[][][] = [];
	private endTotalRefs: EndTotalRef[][] = [];
	private grandTotalEls: HTMLElement[] = [];
	private combinedTotalEl: HTMLElement | null = null;
	private headerEl: HTMLElement | null = null;
	private modeActionBtn: HTMLElement | null = null;
	private targetActionBtn: HTMLElement | null = null;
	private filterActionBtn: HTMLElement | null = null;
	private ellipseActionBtn: HTMLElement | null = null;
	private reviewActionBtn: HTMLElement | null = null;
	private viewContainer: HTMLElement | null = null;
	private scrollBodyEl: HTMLElement | null = null;
	private editContainer: HTMLElement | null = null;
	private sourceEditor: HTMLTextAreaElement | null = null;
	private scorePadEl: HTMLElement | null = null;
	private showTargetFace = false;
	private showReview = false;
	private reviewComponent = new Component();
	private targetFaces: TargetFace[] = [];
	private endLabelRefs: EndLabelRef[][] = [];
	private totalHeaderRefs: HTMLElement[] = [];
	private arrowHeaderRefs: HTMLElement[][] = [];
	private visibleEndsPerCard: Set<number>[] = [];
	private visibleArrowsPerCard: Set<number>[] = [];
	private scoreFilter: ScoreFilter = { ...EMPTY_SCORE_FILTER };

	constructor(leaf: WorkspaceLeaf, plugin: ArcheryPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_SCORECARD;
	}

	onPresetsChanged(): void {
		if (this.file && this.mode === 'view') {
			this.renderViewMode();
		}
	}

	onSettingsChanged(): void {
		if (this.file && this.mode === 'view') {
			if (this.showTargetFace) {
				this.refreshTargetFaces();
			}
			this.updateModeUi();
		}
	}

	getDisplayText(): string {
		return this.file?.basename ?? 'Archery scorecard';
	}

	getIcon(): string {
		return 'target';
	}

	async onOpen(): Promise<void> {
		this.ensureModeAction();
		this.ensureTargetAction();
		this.ensureFilterAction();
		this.ensureEllipseAction();
		this.ensureReviewAction();
		this.updateModeUi();
	}

	private ensureModeAction(): void {
		if (this.modeActionBtn) return;
		this.modeActionBtn = this.addAction('code-glyph', 'Edit source', () => {
			this.toggleMode();
		});
	}

	private ensureTargetAction(): void {
		if (this.targetActionBtn) return;
		this.targetActionBtn = this.addAction('target', 'Show target face', () => {
			this.toggleTargetFace();
		});
	}

	private ensureFilterAction(): void {
		if (this.filterActionBtn) return;
		this.filterActionBtn = this.addAction('filter', 'Filter arrows by score', () => {
			this.openScoreFilterModal();
		});
		this.filterActionBtn.addClass('archery-score-filter-action');
	}

	private openScoreFilterModal(): void {
		if (this.mode !== 'view') return;
		new ScoreFilterModal(this.app, this.state, this.scoreFilter, (filter) => {
			this.applyScoreFilter(filter);
		}).open();
	}

	private applyScoreFilter(filter: ScoreFilter): void {
		this.scoreFilter = filter;
		if (isScoreFilterActive(filter) && !this.showTargetFace) {
			this.showTargetFace = true;
			this.initVisibleEnds();
			this.initVisibleArrows();
			this.renderViewMode();
		} else {
			this.refreshTargetFaces();
		}
		this.updateModeUi();
	}

	private ensureEllipseAction(): void {
		if (this.ellipseActionBtn) return;
		this.ellipseActionBtn = this.addAction('eye', 'End group ellipses', () => {
			this.openEndEllipseModal();
		});
		this.ellipseActionBtn.addClass('archery-end-ellipse-action');
	}

	private openEndEllipseModal(): void {
		if (this.mode !== 'view') return;
		new EndEllipseModal(this.app, this.plugin, () => {
			if (this.plugin.settings.showEndEllipses && !this.showTargetFace) {
				this.showTargetFace = true;
				this.initVisibleEnds();
				this.initVisibleArrows();
				this.renderViewMode();
			} else {
				this.refreshTargetFaces();
			}
			this.updateModeUi();
		}).open();
	}

	private ensureReviewAction(): void {
		if (this.reviewActionBtn) return;
		this.reviewActionBtn = this.addAction('book-open', 'Review ends', () => {
			this.toggleReview();
		});
	}

	private toggleReview(): void {
		if (this.mode !== 'view') return;
		this.showReview = !this.showReview;
		this.renderViewMode();
		this.updateModeUi();
	}

	private toggleMode(): void {
		this.setMode(this.mode === 'view' ? 'edit' : 'view');
	}

	private toggleTargetFace(): void {
		this.showTargetFace = !this.showTargetFace;
		if (this.showTargetFace) {
			this.initVisibleEnds();
			this.initVisibleArrows();
		}
		this.renderViewMode();
		this.updateModeUi();
	}

	async onLoadFile(file: TFile): Promise<void> {
		const content = await this.app.vault.read(file);
		this.state = parseScorecardBlock(content) ?? createSessionState();
		this.mode = 'view';
		this.showReview = false;
		this.scoreFilter = { ...EMPTY_SCORE_FILTER };
		this.visibleEndsPerCard = [];
		this.visibleArrowsPerCard = [];
		this.render();
	}

	async onUnloadFile(_file: TFile): Promise<void> {
		this.reviewComponent.unload();
		this.contentEl.empty();
		this.resetRefs();
	}

	private resetRefs(): void {
		this.cellRefs = [];
		this.endTotalRefs = [];
		this.grandTotalEls = [];
		this.combinedTotalEl = null;
		this.headerEl = null;
		this.viewContainer = null;
		this.scrollBodyEl = null;
		this.editContainer = null;
		this.sourceEditor = null;
		this.scorePadEl = null;
		this.targetFaces = [];
		this.endLabelRefs = [];
		this.totalHeaderRefs = [];
		this.arrowHeaderRefs = [];
	}

	private render(): void {
		const container = this.contentEl;
		container.empty();
		container.addClass('archery-scorecard-view');
		this.resetRefs();

		this.headerEl = container.createDiv({ cls: 'archery-header' });

		this.headerEl.createEl('h3', { text: this.file?.basename ?? 'Archery Scorecard' });
		this.renderConfigLabel();

		this.viewContainer = container.createDiv({ cls: 'archery-view-container' });
		this.editContainer = container.createDiv({ cls: 'archery-edit-container' });

		this.renderViewMode();
		this.renderEditMode();
		this.updateModeUi();
	}

	private renderConfigLabel(): void {
		const existing = this.headerEl?.querySelector('.archery-note-label');
		existing?.remove();

		const { config } = this.state;
		this.headerEl?.createDiv({
			cls: 'archery-note-label',
			text: `${this.file?.path ?? ''} · ${config.cardsCount}×${config.endsPerCard}×${config.arrowsPerEnd} (cards×ends×arrows)`,
		});
	}

	private renderViewMode(): void {
		if (!this.viewContainer) return;
		this.destroyTargetFaces();
		this.reviewComponent.unload();
		this.reviewComponent = new Component();
		this.viewContainer.empty();

		if (this.showReview) {
			this.renderReviewView();
			return;
		}

		const { config } = this.state;
		this.cellRefs = Array.from({ length: config.cardsCount }, () => []);
		this.endTotalRefs = Array.from({ length: config.cardsCount }, () => []);
		this.endLabelRefs = Array.from({ length: config.cardsCount }, () => []);
		this.totalHeaderRefs = [];
		this.arrowHeaderRefs = Array.from({ length: config.cardsCount }, () => []);
		this.ensureVisibleEnds();
		this.ensureVisibleArrows();
		this.grandTotalEls = [];
		this.combinedTotalEl = null;

		this.scrollBodyEl = this.viewContainer.createDiv({ cls: 'archery-scroll-body' });

		this.renderPresetPanel(this.scrollBodyEl);

		const grids = this.scrollBodyEl.createDiv({
			cls: config.cardsCount > 1 ? 'archery-grids archery-grids--multi' : 'archery-grids',
		});
		for (let card = 0; card < config.cardsCount; card++) {
			this.renderScorecard(grids, card);
		}

		const stickyFooter = this.viewContainer.createDiv({ cls: 'archery-sticky-footer' });

		const partialTotals = stickyFooter.createDiv({ cls: 'archery-partial-totals' });
		for (let card = 0; card < config.cardsCount; card++) {
			const item = partialTotals.createDiv({ cls: 'archery-partial-total-item' });
			item.createSpan({ cls: 'archery-partial-total-label', text: `Card ${card + 1}` });
			const totalEl = item.createSpan({ cls: 'archery-partial-total-value' });
			totalEl.setText('0');
			this.grandTotalEls[card] = totalEl;
		}

		this.scorePadEl = stickyFooter.createDiv({ cls: 'archery-score-pad' });
		this.renderScorePad();

		const grandTotalBar = stickyFooter.createDiv({ cls: 'archery-grand-total-bar' });
		const grandTotalHeading = grandTotalBar.createEl('h1', { cls: 'archery-grand-total-h1' });
		grandTotalHeading.createSpan({ cls: 'archery-grand-total-label', text: 'Grand total' });
		this.combinedTotalEl = grandTotalHeading.createSpan({ cls: 'archery-grand-total-value' });
		this.combinedTotalEl.setText('0');

		const undoBtn = grandTotalBar.createEl('button', {
			cls: 'archery-undo-btn',
			text: 'Undo',
		});
		undoBtn.addEventListener('click', () => this.handleUndo());

		this.refreshAllCells();
		this.refreshEndLabels();
	}

	private renderReviewView(): void {
		if (!this.viewContainer) return;
		this.reviewComponent.load();
		const wrap = this.viewContainer.createDiv({ cls: 'archery-session-review-inline' });
		renderSessionReview(
			wrap,
			this.state,
			this.file?.path ?? '',
			this.reviewComponent,
			this.plugin.settings.targetShotMarkerSize,
			this.plugin.settings.showShotScores,
		);
	}

	private ensureVisibleEnds(): void {
		const { cardsCount } = this.state.config;
		while (this.visibleEndsPerCard.length < cardsCount) {
			this.visibleEndsPerCard.push(new Set());
		}
		this.visibleEndsPerCard.length = cardsCount;
	}

	private initVisibleEnds(): void {
		this.ensureVisibleEnds();
		const cursor = nextCursor(this.state);
		for (let card = 0; card < this.state.config.cardsCount; card++) {
			const set = this.visibleEndsPerCard[card]!;
			if (set.size > 0) continue;
			const end = cursor?.card === card ? cursor.end : 0;
			set.add(end);
		}
	}

	private ensureVisibleArrows(): void {
		const { cardsCount, arrowsPerEnd } = this.state.config;
		while (this.visibleArrowsPerCard.length < cardsCount) {
			this.visibleArrowsPerCard.push(new Set());
		}
		this.visibleArrowsPerCard.length = cardsCount;
		for (let card = 0; card < cardsCount; card++) {
			const set = this.visibleArrowsPerCard[card]!;
			if (set.size > 0) continue;
			for (let arrow = 0; arrow < arrowsPerEnd; arrow++) {
				set.add(arrow);
			}
		}
	}

	private initVisibleArrows(): void {
		this.ensureVisibleArrows();
	}

	private resetVisibleArrows(cardIndex: number): void {
		const set = this.visibleArrowsPerCard[cardIndex];
		if (!set) return;
		set.clear();
		for (let arrow = 0; arrow < this.state.config.arrowsPerEnd; arrow++) {
			set.add(arrow);
		}
	}

	private toggleArrowColumnVisibility(cardIndex: number, arrowIndex: number): void {
		if (!this.showTargetFace) return;
		const set = this.visibleArrowsPerCard[cardIndex];
		if (!set) return;

		if (set.has(arrowIndex)) {
			set.delete(arrowIndex);
		} else {
			set.add(arrowIndex);
		}

		this.refreshEndLabels(cardIndex);
		this.refreshTargetFaces();
		this.refreshAllCells();
	}

	private syncVisibleEndsForCursor(): void {
		if (!this.showTargetFace) return;
		const cursor = nextCursor(this.state);
		if (!cursor) return;
		this.visibleEndsPerCard[cursor.card]?.add(cursor.end);
	}

	private toggleEndVisibility(cardIndex: number, endIndex: number): void {
		if (!this.showTargetFace) return;
		const set = this.visibleEndsPerCard[cardIndex];
		if (!set) return;
		if (set.has(endIndex)) {
			set.delete(endIndex);
		} else {
			set.add(endIndex);
		}
		this.refreshEndLabels(cardIndex);
		this.refreshTargetFaces();
	}

	private toggleAllEndsVisibility(cardIndex: number): void {
		if (!this.showTargetFace) return;
		const set = this.visibleEndsPerCard[cardIndex];
		if (!set) return;

		const { endsPerCard } = this.state.config;
		const allVisible =
			endsPerCard > 0 &&
			Array.from({ length: endsPerCard }, (_, end) => end).every((end) => set.has(end));

		set.clear();
		if (!allVisible) {
			for (let end = 0; end < endsPerCard; end++) {
				set.add(end);
			}
			this.resetVisibleArrows(cardIndex);
		}

		this.refreshEndLabels(cardIndex);
		this.refreshTargetFaces();
		this.refreshAllCells();
	}

	private openEndNote(cardIndex: number, endIndex: number): void {
		const title = `Scorecard ${cardIndex + 1} · End ${endIndex + 1}`;
		const current = getEndNote(this.state, cardIndex, endIndex);
		new EndNoteModal(this.app, title, current, (note) => {
			this.state = setEndNote(this.state, cardIndex, endIndex, note);
			this.refreshEndLabels(cardIndex);
			void this.persistState();
		}).open();
	}

	private refreshEndLabels(cardIndex?: number): void {
		const cards =
			cardIndex === undefined
				? Array.from({ length: this.state.config.cardsCount }, (_, i) => i)
				: [cardIndex];

		for (const card of cards) {
			const visible = this.visibleEndsPerCard[card] ?? new Set();

			const totalHeader = this.totalHeaderRefs[card];
			if (totalHeader) {
				const { endsPerCard } = this.state.config;
				const visibleCount = Array.from({ length: endsPerCard }, (_, end) => end).filter(
					(end) => visible.has(end),
				).length;
				const allVisible = visibleCount === endsPerCard;
				const noneVisible = visibleCount === 0;
				totalHeader.toggleClass('archery-total-visibility-all', allVisible);
				totalHeader.toggleClass('archery-total-visibility-partial', !allVisible && !noneVisible);
				totalHeader.toggleClass('archery-total-visibility-none', noneVisible);
				totalHeader.title = allVisible
					? 'Hide all ends on target'
					: 'Show all ends on target';
				const iconEl = totalHeader.querySelector('.archery-total-visibility-icon');
				if (iconEl) {
					iconEl.empty();
					setIcon(iconEl as HTMLElement, noneVisible ? 'eye-off' : 'eye');
				}
			}

			const labels = this.endLabelRefs[card];
			const totals = this.endTotalRefs[card];
			if (!labels) continue;

			for (let end = 0; end < labels.length; end++) {
				const labelRef = labels[end];
				if (!labelRef) continue;

				const hasNote = hasEndNote(this.state, card, end);
				labelRef.el.toggleClass('archery-end-has-note', hasNote);
				const noteTitle = hasNote
					? `Edit note for end ${end + 1}`
					: `Add note for end ${end + 1}`;
				labelRef.el.title = noteTitle;

				const totalRef = totals?.[end];
				const visibilityZone = totalRef?.visibilityZone;
				if (!visibilityZone) continue;

				const onTarget = visible.has(end);
				applyEndColorClass(visibilityZone, end);
				visibilityZone.toggleClass('archery-end-visibility-on', onTarget);
				visibilityZone.toggleClass('archery-end-visibility-off', !onTarget);
				visibilityZone.title = onTarget
					? `End ${end + 1} shown on target — click to hide`
					: `End ${end + 1} hidden on target — click to show`;
			}

			const arrowHeaders = this.arrowHeaderRefs[card];
			const visibleArrows = this.visibleArrowsPerCard[card] ?? new Set();
			if (arrowHeaders) {
				const { arrowsPerEnd } = this.state.config;
				for (let arrow = 0; arrow < arrowHeaders.length; arrow++) {
					const header = arrowHeaders[arrow];
					if (!header) continue;
					const onTarget = visibleArrows.has(arrow);
					header.toggleClass('archery-arrow-visibility-on', onTarget);
					header.toggleClass('archery-arrow-visibility-off', !onTarget);
					header.title = onTarget
						? `Arrow ${arrow + 1} shown on target — click to hide`
						: `Arrow ${arrow + 1} hidden on target — click to show`;
				}
			}
		}
	}

	private refreshTargetFaces(): void {
		const offset = this.plugin.settings.targetTouchOffsetY;
		for (let cardIndex = 0; cardIndex < this.targetFaces.length; cardIndex++) {
			const face = this.targetFaces[cardIndex];
			if (!face) continue;
			const visible = this.visibleEndsPerCard[cardIndex] ?? new Set();
			const visibleArrows = this.visibleArrowsPerCard[cardIndex] ?? new Set();
			face.update(
				this.state,
				visible,
				visibleArrows,
				offset,
				this.scoreFilter,
				this.plugin.settings.showEndEllipses,
				this.plugin.settings.targetShotMarkerSize,
				this.plugin.settings.showShotScores,
			);
		}
	}

	private destroyTargetFaces(): void {
		for (const face of this.targetFaces) {
			face.destroy();
		}
		this.targetFaces = [];
	}

	private renderPresetPanel(parent: HTMLElement): void {
		// Dimensions can only be changed while the scorecard is empty.
		if (hasAnyScore(this.state)) return;

		const panel = parent.createDiv({ cls: 'archery-preset-panel' });

		const presets = getAllPresets(this.plugin.settings);
		const { config } = this.state;
		const activePreset = presets.find((preset) => this.presetMatches(preset, config));

		const chips = panel.createDiv({ cls: 'archery-preset-chips' });
		for (const preset of presets) {
			const chip = chips.createEl('button', {
				cls: 'archery-preset-chip',
				text: preset.name,
			});
			chip.toggleClass('archery-preset-chip-active', preset === activePreset);
			chip.title = `${preset.cardsCount} cards × ${preset.endsPerCard} ends × ${preset.arrowsPerEnd} arrows`;
			chip.addEventListener('click', () => this.applyPreset(preset));
		}

		if (!activePreset) {
			const custom = chips.createSpan({
				cls: 'archery-preset-chip archery-preset-chip-custom',
				text: `Custom · ${config.cardsCount}×${config.endsPerCard}×${config.arrowsPerEnd}`,
			});
			custom.title = 'Current layout does not match a preset';
		}
	}

	private presetMatches(preset: LayoutPreset, config: SessionConfig): boolean {
		return (
			preset.cardsCount === config.cardsCount &&
			preset.endsPerCard === config.endsPerCard &&
			preset.arrowsPerEnd === config.arrowsPerEnd
		);
	}

	private applyPreset(preset: LayoutPreset): void {
		this.applyLayoutChange({
			cardsCount: preset.cardsCount,
			endsPerCard: preset.endsPerCard,
			arrowsPerEnd: preset.arrowsPerEnd,
			roundType: preset.name,
		});
	}

	private applyLayoutChange(partial: Partial<SessionConfig>): void {
		const presets = getAllPresets(this.plugin.settings);
		const roundType =
			partial.roundType ??
			presets.find((preset) =>
				this.presetMatches(preset, { ...this.state.config, ...partial }),
			)?.name ??
			'Custom';

		const next = resizeSessionState(this.state, { ...partial, roundType });
		if (
			next.config.endsPerCard === this.state.config.endsPerCard &&
			next.config.arrowsPerEnd === this.state.config.arrowsPerEnd &&
			next.config.cardsCount === this.state.config.cardsCount
		) {
			return;
		}

		this.state = next;
		this.visibleEndsPerCard = [];
		this.visibleArrowsPerCard = [];
		this.renderConfigLabel();
		this.syncEditBufferFromState();
		this.renderViewMode();
		void this.persistState();
	}

	private renderEditMode(): void {
		if (!this.editContainer) return;
		this.editContainer.empty();

		this.editContainer.createDiv({
			cls: 'archery-edit-hint',
			text: 'Edit the scorecard markup below. Change the config line or table shape, then switch to View to apply.',
		});

		this.sourceEditor = this.editContainer.createEl('textarea', {
			cls: 'archery-source-editor',
		});
		this.sourceEditor.value = serializeSession(this.state);
		this.sourceEditor.spellcheck = false;
	}

	private setMode(mode: ViewMode): void {
		if (mode === this.mode) return;

		if (mode === 'view') {
			if (!this.applyEditBuffer()) return;
		} else {
			this.showReview = false;
			this.syncEditBufferFromState();
		}

		this.mode = mode;
		this.updateModeUi();
	}

	private updateModeUi(): void {
		if (this.modeActionBtn) {
			const editing = this.mode === 'edit';
			setIcon(this.modeActionBtn, editing ? 'layout' : 'code-glyph');
			this.modeActionBtn.setAttribute(
				'aria-label',
				editing ? 'Scorecard view' : 'Edit source',
			);
		}
		if (this.targetActionBtn) {
			const inView = this.mode === 'view';
			this.targetActionBtn.style.display = inView ? '' : 'none';
			this.targetActionBtn.toggleClass('is-active', this.showTargetFace);
			this.targetActionBtn.setAttribute(
				'aria-label',
				this.showTargetFace ? 'Hide target face' : 'Show target face',
			);
		}
		if (this.filterActionBtn) {
			const inView = this.mode === 'view';
			this.filterActionBtn.style.display = inView ? '' : 'none';
			const active = isScoreFilterActive(this.scoreFilter);
			this.filterActionBtn.toggleClass('is-active', active);
			this.filterActionBtn.setAttribute(
				'aria-label',
				active ? 'Score filter active — click to edit' : 'Filter arrows by score',
			);
		}
		if (this.ellipseActionBtn) {
			const inView = this.mode === 'view';
			this.ellipseActionBtn.style.display = inView ? '' : 'none';
			const active = this.plugin.settings.showEndEllipses;
			this.ellipseActionBtn.toggleClass('is-active', active);
			this.ellipseActionBtn.setAttribute(
				'aria-label',
				active ? 'End ellipses on — click to configure' : 'End group ellipses',
			);
		}
		if (this.reviewActionBtn) {
			this.reviewActionBtn.style.display = this.mode === 'view' ? '' : 'none';
			this.reviewActionBtn.toggleClass('is-active', this.showReview);
			this.reviewActionBtn.setAttribute(
				'aria-label',
				this.showReview ? 'Hide end review' : 'Review ends',
			);
		}
		this.viewContainer?.toggleClass('archery-hidden', this.mode !== 'view');
		this.editContainer?.toggleClass('archery-hidden', this.mode !== 'edit');
	}

	private syncEditBufferFromState(): void {
		if (this.sourceEditor) {
			this.sourceEditor.value = serializeSession(this.state);
		}
	}

	private applyEditBuffer(): boolean {
		if (!this.sourceEditor) return true;

		const parsed = parseScorecardBlock(this.sourceEditor.value);
		if (!parsed) {
			new Notice('Could not parse scorecard markup. Check the table format.');
			return false;
		}

		const configChanged =
			parsed.config.endsPerCard !== this.state.config.endsPerCard ||
			parsed.config.arrowsPerEnd !== this.state.config.arrowsPerEnd ||
			parsed.config.cardsCount !== this.state.config.cardsCount;

		this.state = parsed;

		if (configChanged) {
			this.render();
			return true;
		}

		this.renderConfigLabel();
		this.refreshAllCells();
		void this.persistState();
		return true;
	}

	private async persistState(): Promise<void> {
		if (!this.file) return;
		const content = serializeSession(this.state);
		await this.app.vault.modify(this.file, content);
		if (this.sourceEditor && this.mode === 'edit') {
			this.sourceEditor.value = content;
		}
		this.refreshReviewIfNeeded();
	}

	private refreshReviewIfNeeded(): void {
		if (this.showReview && this.mode === 'view') {
			this.renderViewMode();
		}
	}

	private renderScorecard(parent: HTMLElement, cardIndex: number): void {
		const { config } = this.state;
		const section = parent.createDiv({ cls: 'archery-scorecard-section' });
		section.createEl('h4', { text: `Scorecard ${cardIndex + 1}` });

		if (this.showTargetFace) {
			const targetWrap = section.createDiv({ cls: 'archery-target-wrap' });
			const face = new TargetFace(targetWrap, {
				cardIndex,
				touchOffsetY: this.plugin.settings.targetTouchOffsetY,
				onPlace: (x, y, score) => this.handleTargetPlace(x, y, score),
			});
			const visible = this.visibleEndsPerCard[cardIndex] ?? new Set();
			const visibleArrows = this.visibleArrowsPerCard[cardIndex] ?? new Set();
			face.update(
				this.state,
				visible,
				visibleArrows,
				this.plugin.settings.targetTouchOffsetY,
				this.scoreFilter,
				this.plugin.settings.showEndEllipses,
				this.plugin.settings.targetShotMarkerSize,
				this.plugin.settings.showShotScores,
			);
			this.targetFaces.push(face);
			if (isScoreFilterActive(this.scoreFilter)) {
				targetWrap.createDiv({
					cls: 'archery-score-filter-label',
					text: describeScoreFilter(this.scoreFilter),
				});
			}
		}

		const grid = section.createDiv({ cls: 'archery-scorecard-grid' });

		const headerRow = grid.createDiv({ cls: 'archery-grid-row archery-grid-header' });
		headerRow.style.gridTemplateColumns = gridColumnStyle(config.arrowsPerEnd);
		headerRow.createDiv({ cls: 'archery-cell archery-cell-label', text: 'End' });
		const noteHeader = headerRow.createDiv({
			cls: 'archery-cell archery-cell-header archery-cell-note-header',
		});
		setIcon(noteHeader.createSpan(), 'sticky-note');
		this.arrowHeaderRefs[cardIndex] = [];
		for (let arrow = 1; arrow <= config.arrowsPerEnd; arrow++) {
			if (this.showTargetFace) {
				const arrowHeader = headerRow.createDiv({
					cls: 'archery-cell archery-cell-header archery-arrow-visibility-toggle',
					text: String(arrow),
				});
				const arrowIndex = arrow - 1;
				arrowHeader.addEventListener('click', () =>
					this.toggleArrowColumnVisibility(cardIndex, arrowIndex),
				);
				this.arrowHeaderRefs[cardIndex]![arrowIndex] = arrowHeader;
			} else {
				headerRow.createDiv({
					cls: 'archery-cell archery-cell-header',
					text: String(arrow),
				});
			}
		}
		if (this.showTargetFace) {
			const totalHeader = headerRow.createDiv({
				cls: 'archery-cell archery-cell-header archery-total-visibility-toggle',
			});
			setIcon(totalHeader.createSpan({ cls: 'archery-total-visibility-icon' }), 'eye');
			totalHeader.createSpan({ cls: 'archery-total-visibility-label', text: 'Total' });
			totalHeader.addEventListener('click', () => this.toggleAllEndsVisibility(cardIndex));
			this.totalHeaderRefs[cardIndex] = totalHeader;
		} else {
			headerRow.createDiv({ cls: 'archery-cell archery-cell-header', text: 'Total' });
		}

		this.cellRefs[cardIndex] = [];
		this.endTotalRefs[cardIndex] = [];

		this.endLabelRefs[cardIndex] = [];

		for (let end = 0; end < config.endsPerCard; end++) {
			const row = grid.createDiv({ cls: 'archery-grid-row' });
			row.style.gridTemplateColumns = gridColumnStyle(config.arrowsPerEnd);

			row.createDiv({
				cls: 'archery-cell archery-cell-label',
				text: String(end + 1),
			});

			const noteBtn = row.createDiv({
				cls: 'archery-cell archery-cell-note archery-end-note-btn',
			});
			setIcon(noteBtn.createSpan({ cls: 'archery-end-note-icon' }), 'sticky-note');
			noteBtn.addEventListener('click', () => this.openEndNote(cardIndex, end));
			this.endLabelRefs[cardIndex]![end] = { el: noteBtn };

			const arrowCells: CellRef[] = [];
			for (let arrow = 0; arrow < config.arrowsPerEnd; arrow++) {
				const cell = row.createDiv({ cls: 'archery-cell archery-cell-score' });
				cell.setText('·');
				arrowCells.push({ el: cell });
			}
			this.cellRefs[cardIndex]![end] = arrowCells;

			if (this.showTargetFace) {
				const totalBtn = row.createDiv({
					cls: 'archery-cell archery-cell-total archery-end-visibility-btn archery-end-visibility-off',
				});
				const valueEl = totalBtn.createSpan({ cls: 'archery-end-score-value' });
				totalBtn.addEventListener('click', () => this.toggleEndVisibility(cardIndex, end));
				this.endTotalRefs[cardIndex]![end] = {
					el: totalBtn,
					valueEl,
					visibilityZone: totalBtn,
				};
			} else {
				const totalCell = row.createDiv({ cls: 'archery-cell archery-cell-total' });
				const valueEl = totalCell.createSpan({ cls: 'archery-end-score-value' });
				this.endTotalRefs[cardIndex]![end] = { el: totalCell, valueEl };
			}
		}
	}

	private renderScorePad(): void {
		if (!this.scorePadEl) return;
		this.scorePadEl.empty();

		if (this.showTargetFace) {
			const missRow = this.scorePadEl.createDiv({ cls: 'archery-score-row archery-score-row-miss-only' });
			this.createScoreButton(missRow, MISS_SCORE, 'archery-score-miss archery-score-btn-miss-only', 'Miss');
			return;
		}

		const pad = this.scorePadEl.createDiv({ cls: 'archery-score-buttons' });

		const topRow = pad.createDiv({ cls: 'archery-score-row archery-score-row-top' });
		this.createScoreButton(topRow, 10, 'archery-score-btn-wide');
		for (let score = 9; score >= 6; score--) {
			this.createScoreButton(topRow, score);
		}

		const bottomRow = pad.createDiv({ cls: 'archery-score-row archery-score-row-bottom' });
		for (let score = 5; score >= 1; score--) {
			this.createScoreButton(bottomRow, score);
		}
		this.createScoreButton(bottomRow, MISS_SCORE, 'archery-score-miss', 'M');
	}

	private createScoreButton(
		parent: HTMLElement,
		score: number,
		extraClass = '',
		label?: string,
	): void {
		const btn = parent.createEl('button', {
			cls: ['archery-score-btn', extraClass].filter(Boolean).join(' '),
			text: label ?? String(score),
		});
		const colorClass = scoreColorClass(score);
		if (colorClass) btn.addClass(colorClass);
		btn.addEventListener('click', () => this.handleScore(score));
	}

	private isActiveCell(card: number, end: number, arrow: number): boolean {
		const cursor = nextCursor(this.state);
		return (
			cursor !== null &&
			cursor.card === card &&
			cursor.end === end &&
			cursor.arrow === arrow
		);
	}

	private refreshAllCells(): void {
		const { config } = this.state;
		const cursor = nextCursor(this.state);

		for (let card = 0; card < config.cardsCount; card++) {
			const scorecard = this.state.cards[card];
			if (!scorecard) continue;

			for (let end = 0; end < config.endsPerCard; end++) {
				const arrows = scorecard.ends[end];
				if (!arrows) continue;

				for (let arrow = 0; arrow < config.arrowsPerEnd; arrow++) {
					const ref = this.cellRefs[card]?.[end]?.[arrow];
					if (!ref) continue;
					const shot = arrows[arrow];
					const score = shot?.score ?? null;
					ref.el.setText(formatScore(score));
					ref.el.toggleClass('archery-cell-active', this.isActiveCell(card, end, arrow));
					ref.el.toggleClass('archery-cell-filled', score !== null);
					ref.el.toggleClass('archery-cell-placed', shotHasPlacement(shot));
					applyScoreColorClass(ref.el, score);
					if (this.showTargetFace) {
						const visibleArrows = this.visibleArrowsPerCard[card] ?? new Set();
						ref.el.toggleClass('archery-arrow-column-hidden', !visibleArrows.has(arrow));
					} else {
						ref.el.removeClass('archery-arrow-column-hidden');
					}
				}

				const totalRef = this.endTotalRefs[card]?.[end];
				if (totalRef) {
					const hasAny = arrows.some((shot) => shot.score !== null);
					totalRef.valueEl.setText(
						hasAny ? formatEndScoreDisplay(scorecard, end) : '',
					);
					totalRef.el.toggleClass('archery-cell-complete', endIsComplete(arrows));
				}
			}

			const grandEl = this.grandTotalEls[card];
			if (grandEl) {
				grandEl.setText(String(cardGrandTotal(scorecard)));
			}
		}

		if (this.combinedTotalEl) {
			this.combinedTotalEl.setText(String(sessionGrandTotal(this.state)));
		}

		if (this.scorePadEl) {
			const complete = cursor === null;
			this.scorePadEl.toggleClass('archery-session-complete', complete);
		}

		this.syncVisibleEndsForCursor();
		this.refreshEndLabels();
		this.refreshTargetFaces();
	}

	private handleTargetPlace(x: number, y: number, score: number): void {
		if (this.mode !== 'view' || !this.showTargetFace || !nextCursor(this.state)) return;

		const wasEmpty = !hasAnyScore(this.state);
		this.state = applyScoreAt(this.state, x, y, score);
		if (wasEmpty) {
			this.renderViewMode();
		} else {
			this.refreshAllCells();
		}
		void this.persistState();
	}

	private handleScore(value: number): void {
		if (this.mode !== 'view' || !nextCursor(this.state)) return;

		const wasEmpty = !hasAnyScore(this.state);
		this.state = applyScore(this.state, value);
		// First score: rebuild so the preset chips disappear.
		if (wasEmpty) {
			this.renderViewMode();
		} else {
			this.refreshAllCells();
		}
		void this.persistState();
	}

	private handleUndo(): void {
		if (this.mode !== 'view') return;

		const wasNonEmpty = hasAnyScore(this.state);
		this.state = undoLast(this.state);
		// Last score removed: rebuild so the preset chips reappear.
		if (wasNonEmpty && !hasAnyScore(this.state)) {
			this.renderViewMode();
		} else {
			this.refreshAllCells();
		}
		void this.persistState();
	}

	async resetSession(): Promise<void> {
		this.state = createSessionState(this.state.config);
		this.syncEditBufferFromState();
		this.refreshAllCells();
		await this.persistState();
	}
}
