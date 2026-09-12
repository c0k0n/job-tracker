import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getRequestEvent } from '$app/server';
import type { Actions, PageServerLoad } from './$types';
import { getAuth } from '$lib/server/auth';
import { getDb } from '$lib/server/db';
import { user } from '$lib/server/db/schema';

/**
 * Root route — auth surface (sign-in + sign-up tabs).
 *
 * Real Better Auth round-trip: the action branches on `mode` and calls
 * `auth.api.signInEmail` / `auth.api.signUpEmail` (server-side call style —
 * cookies are written by the sveltekitCookies plugin, installed last on the
 * auth instance). The "username or email" field maps to whichever the input
 * looks like: an email goes straight through; a bare username is looked up
 * against the username plugin's column to resolve the email before sign-in.
 *
 * If the visitor already has a session, redirect to /dashboard.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) throw redirect(303, '/dashboard');
	// Disabled-but-authenticated: send to the notice page, not the form.
	if (locals.session) throw redirect(303, '/pending-approval');
	return {};
};

/** Origin-relative ?next= guard: reject `//` and `/\` tricks (browsers
 *  normalize `/\` to `//`, an open redirect). */
function safeNextParam(raw: string): string {
	if (raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\')) return raw;
	return '/dashboard';
}

/** Typed failure wrapper — one declared payload shape so the page's
 * ActionData union collapses to a single FailPayload instead of
 * per-call literal types. */
function authFail(
	status: 400 | 401 | 500,
	mode: string,
	emailOrUsername: string,
	fieldErrors: FieldErrors
) {
	return fail(status, { mode, emailOrUsername, fieldErrors });
}

interface FieldErrors {
	emailOrUsername?: string;
	password?: string;
	confirm?: string;
	_form?: string;
}

export const actions: Actions = {
	default: async ({ request, url }) => {
		const form = await request.formData();
		const mode = String(form.get('mode') ?? '');
		const emailOrUsername = String(form.get('emailOrUsername') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const confirm = String(form.get('confirm') ?? '');

		const fieldErrors: FieldErrors = {};

		if (!emailOrUsername) {
			fieldErrors.emailOrUsername = 'Enter your username or email.';
		} else if (emailOrUsername.length < 3) {
			fieldErrors.emailOrUsername = 'That looks too short to be a username or email.';
		} else if (emailOrUsername.length > 254) {
			fieldErrors.emailOrUsername = 'That is longer than we accept.';
		}

		if (!password) {
			fieldErrors.password = 'Enter your password.';
		} else if (password.length < 8) {
			fieldErrors.password = 'Use at least 8 characters.';
		} else if (password.length > 128) {
			fieldErrors.password = 'That is longer than we accept.';
		}

		if (mode === 'signup') {
			if (!confirm) {
				fieldErrors.confirm = 'Type your password again to confirm.';
			} else if (password !== confirm) {
				fieldErrors.confirm = 'The two passwords do not match.';
			}
		}

		if (mode !== 'signin' && mode !== 'signup') {
			fieldErrors._form = 'Unknown submission mode.';
		}

		const hasErrors = Object.values(fieldErrors).some((v) => typeof v === 'string' && v.length > 0);
		if (hasErrors) {
			return authFail(400, mode, emailOrUsername, fieldErrors);
		}

		const auth = getAuth();

		// Resolve "username or email" to an email for credential sign-in.
		// The username plugin's signInUsername exists, but resolving here keeps
		// one code path and lets us surface a uniform error shape.
		let email = emailOrUsername;
		if (!email.includes('@')) {
			const platform = getRequestEvent().platform;
			if (!platform?.env?.DB) {
				return authFail(500, mode, emailOrUsername, { _form: 'Database unavailable.' });
			}
			const rows = await getDb(platform.env.DB)
				.select({ email: user.email })
				.from(user)
				.where(eq(user.username, emailOrUsername.toLowerCase()))
				.limit(1)
				.all();
			const found = rows[0]?.email;
			if (!found) {
				return authFail(400, mode, emailOrUsername, {
					emailOrUsername: 'No account matches that username.'
				});
			}
			email = found;
		}

		// Both calls return the authenticated user — the approval gate is
		// readable straight off the result (the session cookie isn't on
		// request.headers yet, so a getSession follow-up can't see it).
		let authUser: { disabled?: boolean } | undefined;
		try {
			if (mode === 'signup') {
				// Sign-up keys the account on a real email; the username
				// plugin stores the local part as the sign-in handle.
				if (!emailOrUsername.includes('@')) {
					return authFail(400, mode, emailOrUsername, {
						emailOrUsername: 'Sign up with your email; a username can be added after.'
					});
				}
				const username = email.split('@')[0]!;
				const result = await auth.api.signUpEmail({
					body: {
						email,
						name: username,
						username,
						password,
						callbackURL: safeNextParam(url.searchParams.get('next') ?? '')
					}
				});
				authUser = result?.user ?? null;
			} else {
				const result = await auth.api.signInEmail({
					body: { email, password }
				});
				authUser = result?.user ?? null;
			}
		} catch (err) {
			// APIError from better-auth/api surfaces field-agnostic messages.
			const message =
				err instanceof Error && err.message ? err.message : 'Authentication failed. Try again.';
			return authFail(401, mode, emailOrUsername, { _form: message });
		}

		// Approval gate: first user bootstraps as approved admin; later
		// sign-ups wait in /admin/approvals.
		if (authUser?.disabled) {
			throw redirect(303, '/pending-approval');
		}

		const nextPath = safeNextParam(url.searchParams.get('next') ?? '');
		throw redirect(303, nextPath);
	}
};
