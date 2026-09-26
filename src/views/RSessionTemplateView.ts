import { FileView, Notice, WorkspaceLeaf, setIcon, type TFile } from "obsidian";
import type ArcheryPlugin from "../main";
import {
	createRSessionTemplateState,
	type RSessionBlock,
	type RSessionTemplateState,
} from "../model/rsession";
import {
	loadRSessionTemplateFromFile,
	parseRSessionTemplate,
	saveRSessionTemplate,
} from "../services/rsessionSync";

export const VIEW_TYPE_RSESSION_TEMPLATE = "obsidian-archery-rsession-template";

export class RSessionTemplateView extends FileView {
	private plugin: ArcheryPlugin;
	private state: RSessionTemplateState = createRSessionTemplateState();
	private blocksEl: HTMLElement | null = null;
	private saveTimer: number | null = null;
	private writing = false;

	constructor(leaf: WorkspaceLeaf, plugin: ArcheryPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_RSESSION_TEMPLATE;
	}

	getDisplayText(): string {
		return this.file?.basename ?? "Session template";
	}

	getIcon(): string {
		return "clipboard-list";
	}

	async onLoadFile(file: TFile): Promise<void> {
		this.state = await loadRSessionTemplateFromFile(this.app, file);
		this.render();
	}

	async onUnloadFile(_file: TFile): Promise<void> {
		await this.flushPendingSave();
		this.contentEl.empty();
		this.blocksEl = null;
	}

	private render(): void {
		this.contentEl.empty();
		this.contentEl.addClass("archery-rsession-view");

		const header = this.contentEl.createDiv({ cls: "archery-rsession-header" });
		header.createEl("h2", {
			text: this.file?.basename ?? "Session template",
			cls: "archery-rsession-title",
		});
		header.createDiv({
			cls: "archery-rsession-date",
			text: "Copied into each new session. Scorecards and bulk loaders are created when you start them.",
		});

		const toolbar = this.contentEl.createDiv({ cls: "archery-rsession-toolbar" });
		const startBtn = toolbar.createEl("button", {
			cls: "mod-cta archery-rsession-add-btn",
			text: "Start session from template",
		});
		startBtn.addEventListener("click", () => {
			void this.startSession();
		});

		const addTextBtn = toolbar.createEl("button", {
			cls: "archery-rsession-add-btn",
			text: "Add text field",
		});
		addTextBtn.addEventListener("click", () => {
			this.state.blocks.push({ type: "text", content: "" });
			void this.saveAndRender();
		});

		const addScorecardBtn = toolbar.createEl("button", {
			cls: "archery-rsession-add-btn",
			text: "Add scorecard step",
		});
		addScorecardBtn.addEventListener("click", () => {
			this.state.blocks.push({ type: "scorecard", path: "", label: "Scorecard" });
			void this.saveAndRender();
		});

		const addBulkBtn = toolbar.createEl("button", {
			cls: "archery-rsession-add-btn",
			text: "Add bulk loader step",
		});
		addBulkBtn.addEventListener("click", () => {
			this.state.blocks.push({ type: "bulk", path: "", label: "Bulk loader" });
			void this.saveAndRender();
		});

		this.blocksEl = this.contentEl.createDiv({ cls: "archery-rsession-blocks" });
		this.renderBlocks();
	}

	private renderBlocks(): void {
		if (!this.blocksEl) return;
		this.blocksEl.empty();
		if (this.state.blocks.length === 0) {
			this.blocksEl.createDiv({
				cls: "archery-rsession-empty",
				text: "Add the text fields, scorecards, and bulk loaders this session should contain.",
			});
			return;
		}

		for (let index = 0; index < this.state.blocks.length; index++) {
			this.renderBlock(this.state.blocks[index]!, index);
		}
	}

	private renderBlock(block: RSessionBlock, index: number): void {
		if (!this.blocksEl) return;
		const wrap = this.blocksEl.createDiv({ cls: "archery-rsession-block" });
		const header = wrap.createDiv({ cls: "archery-rsession-block-header" });
		header.createSpan({
			cls: "archery-rsession-block-type",
			text: block.type === "text" ? "Text" : block.type === "bulk" ? "Bulk loader" : "Scorecard",
		});
		const removeBtn = header.createEl("button", {
			cls: "clickable-icon",
			attr: { "aria-label": "Remove", type: "button" },
		});
		setIcon(removeBtn, "trash");
		removeBtn.addEventListener("click", () => {
			this.state.blocks.splice(index, 1);
			void this.saveAndRender();
		});

		const body = wrap.createDiv({ cls: "archery-rsession-block-body" });
		if (block.type === "text") {
			const textarea = body.createEl("textarea", {
				cls: "archery-rsession-text-input",
				attr: { rows: "4", placeholder: "Starter text copied into the session…" },
			});
			textarea.value = block.content;
			textarea.addEventListener("input", () => {
				const current = this.state.blocks[index];
				if (!current || current.type !== "text") return;
				current.content = textarea.value;
				this.scheduleSave();
			});
			return;
		}

		const input = body.createEl("input", {
			cls: "archery-rsession-step-label",
			attr: {
				type: "text",
				placeholder: block.type === "bulk" ? "Bulk loader label" : "Scorecard label",
			},
		});
		input.value = block.label ?? "";
		input.addEventListener("input", () => {
			const current = this.state.blocks[index];
			if (!current || (current.type !== "scorecard" && current.type !== "bulk")) return;
			current.label = input.value;
			this.scheduleSave();
		});
	}

	private async startSession(): Promise<void> {
		await this.flushPendingSave();
		this.plugin.openSessionDateModal(this.state);
	}

	private async saveAndRender(): Promise<void> {
		await this.persist();
		this.renderBlocks();
	}

	private scheduleSave(): void {
		if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
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
			await saveRSessionTemplate(this.app, this.file, this.state);
		} catch {
			new Notice("Could not save session template.");
		} finally {
			window.setTimeout(() => {
				this.writing = false;
			}, 0);
		}
	}

	async reloadFromDisk(): Promise<void> {
		if (!this.file || this.writing) return;
		this.state = parseRSessionTemplate(await this.app.vault.read(this.file));
		this.renderBlocks();
	}
}
