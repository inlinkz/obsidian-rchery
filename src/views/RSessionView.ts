import {
	Component,
	FileView,
	MarkdownRenderer,
	Notice,
	TFile,
	WorkspaceLeaf,
	setIcon,
} from 'obsidian';
import type ArcheryPlugin from '../main';
import {
	createRSessionState,
	type RSessionBlock,
	type RSessionState,
} from '../model/rsession';
import {
	loadRSessionFromFile,
	parseRSession,
	saveRSession,
	serializeRSession,
} from '../services/rsessionSync';
import { ArcheryEmbed } from './ArcheryEmbed';
import { BulkLoaderPanel } from './BulkLoaderPanel';

export const VIEW_TYPE_RSESSION = 'obsidian-archery-rsession';

type ViewMode = 'view' | 'edit';

export class RSessionView extends FileView {
	private plugin: ArcheryPlugin;
	private state: RSessionState = createRSessionState('');
	private mode: ViewMode = 'view';
	private modeActionBtn: HTMLElement | null = null;
	private viewContainer: HTMLElement | null = null;
	private editContainer: HTMLElement | null = null;
	private sourceEditor: HTMLTextAreaElement | null = null;
	private blocksEl: HTMLElement | null = null;
	private blocksComponent = new Component();
	private saveTimer: number | null = null;
	private rendering = false;
	private writing = false;

	constructor(leaf: WorkspaceLeaf, plugin: ArcheryPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_RSESSION;
	}

	getDisplayText(): string {
		return this.file?.basename ?? 'Training session';
	}

	getIcon(): string {
		return 'calendar';
	}

	async onOpen(): Promise<void> {
		this.ensureModeAction();
		this.updateModeUi();
	}

	async onLoadFile(file: TFile): Promise<void> {
		this.state = await loadRSessionFromFile(this.app, file);
		this.mode = 'view';
		this.render();
	}

	async onUnloadFile(_file: TFile): Promise<void> {
		await this.flushPendingSave();
		this.blocksComponent.unload();
		this.contentEl.empty();
		this.viewContainer = null;
		this.editContainer = null;
		this.sourceEditor = null;
		this.blocksEl = null;
	}

	private ensureModeAction(): void {
		if (this.modeActionBtn) return;
		this.modeActionBtn = this.addAction('code-glyph', 'Edit source', () => {
			this.toggleMode();
		});
	}

	private toggleMode(): void {
		void this.setMode(this.mode === 'view' ? 'edit' : 'view');
	}

