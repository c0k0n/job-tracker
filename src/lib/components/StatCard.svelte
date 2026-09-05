<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Small uppercase label above the value. */
		label: string;
		/** Headline number/string. */
		value: string | number;
		/** Optional sublabel below the value (e.g. "3 overdue"). */
		sublabel?: string;
		/** Tones the value color — danger for the needs-attention KPI,
		 * success for offers-pending, etc. Default: foreground. */
		tone?: 'default' | 'danger' | 'success' | 'warning';
		/** Optional accent strip at the top edge of the card. */
		accent?: 'danger' | 'success' | 'warning' | 'accent' | null;
		/** Leading icon snippet. */
		icon?: Snippet;
		/** Whether the value is loading (shows skeleton instead of digits). */
		loading?: boolean;
	}

	let {
		label,
		value,
		sublabel,
		tone = 'default',
		accent = null,
		icon,
		loading = false
	}: Props = $props();

	const toneClass = $derived(
		{
			default: 'text-fg',
			danger: 'text-danger',
			success: 'text-success',
			warning: 'text-muted'
		}[tone]
	);

	const accentClass = $derived(
		{
			danger: 'bg-danger',
			success: 'bg-success',
			warning: 'bg-muted',
			accent: 'bg-accent'
		}[accent ?? 'accent']
	);
</script>

<article
	class="relative flex flex-col gap-2 rounded-lg border border-border bg-surface px-4 py-4 sm:px-5 sm:py-5"
>
	{#if accent}
		<span aria-hidden="true" class="absolute inset-x-0 top-0 h-0.5 rounded-t-lg {accentClass}"
		></span>
	{/if}

	<header class="flex items-center gap-2">
		{#if icon}
			<span class="text-muted" aria-hidden="true">{@render icon()}</span>
		{/if}
		<h3 class="font-mono text-[11px] tracking-widest text-muted uppercase">
			{label}
		</h3>
	</header>

	{#if loading}
		<div aria-hidden="true" class="h-9 w-16 animate-pulse rounded bg-surface-2"></div>
	{:else}
		<p class="text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl {toneClass}">
			{value}
		</p>
	{/if}

	{#if sublabel}
		<p class="text-xs text-muted">{sublabel}</p>
	{/if}
</article>
