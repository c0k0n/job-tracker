<script lang="ts">
	import { resolve as resolvePath } from '$app/paths';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Awaiting approval · Job Tracker</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main
	id="main"
	class="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12 sm:py-20"
>
	<header class="mb-6">
		<p class="font-mono text-xs tracking-widest text-muted uppercase">Job Tracker</p>
		<h1 class="mt-2 text-3xl font-semibold tracking-tight text-balance text-fg sm:text-4xl">
			You're on the list
		</h1>
	</header>
	<p class="text-sm text-pretty text-muted sm:text-base">
		Your account is created and waiting for approval. This tracker is private to a small group, so
		an existing member has to let you in.
	</p>
	<p class="mt-4 text-sm text-muted">
		{#if data.handle}
			Once approved, sign in with <span class="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-fg"
				>{data.handle}</span
			>
			or your full email. Either works.
		{:else}
			Once approved, come back and sign in with your email.
		{/if}
	</p>
	<p class="mt-2 text-xs text-muted/80">This page is safe to close.</p>

	<div class="mt-8">
		<a
			href={resolvePath('/')}
			class="inline-flex items-center justify-center rounded-md border border-border-strong bg-surface px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
		>
			Back to sign in
		</a>
	</div>

	<footer class="mt-10 border-t border-border pt-4 text-xs text-muted">
		<p>Private tool. Your data stays in your account only.</p>
	</footer>
</main>
