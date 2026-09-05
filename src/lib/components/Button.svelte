<script lang="ts">
	import type { Snippet } from 'svelte';

	type Variant = 'primary' | 'ghost' | 'outline' | 'danger';
	type Size = 'sm' | 'md' | 'lg';

	interface Props {
		variant?: Variant;
		size?: Size;
		type?: 'button' | 'submit' | 'reset';
		disabled?: boolean;
		/** Show a spinner + aria-busy when true. The button stays focusable
		 * so screen readers announce the busy state; the spinner replaces
		 * any leading icon. */
		busy?: boolean;
		/** Forwarded click handler. */
		onclick?: (e: MouseEvent) => void;
		/** Optional leading icon snippet. */
		icon?: Snippet;
		/** Button content. */
		children?: Snippet;
		/** Extra classes (rare; for layout alignment in the dashboard). */
		class?: string;
		/** Native aria-label fallback when there's no visible text. */
		ariaLabel?: string;
	}

	let {
		variant = 'primary',
		size = 'md',
		type = 'button',
		disabled = false,
		busy = false,
		onclick,
		icon,
		children,
		class: extraClass = '',
		ariaLabel
	}: Props = $props();

	const variantClass = $derived(
		{
			primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
			ghost: 'bg-transparent text-fg hover:bg-surface-2',
			outline: 'bg-surface text-fg border border-border hover:bg-surface-2',
			danger: 'bg-danger text-danger-fg hover:opacity-90'
		}[variant]
	);

	const sizeClass = $derived(
		{
			sm: 'px-2.5 py-1.5 text-xs gap-1.5',
			md: 'px-4 py-2.5 text-sm gap-2',
			lg: 'px-5 py-3 text-base gap-2.5'
		}[size]
	);

	function handleClick(e: MouseEvent) {
		if (disabled || busy) return;
		onclick?.(e);
	}
</script>

<button
	{type}
	disabled={disabled || busy}
	aria-busy={busy || undefined}
	aria-label={ariaLabel}
	onclick={handleClick}
	class="inline-flex cursor-pointer items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 {variantClass} {sizeClass} {extraClass}"
>
	{#if busy}
		<span
			aria-hidden="true"
			class="inline-block size-3 animate-spin rounded-full border border-current border-t-transparent"
		></span>
	{:else if icon}
		{@render icon()}
	{/if}
	{#if children}
		{@render children()}
	{/if}
</button>
