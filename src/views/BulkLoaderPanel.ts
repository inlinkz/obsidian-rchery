import { Component, TFile, setIcon, type App } from 'obsidian';
import {
	bulkFinishedAt,
	bulkStartedAt,
	bulkTotal,
	createBulkState,
	elapsedMs,
	formatClock,
	formatDuration,
	roundGapMs,
	type BulkState,
} from '../model/rbulk';
import { loadBulkFromFile, saveBulkToFile } from '../services/rbulkSync';

const PAD_STEPS = [1, 5, 10, -1] as const;

export class BulkLoaderPanel extends Component {
	private state: BulkState = createBulkState();
	private tally = 0;
	private writing = false;
	private ui = new Component();

	constructor(
		public containerEl: HTMLElement,
		private app: App,
		private file: TFile,
	) {
		super();
	}

	onload(): void {
		this.containerEl.addClass('archery-bulk-host');
		void this.reload();
		this.registerEvent(
			this.app.vault.on('modify', (modified) => {
				if (this.writing) return;
				if (modified.path === this.file.path) {
					void this.reload();
				}
			}),
		);
	}

	onunload(): void {
		this.ui.unload();
	}

	private async reload(): Promise<void> {
		try {
			this.state = await loadBulkFromFile(this.app, this.file);
		} catch {
			this.state = createBulkState();
		}
		this.render();
	}

	private render(): void {
		this.removeChild(this.ui);
		this.ui.unload();
		this.ui = new Component();
		this.addChild(this.ui);

		this.containerEl.empty();
		const root = this.containerEl.createDiv({ cls: 'archery-bulk' });
		this.renderSummary(root);
		const columns = root.createDiv({ cls: 'archery-bulk-columns' });
		this.renderRounds(columns);
		this.renderPad(columns);
	}

	private renderSummary(parent: HTMLElement): void {
		const summary = parent.createDiv({ cls: 'archery-bulk-summary' });
		summary.createSpan({
			cls: 'archery-bulk-total',
			text: `${bulkTotal(this.state)} arrows`,
		});

		const started = bulkStartedAt(this.state);
		const finished = bulkFinishedAt(this.state);
		const elapsed = elapsedMs(this.state);
		const timing = summary.createDiv({ cls: 'archery-bulk-timing' });
		timing.createSpan({ text: started ? `Started ${formatClock(started)}` : 'Not started' });
		if (finished) {
			timing.createSpan({ text: `Finished ${formatClock(finished)}` });
		}
		if (elapsed !== null) {
			timing.createSpan({ text: formatDuration(elapsed) });
		}
	}

	private renderRounds(parent: HTMLElement): void {
		const list = parent.createDiv({ cls: 'archery-bulk-rounds' });
		if (this.state.rounds.length === 0) {
			list.createDiv({ cls: 'archery-bulk-empty', text: 'No rounds yet.' });
			return;
		}
		const header = list.createDiv({ cls: 'archery-bulk-round archery-bulk-round-header' });
		header.createSpan({ text: '#' });
		header.createSpan({ text: 'Arrows' });
		header.createSpan({ text: 'Time' });
		header.createSpan({ text: 'Gap' });
		header.createSpan();
		this.state.rounds.forEach((round, index) => {
			const row = list.createDiv({ cls: 'archery-bulk-round' });
			row.createSpan({ cls: 'archery-bulk-round-index', text: String(index + 1) });
			row.createSpan({ cls: 'archery-bulk-round-arrows', text: String(round.arrows) });
			row.createSpan({ cls: 'archery-bulk-round-time', text: formatClock(round.at) });
			const gap = roundGapMs(this.state, index);
			row.createSpan({
				cls: 'archery-bulk-round-gap',
				text: gap === null ? '' : `+${formatDuration(gap)}`,
			});
			const remove = row.createEl('button', {
				cls: 'clickable-icon archery-bulk-round-remove',
				attr: { type: 'button', 'aria-label': 'Remove batch' },
			});
			setIcon(remove, 'trash');
			this.ui.registerDomEvent(remove, 'click', () => {
				void this.removeRound(index);
			});
		});
	}

	private renderPad(parent: HTMLElement): void {
		const pad = parent.createDiv({ cls: 'archery-bulk-pad' });
		pad.createDiv({ cls: 'archery-bulk-tally', text: String(this.tally) });

		const steps = pad.createDiv({ cls: 'archery-bulk-steps' });
		for (const step of PAD_STEPS) {
			const button = steps.createEl('button', {
				cls: `archery-bulk-step ${step < 0 ? 'archery-bulk-step-neg' : 'archery-bulk-step-pos'}`,
				text: String(step),
				attr: { type: 'button' },
			});
			this.ui.registerDomEvent(button, 'click', () => {
				this.tally = Math.max(0, this.tally + step);
				this.render();
			});
		}

		const ok = pad.createEl('button', {
			cls: 'mod-cta archery-bulk-ok',
			text: 'OK',
			attr: { type: 'button' },
		});
		ok.disabled = this.tally < 1;
		this.ui.registerDomEvent(ok, 'click', () => {
			void this.commit();
		});

		const reset = pad.createEl('button', {
			cls: 'archery-bulk-reset',
			text: 'Reset',
			attr: { type: 'button' },
		});
		this.ui.registerDomEvent(reset, 'click', () => {
			this.tally = 0;
			this.render();
		});
	}

	private async commit(): Promise<void> {
		if (this.tally < 1) return;
		this.state.rounds.push({ arrows: this.tally, at: new Date().toISOString() });
		this.tally = 0;
		await this.persist();
	}

	private async removeRound(index: number): Promise<void> {
		if (index < 0 || index >= this.state.rounds.length) return;
		this.state.rounds.splice(index, 1);
		await this.persist();
	}

	private async persist(): Promise<void> {
		this.writing = true;
		try {
			await saveBulkToFile(this.app, this.file, this.state);
		} finally {
			window.setTimeout(() => {
				this.writing = false;
			}, 0);
		}
		this.render();
	}
}
