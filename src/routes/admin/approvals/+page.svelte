<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve as resolvePath } from '$app/paths';
	import { formatDateShort, formatRelative } from '$lib/utils/dates';
	import { safeEnhance } from '$lib/utils/enhance';
	import Button from '$lib/components/Button.svelte';
	import type { PageData } from './$types';

	let { data, form }: { data: PageData; form: { approved?: string; rejected?: string } | null } =
		$props();

	const pending = $derived(data.pending);

	// Approve/reject post without a page reload, so a dropped request is
	// reported inline — the default enhance would throw the page at the
	// error boundary and lose the rest of the queue.
	let actionError = $state<string | null>(null);
	const onActionError = (message: string) => (actionError = message);
</script>

<svelte:head>
	<title>Admin · Approvals · Job Tracker</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8 lg:py-10">
	<header class="mb-6">
		<a
			href={resolvePath('/dashboard')}
			class="text-sm text-muted underline-offset-2 hover:text-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
		>
			← Back to dashboard
		</a>
		<p class="mt-3 font-mono text-[11px] tracking-widest text-muted uppercase">Admin</p>
		<h1 class="mt-1 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
			Sign-up approvals
		</h1>
		<p class="mt-1 text-sm text-muted">
			Accounts wait here until an admin approves them. Approving enables sign-in immediately;
			rejecting removes the account.
		</p>
	</header>

	{#if form?.approved}
		<div
			role="status"
			class="mb-4 rounded-md border border-status-active-700 bg-status-active-100 px-3 py-2 text-sm text-status-active-700"
		>
			Approved <code class="font-mono">{form.approved}</code>. They can sign in now.
		</div>
	{/if}
	{#if form?.rejected}
		<div
			role="status"
			class="mb-4 rounded-md border border-status-stalled-700 bg-status-stalled-100 px-3 py-2 text-sm text-status-stalled-700"
		>
			Rejected <code class="font-mono">{form.rejected}</code>. The account and its data were
			removed.
		</div>
	{/if}

	{#if actionError}
		<div
			role="alert"
			class="mb-4 rounded-md border border-danger bg-danger-bg px-3 py-2 text-sm text-danger"
		>
			{actionError}
		</div>
	{/if}

	{#if pending.length === 0}
		<div class="rounded-lg border border-dashed border-border bg-surface px-6 py-16 text-center">
			<h2 class="text-lg font-medium text-fg">All caught up</h2>
			<p class="mt-2 text-sm text-muted">No pending sign-ups right now.</p>
		</div>
	{:else}
		<ul class="space-y-3">
			{#each pending as signup (signup.id)}
				<li class="rounded-lg border border-border bg-surface px-4 py-4">
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div class="min-w-0 flex-1">
							<div class="flex items-baseline gap-2">
								<h3 class="text-base font-semibold text-fg">{signup.username}</h3>
								<span class="text-xs text-muted">
									requested {formatRelative(signup.requestedAt)} · {formatDateShort(
										signup.requestedAt
									)}
								</span>
							</div>
							<div class="mt-0.5 text-sm text-muted">
								<a
									href="mailto:{signup.email}"
									class="underline-offset-2 hover:text-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
								>
									{signup.email}
								</a>
							</div>
						</div>

						<div class="flex gap-2">
							<form method="POST" action="?/approve" use:enhance={safeEnhance(onActionError)}>
								<input type="hidden" name="id" value={signup.id} />
								<Button
									type="submit"
									variant="primary"
									size="sm"
									ariaLabel={`Approve ${signup.username}`}
								>
									Approve
								</Button>
							</form>
							<form method="POST" action="?/reject" use:enhance={safeEnhance(onActionError)}>
								<input type="hidden" name="id" value={signup.id} />
								<Button
									type="submit"
									variant="outline"
									size="sm"
									ariaLabel={`Reject ${signup.username}`}
								>
									Reject
								</Button>
							</form>
						</div>
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	<footer class="mt-12 border-t border-border pt-4 text-xs text-muted">
		<p>
			Approve flips the user's <code class="font-mono">disabled</code> flag so they can sign in. Reject
			removes the pending account and its data.
		</p>
	</footer>
</div>
