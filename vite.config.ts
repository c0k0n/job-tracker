import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter()
		})
	],
	build: {
		rolldownOptions: {
			checks: {
				// rolldown's PLUGIN_TIMINGS report: fires when the Rust-side
				// build exceeds 3s and plugin time is >100x the link stage.
				// For SvelteKit that is always true and never actionable —
				// vite-plugin-sveltekit-compile is legitimately most of the
				// build. Flip back to true if you ever suspect a plugin is
				// genuinely slow. (`bundlerTimings` in newer rolldown; this
				// version's binding still reads `pluginTimings`.)
				pluginTimings: false
			}
		}
	}
});