	private async setMode(mode: ViewMode): Promise<void> {
		if (mode === this.mode) return;

		if (mode === 'view') {
			if (!(await this.applyEditBuffer())) return;
		} else {
			await this.flushPendingSave();
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
				editing ? 'Session view' : 'Edit source',
			);
		}
		this.viewContainer?.toggleClass('archery-hidden', this.mode !== 'view');
		this.editContainer?.toggleClass('archery-hidden', this.mode !== 'edit');
	}

	private render(): void {
		this.contentEl.empty();
		this.contentEl.addClass('archery-rsession-view');

		this.viewContainer = this.contentEl.createDiv({ cls: 'archery-rsession-view-pane' });
		this.editContainer = this.contentEl.createDiv({
			cls: 'archery-edit-container archery-rsession-edit',
		});

		this.renderViewPane();
		this.renderEditMode();
		this.updateModeUi();
	}

	private renderViewPane(): void {
		if (!this.viewContainer) return;
		this.viewContainer.empty();

		const header = this.viewContainer.createDiv({ cls: 'archery-rsession-header' });
		header.createEl('h2', {
			text: this.file?.basename ?? 'Training session',
			cls: 'archery-rsession-title',
		});
		if (this.state.date) {
			header.createDiv({
				cls: 'archery-rsession-date',
				text: this.state.date,
			});
		}

		const toolbar = this.viewContainer.createDiv({ cls: 'archery-rsession-toolbar' });

		const addTextBtn = toolbar.createEl('button', {
			cls: 'archery-rsession-add-btn',
			text: 'Add text',
		});
		this.registerDomEvent(addTextBtn, 'click', () => {
			void this.addTextBlock();
		});

		const addScorecardBtn = toolbar.createEl('button', {
			cls: 'mod-cta archery-rsession-add-btn',
			text: 'Add scorecard',
		});
		this.registerDomEvent(addScorecardBtn, 'click', () => {
			void this.addScorecardBlock();
		});

		const addBulkBtn = toolbar.createEl('button', {
			cls: 'archery-rsession-add-btn',
			text: 'Add bulk loader',
		});
		this.registerDomEvent(addBulkBtn, 'click', () => {
			void this.addBulkBlock();
		});

		this.blocksEl = this.viewContainer.createDiv({ cls: 'archery-rsession-blocks' });
		void this.renderBlocks();
	}

	private renderEditMode(): void {
		if (!this.editContainer) return;
		this.editContainer.empty();

		this.editContainer.createDiv({
			cls: 'archery-edit-hint',
			text: 'Edit the session markup below. Switch back to view to apply.',
		});

		this.sourceEditor = this.editContainer.createEl('textarea', {
			cls: 'archery-source-editor',
		});
		this.sourceEditor.value = serializeRSession(this.state);
		this.sourceEditor.spellcheck = false;
	}

	private syncEditBufferFromState(): void {
		if (this.sourceEditor) {
			this.sourceEditor.value = serializeRSession(this.state);
		}
	}

	private async applyEditBuffer(): Promise<boolean> {
		if (!this.sourceEditor) return true;

		const fallback = this.state.date;
		const parsed = parseRSession(this.sourceEditor.value, fallback);
		this.state = parsed;
		await this.persist();
		this.renderViewPane();
		this.syncEditBufferFromState();
		return true;
	}

	private async renderBlocks(): Promise<void> {
		if (!this.blocksEl || this.rendering) return;
		this.rendering = true;
		try {
			this.blocksComponent.unload();
			this.blocksComponent = new Component();
			this.blocksComponent.load();
			this.blocksEl.empty();

			if (this.state.blocks.length === 0) {
				this.blocksEl.createDiv({
					cls: 'archery-rsession-empty',
					text: 'No entries yet. Add text, a scorecard, or a bulk loader.',
				});
				return;
			}

			for (let index = 0; index < this.state.blocks.length; index++) {
				await this.renderBlock(this.state.blocks[index]!, index);
			}
		} finally {
			this.rendering = false;
		}
	}

	private async renderBlock(block: RSessionBlock, index: number): Promise<void> {
		if (!this.blocksEl || !this.file) return;

		const wrap = this.blocksEl.createDiv({ cls: 'archery-rsession-block' });
		wrap.addClass(
			block.type === 'text'
				? 'archery-rsession-block-text'
				: block.type === 'bulk'
					? 'archery-rsession-block-bulk'
					: 'archery-rsession-block-scorecard',
		);

		const header = wrap.createDiv({ cls: 'archery-rsession-block-header' });
		header.createSpan({
			cls: 'archery-rsession-block-type',
			text: block.type === 'text' ? 'Text' : block.type === 'bulk' ? 'Bulk loader' : 'Scorecard',
		});

		const actions = header.createDiv({ cls: 'archery-rsession-block-actions' });

		if ((block.type === 'scorecard' || block.type === 'bulk') && block.path.trim()) {
			const openBtn = actions.createEl('button', {
				cls: 'clickable-icon',
				attr: {
					'aria-label': block.type === 'bulk' ? 'Open bulk loader' : 'Open scorecard',
					type: 'button',
				},
			});
			setIcon(openBtn, 'external-link');
			openBtn.addEventListener('click', () => {
				this.openLinkedFile(block.path);
			});
		}

		const removeBtn = actions.createEl('button', {
			cls: 'clickable-icon',
			attr: { 'aria-label': 'Remove block', type: 'button' },
		});
		setIcon(removeBtn, 'trash');
		removeBtn.addEventListener('click', () => {
			void this.removeBlock(index);
		});

		const body = wrap.createDiv({ cls: 'archery-rsession-block-body' });

		if (block.type === 'text') {
			const textarea = body.createEl('textarea', {
				cls: 'archery-rsession-text-input',
				attr: {
					rows: '4',
					spellcheck: 'true',
					placeholder: 'Session notes…',
				},
			});
			textarea.value = block.content;
			textarea.addEventListener('input', () => {
				const current = this.state.blocks[index];
				if (!current || current.type !== 'text') return;
				current.content = textarea.value;
				this.scheduleSave();
			});
			return;
		}

		if (!block.path.trim()) {
			const pendingLabel =
				block.label?.trim() || (block.type === 'bulk' ? 'Bulk loader' : 'Scorecard');
			body.createDiv({
				cls: 'archery-rsession-block-pending',
				text: pendingLabel,
			});
			const startBtn = body.createEl('button', {
				cls: 'mod-cta',
				text: block.type === 'bulk' ? 'Start bulk loader' : 'Start scorecard',
			});
			startBtn.addEventListener('click', () => {
				void this.startPendingCard(index);
			});
			return;
		}

		const target =
			this.app.metadataCache.getFirstLinkpathDest(block.path, this.file.path) ??
			this.app.vault.getAbstractFileByPath(block.path);

		if (!(target instanceof TFile)) {
			body.createDiv({
				cls: 'archery-rsession-block-missing',
				text: `Missing file: ${block.path}`,
			});
			return;
		}

		if (target.extension === 'rchery') {
			const embed = new ArcheryEmbed(body, this.app, target, this.plugin);
			this.blocksComponent.addChild(embed);
			return;
		}

		if (target.extension === 'rbulk') {
			const panel = new BulkLoaderPanel(body, this.app, target);
			this.blocksComponent.addChild(panel);
			return;
		}

		const markdown = `![[${block.path}]]`;
		await MarkdownRenderer.render(
			this.app,
			markdown,
			body,
			this.file.path,
			this.blocksComponent,
		);
	}

	private openLinkedFile(path: string): void {
		if (!this.file) return;
		const target =
			this.app.metadataCache.getFirstLinkpathDest(path, this.file.path) ??
			this.app.vault.getAbstractFileByPath(path);
		if (target instanceof TFile) {
			void this.app.workspace.getLeaf(false).openFile(target);
		} else {
			new Notice(`Could not find ${path}`);
		}
	}

	private scheduleSave(): void {
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
		}
		this.saveTimer = window.setTimeout(() => {
			this.saveTimer = null;
			void this.persist();
		}, 400);
	}

	async flushPendingSave(): Promise<void> {
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		await this.persist();
	}

	private async persist(): Promise<void> {
		if (!this.file) return;
		this.writing = true;
		try {
			await saveRSession(this.app, this.file, this.state);
			if (this.sourceEditor && this.mode === 'edit') {
				this.sourceEditor.value = serializeRSession(this.state);
			}
		} finally {
			window.setTimeout(() => {
				this.writing = false;
			}, 0);
		}
	}

	private async addTextBlock(): Promise<void> {
		if (this.mode !== 'view') return;
		this.state.blocks.push({ type: 'text', content: '' });
		await this.persist();
		await this.renderBlocks();
		const textareas = this.blocksEl?.querySelectorAll('textarea.archery-rsession-text-input');
		const last = textareas?.[textareas.length - 1];
		if (last instanceof HTMLTextAreaElement) {
			last.focus();
		}
	}

	/** Public entry for the command palette. */
	async addTextBlockPublic(): Promise<void> {
		await this.addTextBlock();
	}

	private async startPendingCard(index: number): Promise<void> {
		if (!this.file) return;
		const block = this.state.blocks[index];
		if (!block || (block.type !== 'scorecard' && block.type !== 'bulk') || block.path.trim()) {
			return;
		}
		await this.flushPendingSave();
		const path = await this.plugin.createCardForSession(this.file, block.type);
		if (!path) return;
		const current = this.state.blocks[index];
		if (!current || current.type !== block.type) return;
		current.path = path;
		await this.persist();
		await this.renderBlocks();
	}

	private async addScorecardBlock(): Promise<void> {
		if (!this.file || this.mode !== 'view') return;
		await this.flushPendingSave();
		await this.plugin.addCardToSession(this.file, 'scorecard');
	}

	private async addBulkBlock(): Promise<void> {
		if (!this.file || this.mode !== 'view') return;
		await this.flushPendingSave();
		await this.plugin.addCardToSession(this.file, 'bulk');
	}

	private async removeBlock(index: number): Promise<void> {
		if (index < 0 || index >= this.state.blocks.length) return;
		this.state.blocks.splice(index, 1);
		await this.persist();
		await this.renderBlocks();
	}

	/** Called when vault content for this file changes externally. */
	async reloadFromDisk(): Promise<void> {
		if (!this.file || this.writing || this.mode === 'edit') return;
		const content = await this.app.vault.read(this.file);
		const fallback = this.state.date;
		this.state = parseRSession(content, fallback);
		await this.renderBlocks();
	}
}
