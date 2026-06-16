import { FileView, Notice, WorkspaceLeaf, type TFile } from 'obsidian';
import type ArcheryPlugin from '../main';
import {
	applyScore,
	applyScoreColorClass,
	cardGrandTotal,
	createSessionState,
	endIsComplete,
	endTotal,
	formatScore,
	gridColumnStyle,
	hasAnyScore,
	MISS_SCORE,
	nextCursor,
	resizeSessionState,
	scoreColorClass,
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

export const VIEW_TYPE_SCORECARD = 'obsidian-archery-scorecard';

type ViewMode = 'view' | 'edit';

interface CellRef {
	el: HTMLElement;
}

interface EndTotalRef {
	el: HTMLElement;
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
	private viewModeBtn: HTMLButtonElement | null = null;
	private editModeBtn: HTMLButtonElement | null = null;
	private viewContainer: HTMLElement | null = null;
	private scrollBodyEl: HTMLElement | null = null;
	private editContainer: HTMLElement | null = null;
	private sourceEditor: HTMLTextAreaElement | null = null;
	private scorePadEl: HTMLElement | null = null;

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

	getDisplayText(): string {
		return this.file?.basename ?? 'Archery scorecard';
	}

	getIcon(): string {
		return 'target';
	}

	async onLoadFile(file: TFile): Promise<void> {
		const content = await this.app.vault.read(file);
		this.state = parseScorecardBlock(content) ?? createSessionState();
		this.mode = 'view';
		this.render();
	}

	async onUnloadFile(_file: TFile): Promise<void> {
		this.contentEl.empty();
		this.resetRefs();
	}

	private resetRefs(): void {
		this.cellRefs = [];
		this.endTotalRefs = [];
		this.grandTotalEls = [];
		this.combinedTotalEl = null;
		this.headerEl = null;
		this.viewModeBtn = null;
		this.editModeBtn = null;
		this.viewContainer = null;
		this.scrollBodyEl = null;
		this.editContainer = null;
		this.sourceEditor = null;
		this.scorePadEl = null;
	}

	private render(): void {
		const container = this.contentEl;
		container.empty();
		container.addClass('archery-scorecard-view');
		this.resetRefs();

		this.headerEl = container.createDiv({ cls: 'archery-header' });

		const toolbar = this.headerEl.createDiv({ cls: 'archery-toolbar' });
		this.viewModeBtn = toolbar.createEl('button', {
			cls: 'archery-mode-btn',
			text: 'View',
		});
		this.editModeBtn = toolbar.createEl('button', {
			cls: 'archery-mode-btn',
			text: 'Edit',
		});
		this.viewModeBtn.addEventListener('click', () => this.setMode('view'));
		this.editModeBtn.addEventListener('click', () => this.setMode('edit'));

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
		this.viewContainer.empty();

		const { config } = this.state;
		this.cellRefs = Array.from({ length: config.cardsCount }, () => []);
		this.endTotalRefs = Array.from({ length: config.cardsCount }, () => []);
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
		});
	}

	private applyLayoutChange(partial: Partial<SessionConfig>): void {
		const next = resizeSessionState(this.state, partial);
		if (
			next.config.endsPerCard === this.state.config.endsPerCard &&
			next.config.arrowsPerEnd === this.state.config.arrowsPerEnd &&
			next.config.cardsCount === this.state.config.cardsCount
		) {
			return;
		}

		this.state = next;
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
			this.syncEditBufferFromState();
		}

		this.mode = mode;
		this.updateModeUi();
	}

	private updateModeUi(): void {
		this.viewModeBtn?.toggleClass('archery-mode-btn-active', this.mode === 'view');
		this.editModeBtn?.toggleClass('archery-mode-btn-active', this.mode === 'edit');
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
	}

	private renderScorecard(parent: HTMLElement, cardIndex: number): void {
		const { config } = this.state;
		const section = parent.createDiv({ cls: 'archery-scorecard-section' });
		section.createEl('h4', { text: `Scorecard ${cardIndex + 1}` });

		const grid = section.createDiv({ cls: 'archery-scorecard-grid' });

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

		this.cellRefs[cardIndex] = [];
		this.endTotalRefs[cardIndex] = [];

		for (let end = 0; end < config.endsPerCard; end++) {
			const row = grid.createDiv({ cls: 'archery-grid-row' });
			row.style.gridTemplateColumns = gridColumnStyle(config.arrowsPerEnd);
			row.createDiv({ cls: 'archery-cell archery-cell-label', text: String(end + 1) });

			const arrowCells: CellRef[] = [];
			for (let arrow = 0; arrow < config.arrowsPerEnd; arrow++) {
				const cell = row.createDiv({ cls: 'archery-cell archery-cell-score' });
				cell.setText('·');
				arrowCells.push({ el: cell });
			}
			this.cellRefs[cardIndex]![end] = arrowCells;

			const totalCell = row.createDiv({ cls: 'archery-cell archery-cell-total' });
			totalCell.setText('');
			this.endTotalRefs[cardIndex]![end] = { el: totalCell };
		}
	}

	private renderScorePad(): void {
		if (!this.scorePadEl) return;
		this.scorePadEl.empty();

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
					const score = arrows[arrow] ?? null;
					ref.el.setText(formatScore(score));
					ref.el.toggleClass('archery-cell-active', this.isActiveCell(card, end, arrow));
					ref.el.toggleClass('archery-cell-filled', score !== null);
					applyScoreColorClass(ref.el, score);
				}

				const totalRef = this.endTotalRefs[card]?.[end];
				if (totalRef) {
					const hasAny = arrows.some((s) => s !== null);
					totalRef.el.setText(hasAny ? String(endTotal(arrows)) : '');
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
