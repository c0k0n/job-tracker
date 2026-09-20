/**
 * Server hooks: Better Auth catch-all + request-scoped session population.
 *
 * Pattern from docs/research/better-auth.md "SvelteKit
 * integration" (verified against the Better Auth MCP docs):
 * 1. Build the per-request auth instance (needs event.platform.env for the
 *    D1 binding + secret).
 * 2. Populate event.locals.session / event.locals.user via auth.api.getSession
 *    — svelteKitHandler does NOT do this for you.
 * 3. Delegate to svelteKitHandler, which mounts the /api/auth/* catch-all.
 *
 * Approval gate: sign-ups never receive a session (autoSignIn is off in
 * auth.ts) and sign-in pre-checks the `disabled` flag, so an unapproved
 * user is indistinguishable from a signed-out visitor. A disabled user
 * with a live session here is a legacy cookie from the old flow — it is
 * revoked on the spot (self-heal) and locals stay null, so every route
 * treats them as signed out and `/` shows the sign-in form.
 */

import { building } from '$app/environment';
import type { Handle } from '@sveltejs/kit';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { getAuth } from '$lib/server/auth';

/**
 * Baseline response headers applied to every response, SSR and static
 * asset alike.
 *
 * The CSP is deliberately not strict: SvelteKit emits inline `<script>`
 * and `<style>` chunks (and the dashboard sets inline `style="width: …"`
 * attributes for its chart bars), so `'unsafe-inline'` is required in both
 * directives or the app stops rendering. `frame-src` stays open because the
 * detail modal embeds third-party resume PDFs in an iframe. Everything else
 * is locked down. See docs/security.md.
 */
const SECURITY_HEADERS: Record<string, string> = {
	'X-Content-Type-Options': 'nosniff',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	'X-Frame-Options': 'DENY',
	'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Content-Security-Policy': [
		"default-src 'self'",
		"script-src 'self' 'unsafe-inline'",
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: blob:",
		"font-src 'self' data:",
		"connect-src 'self'",
		// Resume previews are third-party PDF documents in an iframe.
		'frame-src https:',
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
		"frame-ancestors 'none'"
	].join('; ')
};

function applySecurityHeaders(response: Response): void {
	for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
		// Don't clobber a more specific header a route already set.
		if (!response.headers.has(key)) response.headers.set(key, value);
	}
}

export const handle: Handle = async ({ event, resolve }) => {
	let response: Response;

	// During prerender there is no request event / platform — skip auth
	// entirely (svelteKitHandler with `building: true` is a pass-through).
	if (!building && event.platform?.env?.DB) {
		const auth = getAuth();
		const session = await auth.api.getSession({ headers: event.request.headers });
		if (session) {
			if (session.user.disabled) {
				// Unapproved account holding a session. This can only be a
				// legacy cookie from the old auto-sign-in flow (sign-up used
				// to hand out sessions immediately) — new sign-ups get no
				// session at all, and sign-in pre-checks the flag. Revoke
				// the stale session so the user is cleanly signed out
				// instead of trapped bouncing between routes that all
				// redirect them to /pending-approval.
				try {
					await auth.api.signOut({ headers: event.request.headers });
				} catch {
					// Session row already gone / race with another request
					// — the cookie may not clear this pass, but the next
					// request re-runs this heal.
				}
				event.locals.session = null;
				event.locals.user = null;
			} else {
				event.locals.session = session.session;
				event.locals.user = session.user;
			}
		}
		response = await svelteKitHandler({ event, resolve, auth, building });
	} else {
		response = await resolve(event);
	}

	applySecurityHeaders(response);
	return response;
};
