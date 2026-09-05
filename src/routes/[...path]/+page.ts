import { error } from '@sveltejs/kit';

/**
 * Catch-all route for any URL that doesn't match a defined page.
 * Throwing a 404 here guarantees our `+error.svelte` boundary renders,
 * instead of SvelteKit's default fallback.
 */
export function load() {
	error(404, 'The page you’re looking for doesn’t exist.');
}
