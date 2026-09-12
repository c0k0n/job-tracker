<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';

	/** `?signedout=1` → show a calm confirmation instead of a bare form. */
	const justSignedOut = $derived(page.url.searchParams.get('signedout') === '1');
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
		an existing member has to let you in. You'll get access as soon as they do.
	</p>
	<p class="mt-4 text-sm text-muted">
		Come back and sign in once approved. This page is safe to close.
	</p>

	<div class="mt-8">
		<form method="POST" action="?/signout" use:enhance>
			<button
				type="submit"
				class="inline-flex items-center justify-center rounded-md border border-border bg-surface px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
			>
				Sign out of this account
			</button>
		</form>
		<p class="mt-2 text-xs text-muted">
			Signing out lets you use a different account while you wait for approval.
		</p>
		{#if justSignedOut}
			<p class="mt-3 text-xs text-success" role="status">
				Signed out. See you when you're approved.
			</p>
		{/if}
	</div>

	<footer class="mt-10 border-t border-border pt-4 text-xs text-muted">
		<p>Private tool. Your data stays in your account only.</p>
	</footer>
</main>
