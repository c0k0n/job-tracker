/**
 * Better Auth client (Svelte). Same-origin; the catch-all route is mounted
 * by svelteKitHandler in src/hooks.server.ts at /api/auth/*.
 *
 * `usernameClient` mirrors the server's username plugin; `adminClient`
 * mirrors admin (only needed if we ever call admin endpoints from the
 * browser — kept for type parity with the server plugins).
 */

import { createAuthClient } from 'better-auth/svelte';
import { adminClient, usernameClient } from 'better-auth/client/plugins';
import { inferAdditionalFields } from 'better-auth/client/plugins';
import type { AuthInstance } from '$lib/server/auth';

export const authClient = createAuthClient({
	plugins: [usernameClient(), adminClient(), inferAdditionalFields<AuthInstance>()]
});

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
