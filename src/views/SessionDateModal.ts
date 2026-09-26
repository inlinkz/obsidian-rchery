import { App, Modal } from 'obsidian';
import { formatSessionDate, isValidSessionDate } from '../model/rsession';

export class SessionDateModal extends Modal {
	private onConfirm: (date: string) => void;
	private inputEl: HTMLInputElement | null = null;
	private errorEl: HTMLElement | null = null;

	constructor(app: App, onConfirm: (date: string) => void) {
		super(app);
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		this.modalEl.addClass('archery-session-date-modal-container');
		this.titleEl.setText('New training session');
		const { contentEl } = this;
		contentEl.addClass('archery-session-date-modal');

		contentEl.createDiv({
			cls: 'archery-session-date-hint',
			text: 'Pick a date for this session. If a session already exists for that day, it will be opened instead.',
		});

		const row = contentEl.createDiv({ cls: 'archery-session-date-row' });
		row.createEl('label', {
			text: 'Date',
			attr: { for: 'archery-session-date-input' },
		});
		this.inputEl = row.createEl('input', {
			cls: 'archery-session-date-input',
			attr: {
				id: 'archery-session-date-input',
				type: 'date',
				value: formatSessionDate(),
			},
		});
		this.inputEl.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				this.submit();
			}
		});

		this.errorEl = contentEl.createDiv({ cls: 'archery-session-date-error' });
		this.errorEl.hide();

		const actions = contentEl.createDiv({ cls: 'archery-session-date-actions' });
		actions.createEl('button', { text: 'Cancel' }).addEventListener('click', () => {
			this.close();
		});
		actions.createEl('button', { text: 'Open', cls: 'mod-cta' }).addEventListener('click', () => {
			this.submit();
		});

		requestAnimationFrame(() => {
			this.inputEl?.focus();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private submit(): void {
		const date = this.inputEl?.value.trim() ?? '';
		if (!isValidSessionDate(date)) {
			if (this.errorEl) {
				this.errorEl.setText('Enter a valid date.');
				this.errorEl.show();
			}
			return;
		}
		this.close();
		this.onConfirm(date);
	}
}
