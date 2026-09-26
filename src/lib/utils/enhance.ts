/**
 * Graceful-degradation helper for `use:enhance` form posts.
 *
 * Why this exists. SvelteKit's `enhance` catches a failed `fetch` (dead
 * connection, worker restart, DNS blip) and turns it into
 * `{ type: 'error', error }` — that half is in the installed source at
 * node_modules/@sveltejs/kit/src/runtime/app/forms.js, lines ~192-205.
 * The *default* callback then calls `applyAction(result)`, and applying
 * an error result is what throws to the nearest `+error.svelte`
 * boundary — that half is in .../runtime/client/client.js, ~2593-2600
 * (`set_nearest_error_page`). So a momentary network hiccup on "Move to
 * trash" replaces the entire dashboard with an error page and loses the
 * user's filters, scroll position and open modal.
 *
 * That default is right for a *navigation* (there is nothing else to do)
 * but wrong for a mutation the user can simply retry. This helper keeps
 * the page intact and reports the failure inline instead.
 *
 * Only `type === 'error'` is intercepted. `success`, `failure` (a
 * `fail()` payload) and `redirect` all still go through `update()`, so
 * validation echo-back and post-action redirects behave exactly as
 * before.
 */

import type { SubmitFunction } from '@sveltejs/kit';

/** Turn whatever came back into one short sentence a person can act on. */
function messageFor(error: unknown): string {
	if (error instanceof Error && error.message) return error.message;
	if (typeof error === 'string' && error) return error;
	return 'Something went wrong. Check your connection and try again.';
}

/**
 * Build a `use:enhance` submit function that reports errors to `onError`
 * instead of throwing the page at the error boundary.
 *
 * @param onError Called with a human-readable message. Pass a state
 *   setter so the message renders in a `role="alert"` region.
 * @param opts.reset Reset the form after a successful post (default
 *   true, matching the built-in behaviour). Row-action forms pass
 *   nothing; they have no fields worth resetting.
 */
export function safeEnhance(
	onError: (message: string) => void,
	opts?: { reset?: boolean; invalidateAll?: boolean }
): SubmitFunction {
	return () =>
		async ({ result, update }) => {
			if (result.type === 'error') {
				onError(messageFor(result.error));
				return;
			}
			await update({
				reset: opts?.reset ?? true,
				invalidateAll: opts?.invalidateAll ?? true
			});
		};
}

/** Message used by forms that already have a custom enhance callback. */
export { messageFor as enhanceErrorMessage };
