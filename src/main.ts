import { Notice, Plugin, TFile } from 'obsidian';
import { ARCHERY_EXTENSION, createScorecardFile } from './services/markdownSync';
import { registerArcheryEmbed } from './services/embedRegistry';
import {
	appendBlockToSession,
	createSessionFromTemplate,
	createSessionTemplateFile,
	findOrCreateSessionFile,
	isSessionFile,
	isSessionTemplateFile,
	SESSION_EXTENSION,
	TEMPLATE_EXTENSION,
} from './services/rsessionSync';
import { getSessionCardType } from './session/cardTypes';
import {
	ArcherySettingTab,
	DEFAULT_SETTINGS,
	getDefaultPreset,
	normalizeSettings,
	presetToConfig,
	type ArcheryPluginSettings,
} from './settings';
import { ScorecardView, VIEW_TYPE_SCORECARD } from './views/ScorecardView';
import { BulkLoaderView, VIEW_TYPE_BULK } from './views/BulkLoaderView';
import { createBulkFile, RBULK_EXTENSION } from './services/rbulkSync';
import type { RSessionTemplateState } from './model/rsession';
import { RSessionView, VIEW_TYPE_RSESSION } from './views/RSessionView';
import { RSessionTemplateView, VIEW_TYPE_RSESSION_TEMPLATE } from './views/RSessionTemplateView';
import { SessionDateModal } from './views/SessionDateModal';

export default class ArcheryPlugin extends Plugin {
	settings: ArcheryPluginSettings = { ...DEFAULT_SETTINGS };

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(
			VIEW_TYPE_SCORECARD,
			(leaf) => new ScorecardView(leaf, this),
		);
		this.registerView(
			VIEW_TYPE_RSESSION,
			(leaf) => new RSessionView(leaf, this),
		);
		this.registerView(
			VIEW_TYPE_RSESSION_TEMPLATE,
			(leaf) => new RSessionTemplateView(leaf, this),
		);
		this.registerView(VIEW_TYPE_BULK, (leaf) => new BulkLoaderView(leaf));

		this.registerExtensions([ARCHERY_EXTENSION], VIEW_TYPE_SCORECARD);
		this.registerExtensions([RBULK_EXTENSION], VIEW_TYPE_BULK);
		this.registerExtensions([SESSION_EXTENSION], VIEW_TYPE_RSESSION);
		this.registerExtensions([TEMPLATE_EXTENSION], VIEW_TYPE_RSESSION_TEMPLATE);

		registerArcheryEmbed(this);

		this.addSettingTab(new ArcherySettingTab(this.app, this));

		this.addRibbonIcon('target', 'New archery scorecard', () => {
			void this.createAndOpenScorecard();
		});
		this.addRibbonIcon('calendar', 'New training session', () => {
			this.openSessionDateModal();
		});
		this.addRibbonIcon('list', 'New bulk loader', () => {
			void this.createAndOpenBulk();
		});

		this.addCommand({
			id: 'new-scorecard',
			name: 'New scorecard',
			callback: () => {
				void this.createAndOpenScorecard();
			},
		});

		this.addCommand({
			id: 'new-bulk',
			name: 'New bulk loader',
			callback: () => {
				void this.createAndOpenBulk();
			},
		});

		this.addCommand({
			id: 'new-session',
			name: 'New training session',
			callback: () => {
				this.openSessionDateModal();
			},
		});

		this.addCommand({
			id: 'new-session-template',
			name: 'New session template',
			callback: () => {
				void this.createAndOpenSessionTemplate();
			},
		});

		this.addCommand({
			id: 'add-scorecard-to-session',
			name: 'Add scorecard to training session',
			checkCallback: (checking) => {
				const file = this.getActiveSessionFile();
				if (!file) return false;
				if (!checking) {
					void this.addCardToSession(file, 'scorecard');
				}
				return true;
			},
		});

		this.addCommand({
			id: 'add-bulk-to-session',
			name: 'Add bulk loader to training session',
			checkCallback: (checking) => {
				const file = this.getActiveSessionFile();
				if (!file) return false;
				if (!checking) {
					void this.addCardToSession(file, 'bulk');
				}
				return true;
			},
		});

		this.addCommand({
			id: 'add-text-to-session',
			name: 'Add text to training session',
			checkCallback: (checking) => {
				const view = this.app.workspace.getActiveViewOfType(RSessionView);
				if (!view) return false;
				if (!checking) {
					void view.addTextBlockPublic();
				}
				return true;
			},
		});

