/**
 * Better Auth server module.
 *
 * Cloudflare Workers gotcha (see docs/better-auth-research.md
 * "Cloudflare Workers / D1 gotchas"): `betterAuth()` reads `secret` /
 * `baseURL` at call time, but env bindings only exist per request. The
 * documented pattern for this combo is building the instance from
 * request context — so every entry point goes through `getAuth()`,
 * which resolves `event.platform.env`. `event.platform.env.DB` supplies
 * the D1 binding.
 *
 * Plugins (order matters — `sveltekitCookies` must be LAST so server
 * actions like signInEmail write Set-Cookie on the action response):
 * - `username()` — the auth UI accepts "username or email".
 * - `admin()` — provides the `role` field + admin API; we use the role
 *   field for gating /admin/approvals (own route, server-guarded).
 *
 * Sign-up approval gate: `disabled` starts true for every new user; the
 * create.before database hook flips it to false (+ role admin) when no
 * enabled user exists yet — the first user bootstraps as approved admin.
 * Everyone after that waits in /admin/approvals. `disabled` is enforced
 * in hooks.server.ts and the dashboard load.
 */

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { admin, username } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import { getRequestEvent } from '$app/server';
import { getDb } from './db';
import * as schema from './db/schema';

export type SessionUser = {
	id: string;
	username: string | null;
	displayUsername: string | null;
	email: string;
	name: string;
	role: string;
	disabled: boolean;
};

export type AuthInstance = ReturnType<typeof buildAuth>;

function buildAuth(env: Env) {
	return betterAuth({
		appName: 'Job Tracker',
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		trustedOrigins: [env.BETTER_AUTH_URL, 'http://localhost:5173'],
		database: drizzleAdapter(getDb(env.DB), {
			provider: 'sqlite',
			// `import * as schema` carries tables AND their relations exports;
			// the adapter's joins support reads relations from this object
			// (Better Auth docs "Joins" — every relation must be passed here).
			schema
		}),
		user: {
			additionalFields: {
				// Approval gate. Server-owned: written by the create.before
				// database hook, never accepted from client input.
				disabled: {
					type: 'boolean',
					input: false,
					defaultValue: true
				}
			}
		},
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: false,
			minPasswordLength: 8,
			maxPasswordLength: 128,
			autoSignIn: true
		},
		session: {
			expiresIn: 60 * 60 * 24 * 7,
			updateAge: 60 * 60 * 24,
			cookieCache: {
				enabled: true,
				maxAge: 5 * 60,
				strategy: 'compact'
			}
		},
		advanced: {
			ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
			useSecureCookies: true,
			cookiePrefix: 'job-tracker',
			database: { generateId: 'uuid', joins: true }
		},
		rateLimit: { enabled: true, window: 60, max: 100 },
		databaseHooks: {
			user: {
				create: {
					before: async (user) => {
						// First user bootstraps as an approved admin; later
						// sign-ups wait in the approval queue. getRequestEvent
						// throws outside request context (CLI/build) and
						// platform may be undefined — fall back to disabled.
						let disabled = true;
						let role = 'user';
						try {
							const platform = getRequestEvent().platform;
							if (platform?.env?.DB) {
								const db = getDb(platform.env.DB);
								const existing = await db
									.select({ id: schema.user.id })
									.from(schema.user)
									.where(eq(schema.user.disabled, false))
									.limit(1)
									.all();
								if (existing.length === 0) {
									disabled = false;
									role = 'admin';
								}
							}
						} catch {
							// No request event (CLI/build) — default disabled.
						}
						return {
							data: {
								...user,
								disabled,
								role
							}
						};
					}
				}
			}
		},
		plugins: [username(), admin(), sveltekitCookies(getRequestEvent)]
	});
}

/** Request-scoped auth instance. Call from SvelteKit server context only. */
export function getAuth(): AuthInstance {
	const platform = getRequestEvent().platform;
	if (!platform?.env?.DB) throw new Error('getAuth(): no platform.env.DB binding');
	return buildAuth(platform.env);
}

/**
 * Admin = `role === 'admin'` on the user row (the admin plugin's convention).
 * Replaces the stub ADMIN_ID check from the pre-backend round.
 */
export function isAdminUser(user: Pick<SessionUser, 'role'> | null): boolean {
	return user !== null && user.role === 'admin';
}
