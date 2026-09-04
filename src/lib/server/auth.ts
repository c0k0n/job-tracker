/**
 * Stub session reader.
 *
 * Reads a placeholder cookie and returns a minimal user shape if present.
 * Returns null otherwise.
 *
 * This is intentionally NOT a real auth implementation — it exists only so
 * route guards (`event.locals.user`) and the auth UI flow work end-to-end
 * before we wire Better Auth + D1 in a later phase.
 *
 * When we swap in Better Auth, this file becomes:
 *   return (await auth.api.getSession({ headers: event.request.headers }))?.user ?? null;
 * No call sites change.
 */

import type { Cookies } from '@sveltejs/kit';

const SESSION_COOKIE = 'job-tracker.session';

export type SessionUser = {
	id: string;
	username: string;
	email: string;
};

export function getSession(cookies: Cookies): SessionUser | null {
	const raw = cookies.get(SESSION_COOKIE);
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as SessionUser;
		if (typeof parsed.id === 'string' && typeof parsed.username === 'string') {
			return parsed;
		}
		return null;
	} catch {
		return null;
	}
}

export function setSession(cookies: Cookies, user: SessionUser): void {
	// Stub cookie attributes; Better Auth's setSession will replace this with
	// the real secure/signed session cookie. For now: HttpOnly so JS can't read
	// it, SameSite=Lax for CSRF defense on top-level POSTs, no Secure flag so
	// it works on localhost during dev.
	cookies.set(SESSION_COOKIE, JSON.stringify(user), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: false,
		maxAge: 60 * 60 * 24 * 7
	});
}

export function clearSession(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}
