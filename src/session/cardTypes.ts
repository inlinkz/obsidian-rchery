import type { App, TFile } from 'obsidian';
import type ArcheryPlugin from '../main';
import {
	createScorecardFile,
	loadSessionFromFile,
	saveSessionToFile,
} from '../services/markdownSync';
import { createBulkFile } from '../services/rbulkSync';
import { getDefaultPreset, presetToConfig } from '../settings';
import type { RSessionLinkedBlock } from '../model/rsession';

export interface SessionCardCreateContext {
	app: App;
	plugin: ArcheryPlugin;
	sessionFile: TFile;
}

export interface SessionCardType {
	id: string;
	label: string;
	create(ctx: SessionCardCreateContext): Promise<RSessionLinkedBlock | null>;
}

const scorecardCardType: SessionCardType = {
	id: 'scorecard',
	label: 'Scorecard',
	async create(ctx) {
		const preset = getDefaultPreset(ctx.plugin.settings);
		const config = presetToConfig(preset);
		const file = await createScorecardFile(
			ctx.app,
			config,
			ctx.plugin.settings.defaultScorecardFolder,
		);
		if (!file) return null;

		const sessionLink = ctx.app.metadataCache.fileToLinktext(ctx.sessionFile, file.path);
		const state = await loadSessionFromFile(ctx.app, file);
		state.session = sessionLink;
		await saveSessionToFile(ctx.app, file, state);

		const linkPath = ctx.app.metadataCache.fileToLinktext(file, ctx.sessionFile.path);
		return { type: 'scorecard', path: linkPath };
	},
};

const bulkCardType: SessionCardType = {
	id: 'bulk',
	label: 'Bulk loader',
	async create(ctx) {
		const file = await createBulkFile(ctx.app, ctx.plugin.settings.defaultScorecardFolder);
		if (!file) return null;
		const linkPath = ctx.app.metadataCache.fileToLinktext(file, ctx.sessionFile.path);
		return { type: 'bulk', path: linkPath };
	},
};

/** Registered card types. Add future types here. */
const CARD_TYPES: SessionCardType[] = [scorecardCardType, bulkCardType];

export function getSessionCardTypes(): SessionCardType[] {
	return [...CARD_TYPES];
}

export function getSessionCardType(id: string): SessionCardType | undefined {
	return CARD_TYPES.find((type) => type.id === id);
}
