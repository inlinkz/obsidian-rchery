import { App, PluginSettingTab, Setting, type SettingDefinitionItem } from 'obsidian';
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

	getSettingDefinitions(): SettingDefinitionItem[] {
		const presetOptions: Record<string, string> = {};
		for (const preset of getAllPresets(this.plugin.settings)) {
			presetOptions[preset.name] = this.presetLabel(preset);
		}

		return [
			{
				name: 'RChery',
				desc: 'Presets ("defaults") define named layouts that appear at the top of every scorecard. Each .rchery file still stores its own dimensions in the markup.',
			},
			{
				name: 'Default for new scorecards',
				desc: 'Preset applied when you create a new scorecard.',
				control: {
					type: 'dropdown',
					key: 'defaultPresetName',
					options: presetOptions,
				},
			},
			{
				type: 'group',
				heading: 'Target face',
				items: [
					{
						name: 'Touch offset',
						desc: 'Shifts the arrow and score this many pixels above your finger on the target so you can see where it lands on mobile.',
						control: {
							type: 'slider',
							key: 'targetTouchOffsetY',
							min: TARGET_TOUCH_OFFSET_LIMITS.min,
							max: TARGET_TOUCH_OFFSET_LIMITS.max,
							step: 4,
						},
					},
				],
			},
			{
				type: 'group',
				heading: 'Built-in presets',
				items: BUILTIN_PRESETS.map((preset) => ({
					name: preset.name,
					desc: this.presetLabel(preset),
				})),
			},
			{
				type: 'list',
				heading: 'Custom presets',
				emptyState: 'No custom presets yet. Add one below.',
				items: this.plugin.settings.customPresets.map((preset, index) => ({
					name: preset.name.trim() || `Preset ${index + 1}`,
					render: (setting) => {
						this.renderPresetEditor(setting, index);
					},
				})),
				onDelete: async (index) => {
					this.plugin.settings.customPresets.splice(index, 1);
					await this.plugin.saveSettings();
					this.plugin.refreshScorecardPresets();
					this.update();
				},
				addItem: {
					name: 'Add preset',
					action: async () => {
						this.plugin.settings.customPresets.push({
							name: `Preset ${this.plugin.settings.customPresets.length + 1}`,
							cardsCount: 2,
							endsPerCard: 6,
							arrowsPerEnd: 6,
						});
						await this.plugin.saveSettings();
						this.plugin.refreshScorecardPresets();
						this.update();
					},
				},
			},
		];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === 'defaultPresetName' && typeof value === 'string') {
			this.plugin.settings.defaultPresetName = value;
		} else if (key === 'targetTouchOffsetY' && typeof value === 'number') {
			this.plugin.settings.targetTouchOffsetY = value;
		}
		await this.plugin.saveSettings();
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
