<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Title. */
		title: string;
		/** Optional description shown below the title. */
		description?: string;
		/** Optional primary action snippet. */
		action?: Snippet;
		/** Optional icon / illustration. */
		icon?: Snippet;
	}

	let { title, description, action, icon }: Props = $props();
</script>

<div
	class="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface px-6 py-16 text-center"
>
	{#if icon}
		<div class="mb-4 text-muted" aria-hidden="true">{@render icon()}</div>
	{/if}
	<h2 class="text-lg font-medium text-balance text-fg sm:text-xl">{title}</h2>
	{#if description}
		<p class="mt-2 max-w-md text-sm text-pretty text-muted">{description}</p>
	{/if}
	{#if action}
		<div class="mt-6">{@render action()}</div>
	{/if}
</div>
