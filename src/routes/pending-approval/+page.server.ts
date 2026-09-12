import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getAuth } from '$lib/server/auth';

/**
 * Landing page for authenticated-but-unapproved users. hooks.server.ts
 * nulls locals.user for disabled accounts, so anyone who reaches this page
 * with an approved session is bounced to /dashboard; visitors without a
 * session land here only right after sign-up/sign-in (the auth action
 * redirects to /pending-approval when the disabled flag is set).
 *
 * The sign-out action breaks the dead end: a disabled user's session
 * otherwise traps them here (the root page redirects any session holder
 * straight back), so this page must offer its own way out.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) throw redirect(303, '/dashboard');
	return {};
};

export const actions: Actions = {
	signout: async ({ request }) => {
		const auth = getAuth();
		await auth.api.signOut({ headers: request.headers });
		throw redirect(303, '/?signedout=1');
	}
};
