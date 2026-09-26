import { FileView, Notice, TFile, WorkspaceLeaf, setIcon } from 'obsidian';
import {
	createBulkState,
	type BulkState,
} from '../model/rbulk';
import {
	loadBulkFromFile,
	parseBulk,
	saveBulkToFile,
	serializeBulk,
} from '../services/rbulkSync';
import { BulkLoaderPanel } from './BulkLoaderPanel';

export const VIEW_TYPE_BULK = 'obsidian-archery-bulk';

type ViewMode = 'view' | 'edit';

export class BulkLoaderView extends FileView {
	private mode: ViewMode = 'view';
	private modeActionBtn: HTMLElement | null = null;
	private viewContainer: HTMLElement | null = null;
	private editContainer: HTMLElement | null = null;
	private sourceEditor: HTMLTextAreaElement | null = null;
	private panel: BulkLoaderPanel | null = null;
	private state: BulkState = createBulkState();
	private writing = false;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_BULK;
	}

	getDisplayText(): string {
		return this.file?.basename ?? 'Bulk loader';
	}

	getIcon(): string {
		return 'list';
	}

	async onOpen(): Promise<void> {
		this.ensureModeAction();
		this.updateModeUi();
	}

	async onLoadFile(file: TFile): Promise<void> {
		this.state = await loadBulkFromFile(this.app, file);
		this.mode = 'view';
		this.render();
	}

	async onUnloadFile(_file: TFile): Promise<void> {
		if (this.panel) {
			this.removeChild(this.panel);
			this.panel = null;
		}
		this.contentEl.empty();
		this.viewContainer = null;
		this.editContainer = null;
		this.sourceEditor = null;
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
			await this.syncStateFromPanel();
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
				editing ? 'Bulk loader view' : 'Edit source',
			);
		}
		this.viewContainer?.toggleClass('archery-hidden', this.mode !== 'view');
		this.editContainer?.toggleClass('archery-hidden', this.mode !== 'edit');
	}

	private render(): void {
		this.contentEl.empty();
		this.contentEl.addClass('archery-bulk-view');

		this.viewContainer = this.contentEl.createDiv({ cls: 'archery-bulk-view-pane' });
		this.editContainer = this.contentEl.createDiv({
			cls: 'archery-edit-container archery-bulk-edit',
		});

		this.mountPanel();
		this.renderEditMode();
		this.updateModeUi();
	}

	private mountPanel(): void {
		if (!this.viewContainer || !this.file) return;
		if (this.panel) {
			this.removeChild(this.panel);
			this.panel = null;
		}
		this.viewContainer.empty();
		this.panel = new BulkLoaderPanel(this.viewContainer, this.app, this.file);
		this.addChild(this.panel);
	}

	private renderEditMode(): void {
		if (!this.editContainer) return;
		this.editContainer.empty();

		this.editContainer.createDiv({
			cls: 'archery-edit-hint',
			text: 'Edit the bulk loader markup below. Switch back to view to apply.',
		});

		this.sourceEditor = this.editContainer.createEl('textarea', {
			cls: 'archery-source-editor',
		});
		this.sourceEditor.value = serializeBulk(this.state);
		this.sourceEditor.spellcheck = false;
	}

	private syncEditBufferFromState(): void {
		if (this.sourceEditor) {
			this.sourceEditor.value = serializeBulk(this.state);
		}
	}

	/** Prefer disk truth before opening the editor (panel may have newer rounds). */
	private async syncStateFromPanel(): Promise<void> {
		if (!this.file) return;
		try {
			this.state = await loadBulkFromFile(this.app, this.file);
		} catch {
			// keep current state
		}
	}

	private async applyEditBuffer(): Promise<boolean> {
		if (!this.sourceEditor || !this.file) return true;

		const parsed = parseBulk(this.sourceEditor.value);
		if (!parsed) {
			new Notice('Could not parse bulk loader markup. Check the rbulk-meta comment.');
			return false;
		}

		this.state = parsed;
		this.writing = true;
		try {
			await saveBulkToFile(this.app, this.file, this.state);
		} finally {
			window.setTimeout(() => {
				this.writing = false;
			}, 0);
		}

		this.mountPanel();
		this.syncEditBufferFromState();
		return true;
	}
}
