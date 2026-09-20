<script lang="ts">
	import { page } from '$app/state';

	const status = $derived(page.status);
	const message = $derived(page.error?.message ?? 'Something went wrong');

	const isNotFound = $derived(status === 404);
	const title = $derived(isNotFound ? 'Page not found' : 'Something went wrong');
	const headingId = 'error-heading';

	// Surface the route the user tried to reach so they can correct it
	const attemptedPath = $derived(page.url?.pathname ?? '');

	function goHome() {
		// Hard nav resets focus to the new page; SPA goto would lose the <body> reset
		window.location.assign('/');
	}
</script>

<svelte:head>
	<title>{status} {title} · Job Tracker</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main
	id="main"
	class="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center px-6 py-16 sm:py-24"
	aria-labelledby={headingId}
>
	<p class="font-mono text-sm tracking-widest text-muted uppercase">
		Error {status}
	</p>

	<h1
		id={headingId}
		class="mt-3 text-4xl font-semibold tracking-tight text-balance text-fg sm:text-5xl"
	>
		{title}
	</h1>

	{#if isNotFound}
		<p class="mt-4 text-lg text-pretty text-muted">
			The page you tried to reach
			{#if attemptedPath}
				<code class="rounded-sm bg-surface-2 px-1.5 py-0.5 font-mono text-base break-all text-fg"
					>{attemptedPath}</code
				>
			{/if}
			doesn’t exist, or it may have moved.
		</p>
	{:else}
		<p class="mt-4 text-lg text-pretty text-muted">
			{message}
		</p>
		<p class="mt-2 text-sm text-muted">
			You can try again, head back to the start, or come back later.
		</p>
	{/if}

	<div class="mt-10 flex flex-wrap gap-3">
		<button
			type="button"
			onclick={goHome}
			class="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
		>
			Back to home
		</button>

		<button
			type="button"
			onclick={() => history.back()}
			class="inline-flex items-center justify-center rounded-md border border-border-strong bg-surface px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
		>
			Go back
		</button>
	</div>
</main>
