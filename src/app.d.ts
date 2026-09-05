// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { SessionUser } from '$lib/server/auth';

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

		// Per-request locals populated by src/hooks.server.ts.
		// `user` is null when the request has no valid session.
		// When we wire Better Auth this gains `session` alongside `user`.
		interface Locals {
			user: SessionUser | null;
		}

		// interface PageData {}

		// PageState is set by `pushState(url, state)` from $app/navigation; read
		// via `page.state` from $app/state. Round C uses shallow routing to
		// mount modals without changing the URL pathname; each modal claims a
		// unique state key so multiple deep-linkable panels could coexist.
		interface PageState {
			appId?: string;
			newApp?: boolean;
			resume?: boolean;
		}
	}
}

export {};
