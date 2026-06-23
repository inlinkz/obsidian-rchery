import { App, Modal, Setting } from 'obsidian';

export class EndNoteModal extends Modal {
	private initial: string;
	private onSave: (note: string) => void;
	private textarea: HTMLTextAreaElement | null = null;

	constructor(
		app: App,
		title: string,
		initial: string,
		onSave: (note: string) => void,
	) {
		super(app);
		this.titleEl.setText(title);
		this.initial = initial;
		this.onSave = onSave;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('archery-end-note-modal');

		contentEl.createDiv({
			cls: 'archery-end-note-hint',
			text: 'Markdown supported. Leave empty to remove the note.',
		});

		new Setting(contentEl).setClass('archery-end-note-setting').addTextArea((area) => {
			area.inputEl.addClass('archery-end-note-textarea');
			area.inputEl.rows = 10;
			area.inputEl.value = this.initial;
			area.inputEl.spellcheck = true;
			this.textarea = area.inputEl;
			area.inputEl.addEventListener('keydown', (event) => {
				if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
					event.preventDefault();
					this.save();
				}
			});
		});

		const actions = contentEl.createDiv({ cls: 'archery-end-note-actions' });
		actions.createEl('button', { text: 'Cancel', cls: 'mod-warning' }).addEventListener('click', () => {
			this.close();
		});
		actions.createEl('button', { text: 'Save', cls: 'mod-cta' }).addEventListener('click', () => {
			this.save();
		});

		requestAnimationFrame(() => {
			this.textarea?.focus();
			const length = this.textarea?.value.length ?? 0;
			this.textarea?.setSelectionRange(length, length);
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private save(): void {
		this.onSave(this.textarea?.value ?? '');
		this.close();
	}
}
