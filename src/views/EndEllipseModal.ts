import { App, Modal, Setting } from 'obsidian';
import {
	SHOT_MARKER_SIZE_MAX,
	SHOT_MARKER_SIZE_MIN,
	normalizeShotMarkerSize,
} from '../model/targetMarker';
import type ArcheryPlugin from '../main';

export class EndEllipseModal extends Modal {
	private plugin: ArcheryPlugin;
	private onChange: () => void;

	constructor(app: App, plugin: ArcheryPlugin, onChange: () => void) {
		super(app);
		this.plugin = plugin;
		this.onChange = onChange;
	}

	onOpen(): void {
		this.titleEl.setText('Target visibility');
		this.modalEl.addClass('archery-end-ellipse-modal-container');
		const { contentEl } = this;
		contentEl.addClass('archery-end-ellipse-modal');

		contentEl.createDiv({
			cls: 'archery-end-ellipse-hint',
			text: 'This setting applies to all scorecards. When enabled, each ellipse is shown only for ends that are visible on the target using the end visibility buttons on the scorecard.',
		});

		new Setting(contentEl)
			.setName('Show end group ellipses')
			.setDesc(
				'Draw a semi-transparent ellipse around placed arrows, aligned to the least-squares axis through each end.',
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.showEndEllipses)
					.onChange(async (value) => {
						this.plugin.settings.showEndEllipses = value;
						await this.plugin.saveSettings();
						this.onChange();
					});
			});

		new Setting(contentEl)
			.setName('Shot marker size')
			.setDesc(
				'Size of each placed arrow on the target. Size 1 is a small black dot only; sizes 2–10 use end colour with a white outline.',
			)
			.addDropdown((dropdown) => {
				for (let size = SHOT_MARKER_SIZE_MIN; size <= SHOT_MARKER_SIZE_MAX; size++) {
					dropdown.addOption(String(size), String(size));
				}
				dropdown
					.setValue(String(this.plugin.settings.targetShotMarkerSize))
					.onChange(async (value) => {
						this.plugin.settings.targetShotMarkerSize = normalizeShotMarkerSize(
							Number.parseInt(value, 10),
						);
						await this.plugin.saveSettings();
						this.onChange();
					});
			});

		new Setting(contentEl)
			.setName('Show scores on target')
			.setDesc('Display the score value above each placed arrow circle.')
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.showShotScores)
					.onChange(async (value) => {
						this.plugin.settings.showShotScores = value;
						await this.plugin.saveSettings();
						this.onChange();
					});
			});

		const actions = contentEl.createDiv({ cls: 'archery-end-ellipse-actions' });
		actions.createEl('button', { text: 'Close', cls: 'mod-cta' }).addEventListener('click', () => {
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
