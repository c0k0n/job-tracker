import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { clearSession } from '$lib/server/auth';

/**
 * Dashboard server load.
 *
 * The security guarantee: if there is no valid session, no code below this
 * line ever runs. The redirect happens before any data is fetched or any
 * page component is rendered. With Better Auth wired later, this exact
 * check (`event.locals.user` populated by the hooks) is the gate.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		// Preserve where the user tried to go so we can bounce them back after sign-in.
		const next = encodeURIComponent(url.pathname + url.search);
		throw redirect(303, `/?next=${next}`);
	}
	return { user: locals.user };
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
