import type { Component, TFile } from 'obsidian';
import type ArcheryPlugin from '../main';
import { ARCHERY_EXTENSION } from './markdownSync';
import { RBULK_EXTENSION } from './rbulkSync';
import { ArcheryEmbed } from '../views/ArcheryEmbed';
import { BulkLoaderPanel } from '../views/BulkLoaderPanel';

interface EmbedContext {
	containerEl: HTMLElement;
}

interface EmbedRegistry {
	registerExtension(
		extension: string,
		embedCreator: (context: EmbedContext, file: TFile) => Component,
	): void;
	unregisterExtension(extension: string): void;
}

interface AppWithEmbedRegistry {
	embedRegistry?: EmbedRegistry;
}

export function registerArcheryEmbed(plugin: ArcheryPlugin): void {
	const registry = (plugin.app as unknown as AppWithEmbedRegistry).embedRegistry;
	if (!registry) {
		return;
	}

	registry.registerExtension(ARCHERY_EXTENSION, (context, file) => {
		return new ArcheryEmbed(context.containerEl, plugin.app, file, plugin);
	});
	registry.registerExtension(RBULK_EXTENSION, (context, file) => {
		return new BulkLoaderPanel(context.containerEl, plugin.app, file);
	});

	plugin.register(() => {
		registry.unregisterExtension(ARCHERY_EXTENSION);
		registry.unregisterExtension(RBULK_EXTENSION);
	});
}
