// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { AuthInstance } from '$lib/server/auth';

declare global {
	/**
	 * `BETTER_AUTH_URL` is deliberately absent from `wrangler.jsonc`: when it
	 * is unset, Better Auth derives the base URL from each request's origin,
	 * so one build works locally and in production. It stays *settable* as a
	 * runtime variable for anyone who wants to pin auth to one origin, which
	 * means the generated `Env` (built from wrangler.jsonc alone) never
	 * mentions it. Declared here so the optional read in auth.ts type-checks.
	 */
	interface Env {
		BETTER_AUTH_URL?: string;
	}

	namespace App {
		interface Platform {
			env: Env;
			ctx: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties;
		}

		// Extra fields attached to error(...) calls. `code` is optional and lets
		// routes branch (e.g. 404 vs 500) without parsing the message string.
		interface Error {
			code?: string;
		}

		// Per-request locals populated by src/hooks.server.ts from the Better
		// Auth session. `user` is null when the request has no valid session.
		interface Locals {
			user: AuthInstance.$Infer.Session.user | null;
			session: AuthInstance.$Infer.Session.session | null;
		}

		// Typed client-side state for shallow routing (pushState/replaceState).
		// Modal open/close lives here — NOT in page.url — because SvelteKit's
		// replaceState updates page.state but never page.url.
		interface PageState {
			detailId?: string;
			newApp?: boolean;
			resumeLibrary?: boolean;
		}
	}
}

export {};
