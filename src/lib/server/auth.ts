/**
 * Better Auth server module.
 *
 * Cloudflare Workers gotcha (see docs/research/better-auth.md
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

/**
 * Hosts Better Auth will accept as the request origin when `BETTER_AUTH_URL`
 * is unset.
 *
 * Better Auth 1.7 warns on every request if `baseURL` is left undefined, and
 * the docs are blunt about why: "Relying on request inference is not
 * recommended." Inference trusts *whatever* `Host` header arrives — every
 * origin is a trusted origin. The object form keeps the per-request
 * behaviour we want (one build for localhost and for workers.dev) but adds an
 * allowlist: a host that is not listed is rejected instead of trusted.
 *
 * - the deployed host: `job-tracker.sanctum.workers.dev`
 * - `*.workers.dev`: Workers Builds preview branches get a generated host
 *   under the same domain. Without this, a preview deploy would throw on
 *   every auth call.
 * - `localhost:*` / `127.0.0.1:*`: `bun run dev` (5173) and `bun run preview`
 *   (8787) must work with no config. `*` covers the port.
 *
 * Note this is still stricter than the old behaviour even with loopback in
 * it. Loopback is trusted in production only in the narrow sense that a page
 * served from the user's own machine can talk to the deployed auth API;
 * nothing else is. Anything you need beyond these — a LAN IP for testing on
 * your phone, say — goes in `DEV_ORIGINS`, which is folded in below.
 */
const ALLOWED_HOSTS = [
	'job-tracker.sanctum.workers.dev',
	'*.workers.dev',
	'localhost:*',
	'127.0.0.1:*'
];

/** `http://localhost:8787` → `localhost:8787`. Unparseable input → null. */
function hostOf(origin: string): string | null {
	try {
		return new URL(origin).host || null;
	} catch {
		return null;
	}
}

function buildAuth(env: Env) {
	// `vars` in wrangler.jsonc are typed as their literal values, so an empty
	// DEV_ORIGINS is the type `""` — and a truthiness check on `""` collapses
	// to `never`, which would make `.split` a type error. Widen it once here;
	// at runtime it is whatever the environment actually holds (a real dev
	// override is a non-empty comma-separated list).
	const devOrigins: string = env.DEV_ORIGINS;
	const extraOrigins = devOrigins
		.split(',')
		.map((o) => o.trim())
		.filter(Boolean);

	return betterAuth({
		appName: 'Job Tracker',
		secret: env.BETTER_AUTH_SECRET,
		// Two shapes, deliberately:
		//
		// BETTER_AUTH_URL set  → that string, pinned. Use it only to force a
		// single origin; it costs you the "same build everywhere" property.
		//
		// BETTER_AUTH_URL unset → the dynamic object. Better Auth reads the
		// host per request and validates it against `allowedHosts`, so one
		// build still works on http://localhost:5173, on the wrangler dev
		// port, and on https://job-tracker.sanctum.workers.dev — but an
		// unlisted host is rejected rather than silently trusted. That is
		// what silences the "Base URL is not set" warning: the warning fires
		// only when baseURL resolves to nothing (see
		// better-auth/dist/context/create-context.mjs).
		//
		// No `fallback` on purpose. An unknown host should fail loudly,
		// pointing at the host that was rejected, not quietly pretend to be
		// production.
		baseURL: env.BETTER_AUTH_URL
			? env.BETTER_AUTH_URL
			: {
					allowedHosts: [
						...ALLOWED_HOSTS,
						...extraOrigins.map(hostOf).filter((h): h is string => h !== null)
					],
					protocol: 'auto'
				},
		// baseURL is always trusted; extra dev origins come from an optional
		// DEV_ORIGINS var (comma-separated). The dynamic config already adds
		// an http+https origin for every allowed host, so this only needs the
		// literal entries. Never hardcode localhost here — Better Auth docs:
		// "Do not leave the localhost origin in a trusted origins list of a
		// production auth instance."
		trustedOrigins: extraOrigins,
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
			// Sign-ups never get a session: most land in the approval
			// queue, and Better Auth's auto-sign-in would hand them a
			// valid session cookie that every guarded route then has to
			// bounce around (the /pending-approval trap). With this off,
			// signUpEmail returns { token: null, user } — the account
			// exists, but nobody is "signed in" until an admin approves
			// and the user signs in for real.
			autoSignIn: false
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
		rateLimit: { enabled: true, window: 60, max: 100, storage: 'database', modelName: 'rateLimit' },
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
