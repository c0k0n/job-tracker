/**
 * Stub server hook — populates event.locals.user from the placeholder session.
 *
 * When we wire Better Auth this becomes:
 *
 *   import { auth } from '$lib/server/auth';
 *   import { svelteKitHandler } from 'better-auth/svelte-kit';
 *   import { building } from '$app/environment';
 *
 *   export async function handle({ event, resolve }) {
 *     const session = await auth.api.getSession({ headers: event.request.headers });
 *     if (session) {
 *       event.locals.session = session.session;
 *       event.locals.user = session.user;
 *     }
 *     return svelteKitHandler({ event, resolve, auth, building });
 *   }
 *
 * The current implementation just reads the stub cookie.
 */

import { getSession } from '$lib/server/auth';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = getSession(event.cookies);
	return resolve(event);
};
