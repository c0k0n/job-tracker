/**
 * Server-side derivations for the dashboard.
 *
 * The dashboard `+page.server.ts` calls these to compute KPI counts from
 * the raw applications. Keeping them in a dedicated file keeps the route
 * small and makes the derivations trivially unit-testable without spinning
 * up SvelteKit.
 */

import type { Application, Interview, KpiCounts } from '$lib/types';
import { isStageOpen } from '$lib/constants/stages';
import { isThisMonth } from '$lib/utils/dates';

// Re-export to keep the import surface clean for callers.
export { isStageOpen };

/**
 * Compute all KPI counts in a single pass.
 *
 * Matches the 5 KPI cards in the dashboard strip:
 *   - active:          rows where status is active / stalled / ghosted / paused
 *   - interviews:      pending interviews scheduled in the next 30 days
 *                      (from the interviews side table — nextActionAt is a
 *                      generic follow-up, not an interview)
 *   - offersPending:   rows in stage === 'offer'
 *   - appliedMonth:    rows where appliedAt is in the current calendar month
 *   - needsAttention:  rows where status is stalled or ghosted
 *
 * Closed-only rows (rejected, withdrawn, accepted) are excluded from
 * everything except `offersPending` (a non-terminal stage).
 */
export function computeKpis(
	apps: readonly Application[],
	interviews: readonly Interview[]
): KpiCounts {
	let active = 0;
	let offersPending = 0;
	let appliedThisMonth = 0;
	let needsAttention = 0;

	for (const app of apps) {
		if (app.status !== 'closed') {
			active += 1;
			if (isStageOpen(app.stage) && app.stage === 'offer') {
				offersPending += 1;
			}
		}
		if (isThisMonth(app.appliedAt)) {
			appliedThisMonth += 1;
		}
		if (app.status === 'stalled' || app.status === 'ghosted') {
			needsAttention += 1;
		}
	}

	const cutoff = Date.now() + 30 * 24 * 60 * 60 * 1000;
	const interviewsNext30Days = interviews.filter((iv) => {
		if (iv.outcome !== null && iv.outcome !== 'pending') return false;
		const t = new Date(iv.scheduledAt).getTime();
		return !Number.isNaN(t) && t <= cutoff;
	}).length;

	return {
		active,
		interviewsNext30Days,
		offersPending,
		appliedThisMonth,
		needsAttention
	};
}
