import { App, PluginSettingTab, Setting } from 'obsidian';
import type ArcheryPlugin from './main';
import { CONFIG_LIMITS, normalizeConfig, type SessionConfig } from './model/scorecard';

export interface LayoutPreset {
	name: string;
	endsPerCard: number;
	arrowsPerEnd: number;
	cardsCount: number;
}

export const BUILTIN_PRESETS: LayoutPreset[] = [
	{ name: 'Indoor', cardsCount: 2, endsPerCard: 10, arrowsPerEnd: 3 },
	{ name: 'Outdoor', cardsCount: 2, endsPerCard: 6, arrowsPerEnd: 6 },
];

export interface ArcheryPluginSettings {
	customPresets: LayoutPreset[];
	defaultPresetName: string;
	/** Pixels to shift the drag preview above the finger (score still at touch point). */
	targetTouchOffsetY: number;
}

export const DEFAULT_SETTINGS: ArcheryPluginSettings = {
	customPresets: [],
	defaultPresetName: 'Outdoor',
	targetTouchOffsetY: 48,
};

const TARGET_TOUCH_OFFSET_LIMITS = { min: 0, max: 200 } as const;

function normalizePreset(preset: Partial<LayoutPreset>): LayoutPreset {
	const config = normalizeConfig({
		endsPerCard: preset.endsPerCard,
		arrowsPerEnd: preset.arrowsPerEnd,
		cardsCount: preset.cardsCount,
	});
	return {
		name: (preset.name ?? '').trim() || 'Preset',
		endsPerCard: config.endsPerCard,
		arrowsPerEnd: config.arrowsPerEnd,
		cardsCount: config.cardsCount,
	};
}

export function normalizeSettings(
	settings: Partial<ArcheryPluginSettings>,
): ArcheryPluginSettings {
	const customPresets = Array.isArray(settings.customPresets)
		? settings.customPresets.map((preset) => normalizePreset(preset))
		: [];
	const offset = settings.targetTouchOffsetY ?? DEFAULT_SETTINGS.targetTouchOffsetY;
	return {
		customPresets,
		defaultPresetName: settings.defaultPresetName ?? DEFAULT_SETTINGS.defaultPresetName,
		targetTouchOffsetY: Math.min(
			TARGET_TOUCH_OFFSET_LIMITS.max,
			Math.max(TARGET_TOUCH_OFFSET_LIMITS.min, Math.round(offset)),
		),
	};
}

export function getAllPresets(settings: ArcheryPluginSettings): LayoutPreset[] {
	const builtinNames = new Set(BUILTIN_PRESETS.map((p) => p.name.toLowerCase()));
	const customs = settings.customPresets.filter(
		(p) => p.name.trim().length > 0 && !builtinNames.has(p.name.toLowerCase()),
	);
	return [...BUILTIN_PRESETS, ...customs];
}

export function presetToConfig(preset: LayoutPreset): SessionConfig {
	return normalizeConfig({
		endsPerCard: preset.endsPerCard,
		arrowsPerEnd: preset.arrowsPerEnd,
		cardsCount: preset.cardsCount,
		roundType: preset.name,
	});
}

export function configMatchesPreset(
	preset: LayoutPreset,
	config: SessionConfig,
): boolean {
	return (
		preset.cardsCount === config.cardsCount &&
		preset.endsPerCard === config.endsPerCard &&
		preset.arrowsPerEnd === config.arrowsPerEnd
	);
}

export function resolveRoundType(
	config: SessionConfig,
	presets: LayoutPreset[],
): string {
	const stored = config.roundType?.trim();
	if (stored) return stored;
	return presets.find((p) => configMatchesPreset(p, config))?.name ?? 'Custom';
}

export function getDefaultPreset(settings: ArcheryPluginSettings): LayoutPreset {
	const all = getAllPresets(settings);
	return (
		all.find((p) => p.name === settings.defaultPresetName) ?? all[0] ?? BUILTIN_PRESETS[1]!
	);
}

export class ArcherySettingTab extends PluginSettingTab {
	plugin: ArcheryPlugin;

