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
import { isThisMonth, isUpcoming } from '$lib/utils/dates';

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
