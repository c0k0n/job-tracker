<script lang="ts">
	import type { Snippet } from 'svelte';

	type Variant = 'primary' | 'ghost' | 'outline' | 'danger';
	type Size = 'sm' | 'md' | 'lg';

	interface Props {
		variant?: Variant;
		size?: Size;
		type?: 'button' | 'submit' | 'reset';
		/** Native `disabled`. The element leaves the tab order and is not
		 * announced — correct for a control that is *permanently*
		 * unavailable ("Restore" on an application that isn't in trash).
		 * For a *temporarily* unavailable control use `busy`. */
		disabled?: boolean;
		/** In-flight state: shows a spinner, sets `aria-busy`, and marks the
		 * button `aria-disabled` — but leaves it focusable and in the tab
		 * order, so a screen-reader user can still reach it and hear what
		 * happened. That is the whole reason this is not the same thing as
		 * `disabled`: a native `disabled` attribute is removed from
		 * sequential focus by every browser, so a busy button would vanish
		 * from the page mid-interaction. Clicks are swallowed (see
		 * `handleClick`), which is what actually prevents the double
		 * submit. */
		busy?: boolean;
		/** Forwarded click handler. */
		onclick?: (e: MouseEvent) => void;
		/** Optional leading icon snippet. */
		icon?: Snippet;
		/** Button content. */
		children?: Snippet;
		/** Native tooltip text. Svelte doesn't forward unknown attrs, so a
		 * button-level title needs an explicit prop like ariaLabel. */
		title?: string;
		/** Native aria-label fallback when there's no visible text. */
		ariaLabel?: string;
		/** Extra classes (rare; for layout alignment in the dashboard). */
		class?: string;
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
		ariaLabel,
		title
	}: Props = $props();

	const variantClass = $derived(
		{
			primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
			ghost: 'bg-transparent text-fg hover:bg-surface-2',
			outline: 'bg-surface text-fg border border-border-strong hover:bg-surface-2',
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
		// Swallow the activation, not just the handler call: a submit button
		// inside a form would still post the form on click even if `onclick`
		// is a no-op, which is the exact double-submit `busy` exists to stop.
		if (disabled || busy) {
			e.preventDefault();
			return;
		}
		onclick?.(e);
	}
</script>

<button
	{type}
	{disabled}
	aria-disabled={disabled || busy ? 'true' : undefined}
	aria-busy={busy || undefined}
	aria-label={ariaLabel}
	{title}
	onclick={handleClick}
	class="inline-flex cursor-pointer items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60 {variantClass} {sizeClass} {extraClass}"
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
