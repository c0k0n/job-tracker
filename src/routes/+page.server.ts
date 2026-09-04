import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { setSession } from '$lib/server/auth';

/**
 * Root route — auth surface (sign-in + sign-up tabs).
 *
 * If the visitor already has a session cookie, redirect them to /dashboard
 * so they don't see the auth page.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		throw redirect(303, '/dashboard');
	}
	return {};
};

/**
 * Stub auth action.
 *
 * Accepts either mode=signin or mode=signup with emailOrUsername + password.
 * Validates shape (length, email-ish, password strength) and pretends to
 * succeed by setting a placeholder session cookie. We will replace this
 * with `auth.api.signInEmail` / `auth.api.signUpEmail` when Better Auth +
 * D1 land. No call sites above this file need to change.
 */
export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const mode = String(form.get('mode') ?? '');
		const emailOrUsername = String(form.get('emailOrUsername') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const confirm = String(form.get('confirm') ?? '');

		const fieldErrors: {
			emailOrUsername?: string;
			password?: string;
			confirm?: string;
			_form?: string;
		} = {};

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
			return fail(400, { mode, emailOrUsername, fieldErrors });
		}

		// Stub success. Real auth will hash + verify + look up the user record.
		// The shape here matches what /dashboard/+page.server.ts expects.
		setSession(cookies, {
			id: 'stub-user-id',
			username: emailOrUsername.includes('@')
				? (emailOrUsername.split('@')[0] ?? emailOrUsername)
				: emailOrUsername,
			email: emailOrUsername.includes('@') ? emailOrUsername : `${emailOrUsername}@stub.local`
		});

		throw redirect(303, '/dashboard');
	}
};
