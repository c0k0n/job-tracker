// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { AuthInstance } from '$lib/server/auth';

declare global {
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
	}
}

export {};
