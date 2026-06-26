import { Component, type App, type TFile } from 'obsidian';
import type ArcheryPlugin from '../main';
import { parseScorecardBlock } from '../services/markdownSync';
import {
	collectTargetShots,
	renderReadonlySessionTables,
	renderReadonlyTarget,
	sessionHasTargetCoords,
} from './renderReadonly';
import { sessionGrandTotal } from '../model/scorecard';

export class ArcheryEmbed extends Component {
	constructor(
		public containerEl: HTMLElement,
		private app: App,
		private file: TFile,
		private plugin: ArcheryPlugin,
	) {
		super();
	}

	onload(): void {
		this.containerEl.addClass('archery-embed');
		void this.render();
		this.registerEvent(
			this.app.vault.on('modify', (modified) => {
				if (modified.path === this.file.path) {
					void this.render();
				}
			}),
		);
	}

	private async render(): Promise<void> {
		this.containerEl.empty();

		let content: string;
		try {
			content = await this.app.vault.read(this.file);
		} catch {
			this.containerEl.createDiv({
				cls: 'archery-embed-error',
				text: 'Could not read scorecard.',
			});
			return;
		}

		const state = parseScorecardBlock(content);
		if (!state) {
			this.containerEl.createDiv({
				cls: 'archery-embed-error',
				text: 'Could not parse scorecard.',
			});
			return;
		}

		const title = this.containerEl.createDiv({ cls: 'archery-embed-title' });
		title.setText(this.file.basename);

		const body = this.containerEl.createDiv({ cls: 'archery-embed-body' });

		if (sessionHasTargetCoords(state)) {
			const targetWrap = body.createDiv({ cls: 'archery-target-wrap' });
			renderReadonlyTarget(
				targetWrap,
				collectTargetShots(state),
				this.plugin.settings.targetShotMarkerSize,
				this.plugin.settings.showShotScores,
			);
			const footer = body.createDiv({ cls: 'archery-embed-footer' });
			footer.setText(`Grand total: ${sessionGrandTotal(state)}`);
		} else {
			renderReadonlySessionTables(body, state);
		}
	}
}
