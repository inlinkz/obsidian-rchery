import { Component, MarkdownRenderer } from 'obsidian';
import { endColorClass, type SessionState } from '../model/scorecard';
import {
	collectEndTargetShots,
	endHasReviewContent,
	renderEndReviewScores,
	renderReadonlyEndTarget,
} from './renderReadonly';

export function renderSessionReview(
	parent: HTMLElement,
	state: SessionState,
	sourcePath: string,
	component: Component,
	markerSize?: number,
	showShotScores?: boolean,
): boolean {
	const body = parent.createDiv({ cls: 'archery-session-review-body' });
	const { config } = state;
	const multiCard = config.cardsCount > 1;
	let hasContent = false;

	for (let cardIndex = 0; cardIndex < config.cardsCount; cardIndex++) {
		const scorecard = state.cards[cardIndex];
		if (!scorecard) continue;

		const cardBody = body.createDiv({ cls: 'archery-review-card' });
		let cardHasContent = false;

		for (let endIndex = 0; endIndex < config.endsPerCard; endIndex++) {
			if (!endHasReviewContent(scorecard, endIndex)) continue;

			hasContent = true;
			cardHasContent = true;

			const section = cardBody.createDiv({
				cls: `archery-review-end ${endColorClass(endIndex)}`,
			});
			section.createEl('h3', {
				cls: 'archery-review-end-heading',
				text: `End ${endIndex + 1}`,
			});

			const arrows = scorecard.ends[endIndex];
			if (arrows?.some((shot) => shot.score !== null)) {
				renderEndReviewScores(section, scorecard, endIndex, config.arrowsPerEnd);
			}

			const targetShots = collectEndTargetShots(arrows ?? []);
			if (targetShots.length > 0) {
				const targetWrap = section.createDiv({ cls: 'archery-review-target-wrap' });
				renderReadonlyEndTarget(targetWrap, targetShots, endIndex, markerSize, showShotScores);
			}

			const note = scorecard.endNotes[endIndex]?.trim();
			if (note) {
				const noteEl = section.createDiv({ cls: 'archery-review-note markdown-rendered' });
				void MarkdownRenderer.renderMarkdown(note, noteEl, sourcePath, component);
			}
		}

		if (!cardHasContent) {
			cardBody.remove();
			continue;
		}

		if (multiCard) {
			const roundHeading = cardBody.createEl('h2', {
				cls: 'archery-review-round-heading',
				text: `Scorecard ${cardIndex + 1}`,
			});
			cardBody.prepend(roundHeading);
		}
	}

	if (!hasContent) {
		body.createDiv({
			cls: 'archery-review-empty',
			text: 'No scored ends or notes yet.',
		});
	}

	return hasContent;
}
