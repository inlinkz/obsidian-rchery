import { Plugin } from 'obsidian';
import { ARCHERY_EXTENSION, createScorecardFile } from './services/markdownSync';
import { registerArcheryEmbed } from './services/embedRegistry';
import {
	ArcherySettingTab,
	DEFAULT_SETTINGS,
	getDefaultPreset,
	normalizeSettings,
	presetToConfig,
	type ArcheryPluginSettings,
} from './settings';
import { ScorecardView, VIEW_TYPE_SCORECARD } from './views/ScorecardView';

export default class ArcheryPlugin extends Plugin {
	settings: ArcheryPluginSettings = { ...DEFAULT_SETTINGS };

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(
			VIEW_TYPE_SCORECARD,
			(leaf) => new ScorecardView(leaf, this),
		);

		this.registerExtensions([ARCHERY_EXTENSION], VIEW_TYPE_SCORECARD);

		registerArcheryEmbed(this);

		this.addSettingTab(new ArcherySettingTab(this.app, this));

		this.addRibbonIcon('target', 'New archery scorecard', () => {
			void this.createAndOpenScorecard();
		});

		this.addCommand({
			id: 'new-scorecard',
			name: 'New scorecard',
			callback: () => {
				void this.createAndOpenScorecard();
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

	async createAndOpenScorecard(): Promise<void> {
		const preset = getDefaultPreset(this.settings);
		const config = presetToConfig(preset);
		const file = await createScorecardFile(this.app, config);
		if (!file) return;

		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);
	}
}