		this.addCommand({
			id: 'reset-scorecard',
			name: 'Reset scorecard',
			checkCallback: (checking) => {
				const view = this.getActiveScorecardView();
				if (!view) return false;
				if (!checking) {
					void view.resetSession();
				}
				return true;
			},
		});

		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (!(file instanceof TFile) || !isSessionFile(file)) return;
				menu.addItem((item) => {
					item
						.setTitle('Add scorecard')
						.setIcon('target')
						.onClick(() => {
							void this.addCardToSession(file);
						});
				});
			}),
		);

		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (!(file instanceof TFile)) return;
				if (isSessionFile(file)) {
					for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_RSESSION)) {
						const view = leaf.view;
						if (view instanceof RSessionView && view.file?.path === file.path) {
							void view.reloadFromDisk();
						}
					}
				}
				if (isSessionTemplateFile(file)) {
					for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_RSESSION_TEMPLATE)) {
						const view = leaf.view;
						if (view instanceof RSessionTemplateView && view.file?.path === file.path) {
							void view.reloadFromDisk();
						}
					}
				}
			}),
		);
	}

	async loadSettings(): Promise<void> {
		this.settings = normalizeSettings({
			...DEFAULT_SETTINGS,
			...((await this.loadData()) as Partial<ArcheryPluginSettings> | null),
		});
	}

	async saveSettings(): Promise<void> {
		this.settings = normalizeSettings(this.settings);
		await this.saveData(this.settings);
		this.refreshScorecardViews();
	}

	refreshScorecardViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_SCORECARD)) {
			if (leaf.view instanceof ScorecardView) {
				leaf.view.onSettingsChanged();
			}
		}
	}

	refreshScorecardPresets(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_SCORECARD)) {
			if (leaf.view instanceof ScorecardView) {
				leaf.view.onPresetsChanged();
			}
		}
	}

	getActiveScorecardView(): ScorecardView | null {
		const leaf = this.app.workspace.getActiveViewOfType(ScorecardView);
		return leaf ?? null;
	}

	getActiveSessionFile(): TFile | null {
		const file = this.app.workspace.getActiveFile();
		if (!file || !isSessionFile(file)) return null;
		return file;
	}

	openSessionDateModal(template?: RSessionTemplateState): void {
		new SessionDateModal(this.app, (date) => {
			void this.createAndOpenSession(date, template);
		}).open();
	}

	async createAndOpenSession(date: string, template?: RSessionTemplateState): Promise<void> {
		const file = template
			? await createSessionFromTemplate(
					this.app,
					date,
					template,
					this.settings.defaultSessionFolder,
				)
			: await findOrCreateSessionFile(this.app, date, this.settings.defaultSessionFolder);
		if (!file) return;

		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);
	}

	async createAndOpenSessionTemplate(): Promise<void> {
		const file = await createSessionTemplateFile(this.app, this.settings.defaultSessionFolder);
		if (!file) return;
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);
	}

	async createCardForSession(sessionFile: TFile, typeId: string): Promise<string | null> {
		const cardType = getSessionCardType(typeId);
		if (!cardType) return null;
		const block = await cardType.create({
			app: this.app,
			plugin: this,
			sessionFile,
		});
		return block?.path ?? null;
	}

	async addCardToSession(sessionFile: TFile, typeId = 'scorecard'): Promise<void> {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_RSESSION)) {
			const view = leaf.view;
			if (view instanceof RSessionView && view.file?.path === sessionFile.path) {
				await view.flushPendingSave();
			}
		}

		const cardType = getSessionCardType(typeId);
		if (!cardType) {
			new Notice(`Unknown card type: ${typeId}`);
			return;
		}

		const block = await cardType.create({
			app: this.app,
			plugin: this,
			sessionFile,
		});
		if (!block) return;

		const ok = await appendBlockToSession(this.app, sessionFile, block);
		if (!ok) {
			new Notice(`Could not add ${cardType.label.toLowerCase()} to session.`);
			return;
		}

		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_RSESSION)) {
			const view = leaf.view;
			if (view instanceof RSessionView && view.file?.path === sessionFile.path) {
				await view.reloadFromDisk();
			}
		}

		const created =
			this.app.vault.getAbstractFileByPath(block.path) ??
			this.app.metadataCache.getFirstLinkpathDest(block.path, sessionFile.path);
		if (created instanceof TFile) {
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(created);
		}
	}

	async createAndOpenBulk(): Promise<void> {
		const file = await createBulkFile(this.app, this.settings.defaultScorecardFolder);
		if (!file) return;
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);
	}

	async createAndOpenScorecard(): Promise<void> {
		const preset = getDefaultPreset(this.settings);
		const config = presetToConfig(preset);
		const file = await createScorecardFile(
			this.app,
			config,
			this.settings.defaultScorecardFolder,
		);
		if (!file) return;

		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);
	}
}
