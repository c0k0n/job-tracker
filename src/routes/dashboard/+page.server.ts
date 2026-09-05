import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { clearSession } from '$lib/server/auth';
import { getApplicationsForUser } from '$lib/server/applications-data';
import { computeKpis, countByStage } from '$lib/utils/kpis';
import { parseFiltersFromUrl } from '$lib/utils/sortFilter';

/**
 * Dashboard server load.
 *
 * The security guarantee: if there is no valid session, no code below this
 * line ever runs. The redirect happens before any data is fetched or any
 * page component is rendered. With Better Auth wired later, this exact
 * check (`event.locals.user` populated by the hooks) is the gate.
 *
 * Once Better Auth is in place, add a `disabled` flag to the user record
 * and gate access here:
 *
 *   if (locals.user.disabled) {
 *     throw redirect(303, '/pending-approval');
 *   }
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		const next = encodeURIComponent(url.pathname + url.search);
		throw redirect(303, `/?next=${next}`);
	}

	const applications = getApplicationsForUser(locals.user.id);
	const kpis = computeKpis(applications);
	const stageCounts = countByStage(applications);
	const { filters, sort } = parseFiltersFromUrl(url.searchParams);

	return {
		user: locals.user,
		applications,
		kpis,
		stageCounts,
		filters,
		sort
	};
};

/**
 * Sign-out action. The stub cookie is cleared; later this will call
 * `auth.api.signOut({ headers })` and invalidate the session server-side.
 */
export const actions: Actions = {
	default: async ({ cookies }) => {
		clearSession(cookies);
		throw redirect(303, '/');
	}
};
