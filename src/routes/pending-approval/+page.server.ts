import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Static notice page for a just-created account. Sign-ups land here
 * straight from the root action (no session is created — autoSignIn is
 * off in auth.ts, so there is nothing to sign out of). Anyone with an
 * approved session has no business here and is bounced to /dashboard.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) throw redirect(303, '/dashboard');
	return {};
};
