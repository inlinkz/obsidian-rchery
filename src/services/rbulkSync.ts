import { Notice, TFolder, type App, type TFile } from 'obsidian';
import { createBulkState, formatClock, type BulkRound, type BulkState } from '../model/rbulk';
import { normalizeScorecardFolder } from '../settings';

export const RBULK_EXTENSION = 'rbulk';
export const RBULK_META_PREFIX = '<!-- rbulk-meta:';

export function serializeBulk(state: BulkState): string {
	const lines = [`${RBULK_META_PREFIX} ${JSON.stringify({ rounds: state.rounds })} -->`, ''];
	lines.push('| Round | Arrows | Time |');
	lines.push('| --- | --- | --- |');
	state.rounds.forEach((round, index) => {
		lines.push(`| ${index + 1} | ${round.arrows} | ${formatClock(round.at)} |`);
	});
	lines.push('');
	return lines.join('\n');
}

export function parseBulk(content: string): BulkState | null {
	const start = content.indexOf(RBULK_META_PREFIX);
	if (start === -1) return null;
	const jsonStart = start + RBULK_META_PREFIX.length;
	const jsonEnd = content.indexOf('-->', jsonStart);
	if (jsonEnd === -1) return null;
	try {
		const raw = JSON.parse(content.slice(jsonStart, jsonEnd).trim()) as { rounds?: unknown };
		if (!Array.isArray(raw.rounds)) return createBulkState();
		const rounds: BulkRound[] = [];
		for (const item of raw.rounds) {
			if (!item || typeof item !== 'object') continue;
			const arrows = (item as { arrows?: unknown }).arrows;
			const at = (item as { at?: unknown }).at;
			if (typeof arrows !== 'number' || !Number.isFinite(arrows) || arrows < 1) continue;
			if (typeof at !== 'string' || Number.isNaN(new Date(at).getTime())) continue;
			rounds.push({ arrows: Math.floor(arrows), at });
		}
		return createBulkState(rounds);
	} catch {
		return null;
	}
}

export async function loadBulkFromFile(app: App, file: TFile): Promise<BulkState> {
	const content = await app.vault.read(file);
	return parseBulk(content) ?? createBulkState();
}

export async function saveBulkToFile(app: App, file: TFile, state: BulkState): Promise<void> {
	await app.vault.modify(file, serializeBulk(state));
}

export async function createBulkFile(app: App, defaultFolder = ''): Promise<TFile | null> {
	const baseName = `Bulk ${formatDateForFilename()}`;
	const folder = resolveParentFolder(app, defaultFolder);
	let path = `${folder.path}/${baseName}.${RBULK_EXTENSION}`;
	let counter = 2;
	while (app.vault.getAbstractFileByPath(path)) {
		path = `${folder.path}/${baseName} ${counter}.${RBULK_EXTENSION}`;
		counter++;
	}
	try {
		return await app.vault.create(path, serializeBulk(createBulkState()));
	} catch {
		new Notice('Could not create bulk loader file.');
		return null;
	}
}

function formatDateForFilename(date = new Date()): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	return `${year}-${month}-${day} ${hours}-${minutes}`;
}

function resolveParentFolder(app: App, configuredFolder: string): TFolder {
	const folderPath = normalizeScorecardFolder(configuredFolder);
	if (folderPath) {
		const folder = app.vault.getAbstractFileByPath(folderPath);
		if (folder instanceof TFolder) return folder;
		new Notice(`Scorecard folder not found: ${folderPath}. Using default location.`);
	}
	return app.fileManager.getNewFileParent('', `Bulk.${RBULK_EXTENSION}`);
}
