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
 * Is this row still in play?
 *
 * `status` alone is not enough. The form lets stage and status be set
 * independently, so `stage: 'rejected', status: 'active'` is a perfectly
 * reachable state — and counting it made the "Active" tile disagree with
 * its own sublabel ("Across all open stages"). A row is in play only when
 * its *stage* is open AND its status has not been closed out.
 *
 * Shared with the dashboard's stale banner so the KPI strip and the
 * "N applications need your attention" alert can never disagree.
 */
export function isInPlay(app: Application): boolean {
	return isStageOpen(app.stage) && app.status !== 'closed';
}

/**
 * Compute all KPI counts in a single pass.
 *
 * Matches the 5 KPI cards in the dashboard strip:
 *   - active:          rows still in play (see `isInPlay`)
 *   - interviews:      pending interviews scheduled between now and +30 days
 *   - offersPending:   rows at stage `offer` and still in play
 *   - appliedMonth:    rows where appliedAt is in the current calendar month
 *   - needsAttention:  in-play rows where status is stalled or ghosted
 *
 * Terminal-stage rows (rejected, withdrawn, accepted) are excluded from
 * every count, because none of the five questions is about them: they are
 * not active, not awaiting a decision, and not a follow-up candidate.
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
		if (isInPlay(app)) {
			active += 1;
			if (app.stage === 'offer') offersPending += 1;
			if (app.status === 'stalled' || app.status === 'ghosted') needsAttention += 1;
		}
		// Deliberately outside the isInPlay branch: "applied this month" is
		// a fact about when you pressed apply, and it stays true after the
		// application is rejected. Counting it only while in play would make
		// the tile drop the moment a month closed badly, which is exactly
		// the number you want to keep looking at.
		if (isThisMonth(app.appliedAt)) appliedThisMonth += 1;
	}

	// "Next 30 days" is a window, not a horizon: an interview that already
	// happened is not in the next 30 days, however pending its outcome is.
	// The dashboard's rollup only hands us interviews from the last 24h
	// onwards, but this function is pure and must hold on its own — an
	// interview left pending from last month would otherwise be counted.
	const now = Date.now();
	const cutoff = now + 30 * 24 * 60 * 60 * 1000;
	const interviewsNext30Days = interviews.filter((iv) => {
		if (iv.outcome !== null && iv.outcome !== 'pending') return false;
		const t = new Date(iv.scheduledAt).getTime();
		return Number.isFinite(t) && t >= now && t <= cutoff;
	}).length;

	return {
		active,
		interviewsNext30Days,
		offersPending,
		appliedThisMonth,
		needsAttention
	};
}
