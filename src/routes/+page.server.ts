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
	// No session-trap: sign-ups get no session (autoSignIn off), and
	// hooks.server.ts revokes any legacy disabled-user session, so a
	// visitor here without locals.user is genuinely signed out and
	// should see the form.
	return {};
};

/**
 * Origin-relative ?next= guard: reject `//` and `/\` tricks (browsers
 * normalize `/\` to `//`, an open redirect).
 *
 * `%` is rejected too. `/%2f%2fevil.example.com` starts with a single slash
 * so it passes the checks above, and although browsers keep `%2f` encoded
 * when resolving a Location, a proxy or a hand-rolled redirect handler that
 * decodes before resolving would turn it into `//evil.example.com`. There is
 * no legitimate reason for a percent-escape in an internal path here.
 */
function safeNextParam(raw: string): string {
	if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/dashboard';
	if (raw.includes('%')) return '/dashboard';
	return raw;
}

/**
 * Derive a sign-in handle from an email's local part.
 *
 * Better Auth's `username()` plugin validates against `/^[a-zA-Z0-9_.]+$/`
 * inside a 3-30 length window — see `defaultUsernameValidator` in
 * node_modules/better-auth/dist/plugins/username/index.mjs. Real email local
 * parts routinely fall outside that (`john-smith`, `me+tag`, `jo`), and a raw
 * local part therefore made `signUpEmail` throw and take the whole page to a
 * 500.
 *
 * Anything disallowed becomes a dot, which keeps the handle readable —
 * `john-smith` becomes `john.smith` rather than `johnsmith` or a rejection.
 * Returns `null` when nothing usable is left; that account has no handle and
 * signs in by email, which always works.
 */
function deriveHandle(email: string): string | null {
	const local = email.split('@')[0] ?? '';
	const cleaned = local
		.toLowerCase()
		.replace(/[^a-z0-9_.]+/g, '.')
		.replace(/\.{2,}/g, '.')
		.replace(/^\.+|\.+$/g, '')
		.slice(0, 30)
		.replace(/\.+$/g, '');
	if (cleaned.length < 3) return null;
	if (!/^[a-z0-9_.]+$/.test(cleaned)) return null;
	return cleaned;
}

/** Typed failure wrapper — one declared payload shape so the page's
 * ActionData union collapses to a single FailPayload instead of
 * per-call literal types. */
