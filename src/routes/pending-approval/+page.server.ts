import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Notice page for a just-created account. Sign-ups land here straight
 * from the root action (no session is created — autoSignIn is off in
 * auth.ts, so there is nothing to sign out of). Anyone with an approved
 * session has no business here and is bounced to /dashboard.
 *
 * `?handle=` is the sign-in handle the root action derived from the
 * email, echoed back so the new account actually knows it exists. It is
 * re-validated here rather than trusted: it arrives through a URL, and
 * the shape is exactly what `deriveHandle` produces.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) throw redirect(303, '/dashboard');
	const raw = url.searchParams.get('handle') ?? '';
	const handle = /^[a-z0-9_.]{3,30}$/.test(raw) ? raw : null;
	return { handle };
};
