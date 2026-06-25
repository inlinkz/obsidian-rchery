import { AbstractInputSuggest, App, TFolder } from 'obsidian';

export class FolderSuggest extends AbstractInputSuggest<TFolder> {
	private readonly textInput: HTMLInputElement;

	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);
		this.textInput = inputEl;
	}

	getSuggestions(query: string): TFolder[] {
		const lower = query.trim().toLowerCase();
		const folders = this.app.vault.getAllFolders();

		if (!lower) {
			return folders.sort((a, b) => a.path.localeCompare(b.path));
		}

		return folders
			.filter((folder) => folder.path.toLowerCase().includes(lower))
			.sort((a, b) => {
				const aPath = a.path.toLowerCase();
				const bPath = b.path.toLowerCase();
				const aStarts = aPath.startsWith(lower);
				const bStarts = bPath.startsWith(lower);
				if (aStarts !== bStarts) return aStarts ? -1 : 1;
				return a.path.localeCompare(b.path);
			});
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path || '/');
	}

	selectSuggestion(folder: TFolder, _evt: MouseEvent | KeyboardEvent): void {
		this.setValue(folder.path);
		this.textInput.dispatchEvent(new Event('input'));
		this.close();
	}
}
