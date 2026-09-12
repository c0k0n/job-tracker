import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Landing page for authenticated-but-unapproved users. hooks.server.ts
 * nulls locals.user for disabled accounts, so anyone who reaches this page
 * with an approved session is bounced to /dashboard; visitors without a
 * session land here only right after sign-up/sign-in (the auth action
 * redirects to /pending-approval when the disabled flag is set).
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) throw redirect(303, '/dashboard');
	return {};
};
