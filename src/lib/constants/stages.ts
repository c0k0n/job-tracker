/**
 * Stage and status constants.
 *
 * These are the runtime source of truth for the funnel positions and
 * relationship states. Both the UI (for rendering) and any future
 * validation code import from here.
 *
 * Funnel order matters: it's the order rendered in the pipeline bar
 * and in the stage filter chip group. Don't reorder casually.
 */

import type { ApplicationStage, ApplicationStatus, WorkArrangement } from '$lib/types';

interface StageMeta {
	value: ApplicationStage;
	label: string;
	/** Short label for tight UI (table cells, chips). */
	shortLabel: string;
	/** Tailwind-friendly color token from layout.css. */
	colorToken:
		| 'stage-saved'
		| 'stage-applied'
		| 'stage-progress'
		| 'stage-late'
		| 'stage-offer'
		| 'stage-terminal'
		| 'stage-closed';
}

export const STAGES: StageMeta[] = [
	{ value: 'saved', label: 'Saved', shortLabel: 'Saved', colorToken: 'stage-saved' },
	{ value: 'applied', label: 'Applied', shortLabel: 'Applied', colorToken: 'stage-applied' },
	{
		value: 'phone_screen',
		label: 'Phone screen',
		shortLabel: 'Phone',
		colorToken: 'stage-progress'
	},
	{ value: 'technical', label: 'Technical', shortLabel: 'Tech', colorToken: 'stage-progress' },
	{ value: 'onsite', label: 'Onsite', shortLabel: 'Onsite', colorToken: 'stage-progress' },
	{ value: 'final', label: 'Final round', shortLabel: 'Final', colorToken: 'stage-late' },
	{ value: 'offer', label: 'Offer', shortLabel: 'Offer', colorToken: 'stage-offer' },
	{ value: 'accepted', label: 'Accepted', shortLabel: 'Accepted', colorToken: 'stage-closed' },
	{ value: 'rejected', label: 'Rejected', shortLabel: 'Rejected', colorToken: 'stage-closed' },
	{ value: 'withdrawn', label: 'Withdrawn', shortLabel: 'Withdrawn', colorToken: 'stage-closed' }
];

export const STAGE_BY_VALUE: Record<ApplicationStage, StageMeta> = STAGES.reduce(
	(acc, s) => {
		acc[s.value] = s;
		return acc;
	},
	{} as Record<ApplicationStage, StageMeta>
);

export const STAGE_VALUES: readonly ApplicationStage[] = STAGES.map((s) => s.value);

export function isStageOpen(stage: ApplicationStage): boolean {
	// Open stages: in-flight. Closed stages: terminal.
	return stage !== 'accepted' && stage !== 'rejected' && stage !== 'withdrawn' && stage !== 'saved';
}

interface StatusMeta {
	value: ApplicationStatus;
	label: string;
	shortLabel: string;
	colorToken:
		'status-active' | 'status-stalled' | 'status-ghosted' | 'status-paused' | 'status-closed';
}

export const STATUSES: StatusMeta[] = [
	{ value: 'active', label: 'Active', shortLabel: 'Active', colorToken: 'status-active' },
	{ value: 'stalled', label: 'Stalled', shortLabel: 'Stalled', colorToken: 'status-stalled' },
	{ value: 'ghosted', label: 'Ghosted', shortLabel: 'Ghosted', colorToken: 'status-ghosted' },
	{ value: 'paused', label: 'Paused', shortLabel: 'Paused', colorToken: 'status-paused' },
	{ value: 'closed', label: 'Closed', shortLabel: 'Closed', colorToken: 'status-closed' }
];

export const STATUS_BY_VALUE: Record<ApplicationStatus, StatusMeta> = STATUSES.reduce(
	(acc, s) => {
		acc[s.value] = s;
		return acc;
	},
	{} as Record<ApplicationStatus, StatusMeta>
);

export const STATUS_VALUES: readonly ApplicationStatus[] = STATUSES.map((s) => s.value);

interface ArrangementMeta {
	value: WorkArrangement;
	label: string;
}

export const ARRANGEMENTS: ArrangementMeta[] = [
	{ value: 'remote', label: 'Remote' },
	{ value: 'hybrid', label: 'Hybrid' },
	{ value: 'onsite', label: 'Onsite' },
	{ value: 'unspecified', label: 'Unspecified' }
];

export const ARRANGEMENT_BY_VALUE: Record<WorkArrangement, ArrangementMeta> = ARRANGEMENTS.reduce(
	(acc, a) => {
		acc[a.value] = a;
		return acc;
	},
	{} as Record<WorkArrangement, ArrangementMeta>
);

export const ARRANGEMENT_VALUES: readonly WorkArrangement[] = ARRANGEMENTS.map((a) => a.value);
