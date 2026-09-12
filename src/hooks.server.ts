/**
 * Server hooks: Better Auth catch-all + request-scoped session population.
 *
 * Pattern from docs/better-auth-research.md "SvelteKit
 * integration" (verified against the Better Auth MCP docs):
 * 1. Build the per-request auth instance (needs event.platform.env for the
 *    D1 binding + secret).
 * 2. Populate event.locals.session / event.locals.user via auth.api.getSession
 *    — svelteKitHandler does NOT do this for you.
 * 3. Delegate to svelteKitHandler, which mounts the /api/auth/* catch-all.
 *
 * Approval gate: users with `disabled` still hold a real session, but
 * locals.user is nulled so guarded routes treat them as logged out. The
 * root page's sign-in action checks the flag and redirects to
 * /pending-approval so disabled users get a clear message instead of a
 * bounce loop.
 */

import { building } from '$app/environment';
import type { Handle } from '@sveltejs/kit';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { getAuth } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
	// During prerender there is no request event / platform — skip auth
	// entirely (svelteKitHandler with `building: true` is a pass-through).
	if (!building && event.platform?.env?.DB) {
		const auth = getAuth();
		const session = await auth.api.getSession({ headers: event.request.headers });
		if (session) {
			if (session.user.disabled) {
				// Unapproved account: authenticated but gated. Keep the session
				// in locals (typed nullable) with a null user so the auth page
				// can redirect to /pending-approval instead of showing the
				// sign-in form again (a login loop).
				event.locals.session = session.session;
				event.locals.user = null;
			} else {
				event.locals.session = session.session;
				event.locals.user = session.user;
			}
		}
		return svelteKitHandler({ event, resolve, auth, building });
	}
	return resolve(event);
};