	constructor(app: App, plugin: ArcheryPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('p', {
			cls: 'setting-item-description',
			text: 'Presets ("defaults") define named layouts that appear at the top of every scorecard. Each .rchery file still stores its own dimensions in the markup.',
		});

		const presetOptions: Record<string, string> = {};
		for (const preset of getAllPresets(this.plugin.settings)) {
			presetOptions[preset.name] = this.presetLabel(preset);
		}

		new Setting(containerEl)
			.setName('Default for new scorecards')
			.setDesc('Preset applied when you create a new scorecard.')
			.addDropdown((dropdown) => {
				for (const [value, label] of Object.entries(presetOptions)) {
					dropdown.addOption(value, label);
				}
				dropdown
					.setValue(this.plugin.settings.defaultPresetName)
					.onChange(async (value) => {
						this.plugin.settings.defaultPresetName = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl).setName('Target face').setHeading();

		new Setting(containerEl)
			.setName('Touch offset')
			.setDesc(
				'Shifts the arrow and score this many pixels above your finger on the target so you can see where it lands on mobile.',
			)
			.addSlider((slider) => {
				slider
					.setLimits(
						TARGET_TOUCH_OFFSET_LIMITS.min,
						TARGET_TOUCH_OFFSET_LIMITS.max,
						4,
					)
					.setValue(this.plugin.settings.targetTouchOffsetY)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.targetTouchOffsetY = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl).setName('Built-in presets').setHeading();
		for (const preset of BUILTIN_PRESETS) {
			new Setting(containerEl)
				.setName(preset.name)
				.setDesc(this.presetLabel(preset));
		}

		new Setting(containerEl).setName('Custom presets').setHeading();

		if (this.plugin.settings.customPresets.length === 0) {
			containerEl.createEl('p', {
				cls: 'setting-item-description',
				text: 'No custom presets yet. Add one below.',
			});
		}

		for (let index = 0; index < this.plugin.settings.customPresets.length; index++) {
			const preset = this.plugin.settings.customPresets[index]!;
			const setting = new Setting(containerEl)
				.setName(preset.name.trim() || `Preset ${index + 1}`)
				.addExtraButton((button) => {
					button
						.setIcon('trash')
						.setTooltip('Delete preset')
						.onClick(async () => {
							this.plugin.settings.customPresets.splice(index, 1);
							await this.plugin.saveSettings();
							this.plugin.refreshScorecardPresets();
							this.display();
						});
				});
			this.renderPresetEditor(setting, index);
		}

		new Setting(containerEl).addButton((button) => {
			button
				.setButtonText('Add preset')
				.setCta()
				.onClick(async () => {
					this.plugin.settings.customPresets.push({
						name: `Preset ${this.plugin.settings.customPresets.length + 1}`,
						cardsCount: 2,
						endsPerCard: 6,
						arrowsPerEnd: 6,
					});
					await this.plugin.saveSettings();
					this.plugin.refreshScorecardPresets();
					this.display();
				});
		});
	}

	private presetLabel(preset: LayoutPreset): string {
		return `${preset.cardsCount} cards × ${preset.endsPerCard} ends × ${preset.arrowsPerEnd} arrows`;
	}

	private renderPresetEditor(setting: Setting, index: number): void {
		const preset = this.plugin.settings.customPresets[index]!;

		setting.addText((text) =>
			text
				.setPlaceholder('Name')
				.setValue(preset.name)
				.onChange(async (value) => {
					this.plugin.settings.customPresets[index]!.name = value;
					await this.plugin.saveSettings();
				}),
		);

		this.addNumberDropdown(setting, 'Cards', CONFIG_LIMITS.cardsCount, preset.cardsCount, async (value) => {
			this.plugin.settings.customPresets[index]!.cardsCount = value;
			await this.plugin.saveSettings();
		});
		this.addNumberDropdown(setting, 'Ends', CONFIG_LIMITS.endsPerCard, preset.endsPerCard, async (value) => {
			this.plugin.settings.customPresets[index]!.endsPerCard = value;
			await this.plugin.saveSettings();
		});
		this.addNumberDropdown(setting, 'Arrows', CONFIG_LIMITS.arrowsPerEnd, preset.arrowsPerEnd, async (value) => {
			this.plugin.settings.customPresets[index]!.arrowsPerEnd = value;
			await this.plugin.saveSettings();
		});
	}

	private addNumberDropdown(
		setting: Setting,
		label: string,
		limits: { min: number; max: number },
		value: number,
		onChange: (value: number) => Promise<void>,
	): void {
		setting.addDropdown((dropdown) => {
			for (let option = limits.min; option <= limits.max; option++) {
				dropdown.addOption(String(option), String(option));
			}
			dropdown.setValue(String(value)).onChange(async (raw) => {
				const parsed = Number.parseInt(raw, 10);
				if (!Number.isNaN(parsed)) await onChange(parsed);
			});
			dropdown.selectEl.setAttribute('aria-label', label);
			dropdown.selectEl.title = label;
		});
	}
}
