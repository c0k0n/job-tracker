<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const user = $derived(data.user);
</script>

<svelte:head>
	<title>Dashboard · Job Tracker</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main id="main" class="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col px-6 py-12 sm:py-20">
	<header class="mb-12">
		<p class="font-mono text-xs tracking-widest text-muted uppercase">Job Tracker</p>
		<h1 class="mt-2 text-3xl font-semibold tracking-tight text-balance text-fg sm:text-4xl">
			Dashboard
		</h1>
	</header>

	<section aria-labelledby="account-heading" class="rounded-lg border border-border bg-surface p-6">
		<h2 id="account-heading" class="text-lg font-medium text-fg">Signed in</h2>
		<dl class="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
			<div>
				<dt class="font-mono text-xs tracking-wider text-muted uppercase">Username</dt>
				<dd class="mt-1 text-fg">{user.username}</dd>
			</div>
			<div>
				<dt class="font-mono text-xs tracking-wider text-muted uppercase">Email</dt>
				<dd class="mt-1 break-all text-fg">{user.email}</dd>
			</div>
		</dl>
	</section>

	<section
		aria-labelledby="upnext-heading"
		class="mt-8 rounded-lg border border-dashed border-border bg-surface-2 p-6"
	>
		<h2 id="upnext-heading" class="text-lg font-medium text-fg">Up next</h2>
		<p class="mt-2 text-sm text-pretty text-muted">
			Job applications, contacts, and notes will land here once the backend is wired.
		</p>
	</section>

	<form method="POST" class="mt-10">
		<button
			type="submit"
			class="inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-surface px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
		>
			Sign out
		</button>
	</form>
</main>
