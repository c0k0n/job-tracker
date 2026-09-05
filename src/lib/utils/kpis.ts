/**
 * Server-side derivations for the dashboard.
 *
 * The dashboard `+page.server.ts` calls these to compute KPI counts and
 * any future rollups from the raw applications. Keeping them in a
 * dedicated file so the route stays small and so the derivations are
 * trivially unit-testable without spinning up SvelteKit.
 */

import type { Application, KpiCounts } from '$lib/types';
import { isStageOpen } from '$lib/constants/stages';
import { daysSince, isThisMonth, isUpcoming } from '$lib/utils/dates';

// Re-export to keep the import surface clean for callers.
export { isStageOpen };

/**
 * Compute all KPI counts from a row set in a single pass.
 *
 * Matches the 5 KPI cards in the dashboard strip:
 *   - active:        rows where status is active / stalled / ghosted / paused
 *   - interviews:    rows with next_action_at in the next 30 days
 *   - offersPending: rows in stage === 'offer'
 *   - appliedMonth:  rows where appliedAt is in the current calendar month
 *   - needsAttention: rows where status is stalled or ghosted
 *
 * Closed-only rows (rejected, withdrawn, accepted) are excluded from
 * everything except `offersPending` (which is `stage === 'offer'`,
 * a non-terminal stage).
 */
export function computeKpis(apps: readonly Application[]): KpiCounts {
	let active = 0;
	let interviewsNext30Days = 0;
	let offersPending = 0;
	let appliedThisMonth = 0;
	let needsAttention = 0;

	for (const app of apps) {
		// Active bucket: not closed, including paused/stalled/ghosted.
		if (app.status !== 'closed') {
			active += 1;

			if (isStageOpen(app.stage)) {
				if (app.stage === 'offer') {
					offersPending += 1;
				}
				if (isUpcoming(app.nextActionAt, 30)) {
					interviewsNext30Days += 1;
				}
			}
		}

		if (isThisMonth(app.appliedAt)) {
			appliedThisMonth += 1;
		}

		if (app.status === 'stalled' || app.status === 'ghosted') {
			needsAttention += 1;
		}
	}

	return {
		active,
		interviewsNext30Days,
		offersPending,
		appliedThisMonth,
		needsAttention
	};
}

/**
 * Group applications by status for the status breakdown (when added in a
 * future round). Not used in Round A but defined now so the schema is
 * stable.
 */
export function countByStatus(apps: readonly Application[]): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const app of apps) {
		counts[app.status] = (counts[app.status] ?? 0) + 1;
	}
	return counts;
}

/**
 * "Needs attention" sublist: applications whose status is stalled or
 * ghosted. Sorted oldest-first (longest-stalled at the top).
 *
 * Used in Round A's empty-state copy to give the user concrete next
 * steps. Full UI for this list lands in a future round.
 */
export function needsAttentionList(apps: readonly Application[]): Application[] {
	return apps
		.filter((a) => a.status === 'stalled' || a.status === 'ghosted')
		.sort((a, b) => daysSince(a.stageChangedAt) - daysSince(b.stageChangedAt));
}