function authFail(
	status: 400 | 401 | 403 | 429 | 500,
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

/**
 * The only sign-in failure message a visitor who does not know the password
 * ever sees.
 *
 * Every dead end — no such account, wrong password, unknown username — has to
 * answer with this same string, or the form becomes an account-existence
 * oracle: send an email, read whether you got "waiting for approval" or
 * "incorrect", and you have enumerated the user list without guessing
 * anything. Worth more than the slightly nicer copy it costs.
 */
const INVALID_CREDENTIALS = 'Email or password is incorrect. Check for typos and try again.';

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
		} else if (mode === 'signup' && !emailOrUsername.includes('@')) {
			// Sign-up keys the account on a real email; the username
			// plugin stores the local part as the sign-in handle.
			fieldErrors.emailOrUsername = 'Sign up with your email, like name@example.com.';
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
		const platform = getRequestEvent().platform;
		if (!platform?.env?.DB) {
			return authFail(500, mode, emailOrUsername, { _form: 'Database unavailable.' });
		}
		const db = getDb(platform.env.DB);

		if (mode === 'signup') {
			// With autoSignIn off, Better Auth deliberately returns a
			// generic "created" response for an existing email so
			// sign-ups can't be used to enumerate accounts. We want the
			// honest, friendly error instead, so check ourselves.
			const existing = await db
				.select({ id: user.id })
				.from(user)
				.where(eq(user.email, emailOrUsername.toLowerCase()))
				.limit(1)
				.all();
			if (existing.length > 0) {
				return authFail(400, mode, emailOrUsername, {
					emailOrUsername: 'That email already has an account. Sign in instead.'
				});
			}
			// `null` means the local part had nothing usable in it (too
			// short, or nothing but punctuation). That account gets no
			// handle and signs in by email — which is always valid.
			const handle = deriveHandle(emailOrUsername);
			if (handle) {
				const takenUsername = await db
					.select({ id: user.id })
					.from(user)
					.where(eq(user.username, handle))
					.limit(1)
					.all();
				if (takenUsername.length > 0) {
					return authFail(400, mode, emailOrUsername, {
						emailOrUsername:
							'That email is taken because its sign-in handle is. Try a different address.'
					});
				}
			}

			// The first user ever bootstraps as an approved admin inside
			// the create.before hook in auth.ts; everyone else lands in
			// the approval queue. autoSignIn is off, so no session cookie
			// is set either way.
			//
			// Wrapped: signUpEmail throws an APIError for anything Better
			// Auth dislikes, and an unguarded throw here takes the whole
			// page to the error boundary. signInEmail below has the same
			// guard for the same reason.
			try {
				await auth.api.signUpEmail({
					// `headers` is load-bearing, not decoration. The dynamic
					// baseURL config resolves the origin from the request, and
					// a direct auth.api call has no request of its own —
					// without headers carrying a Host it throws
					// "Dynamic baseURL could not be resolved".
					headers: request.headers,
					body: {
						email: emailOrUsername,
						name: handle ?? emailOrUsername.split('@')[0]!,
						username: handle ?? undefined,
						password,
						callbackURL: safeNextParam(url.searchParams.get('next') ?? '')
					}
				});
			} catch (err) {
				const status =
					typeof err === 'object' && err !== null && 'status' in err
						? Number(err.status)
						: undefined;
				if (status !== undefined && status >= 500) {
					return authFail(500, mode, emailOrUsername, {
						_form: 'Something went wrong on our side. Please try again in a moment.'
					});
				}
				return authFail(400, mode, emailOrUsername, {
					emailOrUsername: 'We could not create that account. Try a different email address.'
				});
			}

			// Tell them the handle they just got — otherwise "username or
			// email" on the sign-in form is a mystery.
			throw redirect(303, handle ? `/pending-approval?handle=${handle}` : '/pending-approval');
		}

		// Sign-in: resolve "username or email" to an email first. The
		// approval gate is enforced *after* signInEmail, not before — see the
		// note down there for why the order matters.
		let email = emailOrUsername;
		let userRow: { id: string; email: string; disabled: boolean } | undefined;
		if (email.includes('@')) {
			const rows = await db
				.select({ id: user.id, email: user.email, disabled: user.disabled })
				.from(user)
				.where(eq(user.email, emailOrUsername.toLowerCase()))
				.limit(1)
				.all();
			userRow = rows[0];
		} else {
			const rows = await db
				.select({ id: user.id, email: user.email, disabled: user.disabled })
				.from(user)
				.where(eq(user.username, emailOrUsername.toLowerCase()))
				.limit(1)
				.all();
			userRow = rows[0];
			if (!userRow) {
				// Same generic message as every other failed sign-in. An
				// unknown username used to get "no account matches that
				// username", which turned this form into a free
				// username-existence oracle — and handles here are derived
				// from the email address, so it leaked those too.
				return authFail(401, mode, emailOrUsername, { _form: INVALID_CREDENTIALS });
			}
			email = userRow.email;
		}

		if (!userRow) {
			// No account for that email, so there is nothing to verify a
			// password against. Identical message to a wrong password.
			return authFail(401, mode, emailOrUsername, { _form: INVALID_CREDENTIALS });
		}

		try {
			// headers → see the note on signUpEmail above: the dynamic
			// baseURL config needs a Host to resolve the origin.
			await auth.api.signInEmail({ headers: request.headers, body: { email, password } });
		} catch (err) {
			// Map Better Auth APIError statuses to human copy. `status` /
			// `statusCode` confirmed on APIError from the installed
			// @better-auth/core types. Invalid credentials (401) and other
			// client faults keep a friendly line; infrastructure failures
			// (429, 5xx) get actionable guidance instead of library jargon.
			const status =
				typeof err === 'object' && err !== null && 'status' in err ? Number(err.status) : undefined;
			let message: string;
			if (status === 429) {
				message = 'Too many attempts. Please wait a moment before trying again.';
			} else if (status !== undefined && status >= 500) {
				message = 'Something went wrong on our side. Please try again in a moment.';
			} else if (
				err instanceof Error &&
				err.message &&
				/invalid email or password|invalid username or password/i.test(err.message)
			) {
				message = INVALID_CREDENTIALS;
			} else if (err instanceof Error && err.message) {
				message = err.message;
			} else {
				message = 'Sign-in failed. Try again.';
			}
			return authFail(status === 429 ? 429 : 401, mode, emailOrUsername, {
				_form: message
			});
		}

		// The approval gate, now behind the password.
		//
		// It used to run first, so "this account is waiting for approval" was
		// answerable by anyone who knew an email address and nothing else.
		// Verifying the password first means only the account's owner can
		// reach that message.
		//
		// The cost is that an unapproved account briefly gets a real session
		// (signInEmail has already run). It is revoked on the spot, and
		// hooks.server.ts revokes any disabled user's session on every
		// request regardless — so even if this sign-out failed, the account
		// still cannot reach a guarded route. Two independent backstops.
		if (userRow.disabled) {
			try {
				await auth.api.signOut({ headers: request.headers });
			} catch {
				// Session row already gone, or a race. hooks covers it.
			}
			return authFail(403, mode, emailOrUsername, {
				_form: 'That account is waiting for approval. Check back once an admin lets you in.'
			});
		}

		const nextPath = safeNextParam(url.searchParams.get('next') ?? '');
		throw redirect(303, nextPath);
	}
};
