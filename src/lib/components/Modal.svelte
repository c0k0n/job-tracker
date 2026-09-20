<script lang="ts" module>
	// Module-scoped counter for stacking. We track how many modals are open
	// globally so the topmost modal closes on Escape (not all of them) and
	// so only the topmost one traps focus.
	//
	// Deliberately NON-reactive: the open-lifecycle `$effect` below reads
	// these in its teardown (which Svelte tracks as dependencies) while its
	// body writes them, which would re-trigger the effect forever. Keeping
	// them as plain values breaks that cycle.
	let openCount = 0;
	let topId: string | null = null;
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Bindable so the parent can do `<Modal bind:open={...}>`. */
		open: boolean;
		/** Title rendered in the modal header. Required for a11y labelling. */
		title: string;
		/** Optional subtitle / description shown under the title. */
		subtitle?: string;
		/** Width preset. `md` is the default for forms/dashboards. */
		size?: 'sm' | 'md' | 'lg' | 'xl';
		/** Hide the built-in close (×) button. Rare; use only when the modal
		 * has its own dismissal action (e.g. "Done" in a wizard). */
		hideCloseButton?: boolean;
		/** Body content. Snippet so the parent can pass arbitrary markup. */
		children?: Snippet;
		/** Footer slot (action buttons). Snippet so the parent controls layout. */
		footer?: Snippet;
	}

	let {
		open = $bindable(false),
		title,
		subtitle,
		size = 'md',
		hideCloseButton = false,
		children,
		footer
	}: Props = $props();

	const id = `modal-${Math.random().toString(36).slice(2, 9)}`;
	const titleId = `${id}-title`;
	// Don't compute subtitleId eagerly because `subtitle` is a prop; we want
	// it to react. Compute it where it's read (inside the template).
	const subtitleId: string | undefined = $derived(subtitle ? `${id}-subtitle` : undefined);

	let dialogEl = $state<HTMLDivElement | null>(null);
	// Non-reactive: only ever read/written inside the open-lifecycle effect
	// and its teardown. Reactive state here would form a read-write cycle
	// (teardown reads are effect dependencies).
	let restoreFocusEl: HTMLElement | null = null;

	const sizeClass = $derived(
		{
			sm: 'max-w-sm',
			md: 'max-w-lg',
			lg: 'max-w-2xl',
			xl: 'max-w-4xl'
		}[size]
	);

	function close() {
		open = false;
	}

	function onKeydown(e: KeyboardEvent) {
		// Only react if this modal is the topmost one.
		if (topId !== id) return;

		if (e.key === 'Escape') {
			e.preventDefault();
			close();
			return;
		}

		if (e.key === 'Tab') {
			// Focus trap: cycle within the modal's tabbable descendants.
			const tabbables = getTabbables(dialogEl);
			if (tabbables.length === 0) return;

			const first = tabbables[0]!;
			const last = tabbables[tabbables.length - 1]!;
			const active = document.activeElement as HTMLElement | null;

			if (e.shiftKey && active === first) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && active === last) {
				e.preventDefault();
				first.focus();
			}
		}
	}

	function getTabbables(root: HTMLElement | null): HTMLElement[] {
		if (!root) return [];
		const selector = [
			'a[href]',
			'button:not([disabled])',
			'input:not([disabled]):not([type="hidden"])',
			'select:not([disabled])',
			'textarea:not([disabled])',
			'[tabindex]:not([tabindex="-1"])'
		].join(',');
		return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((el) => {
			// Skip elements that are visually hidden or have aria-hidden.
			if (el.getAttribute('aria-hidden') === 'true') return false;
			if (el.tabIndex < 0) return false;
			const style = getComputedStyle(el);
			if (style.display === 'none' || style.visibility === 'hidden') return false;
			return true;
		});
	}

	function onBackdropClick(e: MouseEvent) {
		// Only close on direct backdrop click, not on inner-element bubbling.
		if (e.target === e.currentTarget) {
			close();
		}
	}

	// Open lifecycle: focus the first tabbable on mount, restore focus on
	// close, lock body scroll while any modal is open.
	$effect(() => {
		if (open) {
			restoreFocusEl = document.activeElement as HTMLElement | null;
			openCount += 1;
			topId = id;
			// Defer initial focus to next tick so the DOM is mounted.
			queueMicrotask(() => {
				const tabbables = getTabbables(dialogEl);
				tabbables[0]?.focus();
			});
			// Body scroll lock — only when the *first* modal opens.
			if (openCount === 1) {
				document.body.style.overflow = 'hidden';
			}
			// Listen for Escape at the document level so it works regardless
			// of focus location inside the modal.
			document.addEventListener('keydown', onKeydown);
		}

		return () => {
			// Cleanup runs when `open` flips false.
			if (openCount > 0) openCount -= 1;
			if (topId === id) topId = null;
			document.removeEventListener('keydown', onKeydown);
			if (openCount === 0) {
				document.body.style.overflow = '';
			}
			// Restore focus to whatever opened us.
			restoreFocusEl?.focus();
			restoreFocusEl = null;
		};
	});
</script>

{#if open}
	<!--
		Backdrop. Click on the backdrop closes; click on the dialog does not.
		`inert` on the rest of the page (via aria-hidden on body would also
		work but inert is the modern primitive).
	-->
	<div
		role="presentation"
		onclick={onBackdropClick}
		class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-fg/40 px-4 pt-[8vh] pb-8 backdrop-blur-sm sm:pt-[12vh]"
	>
		<div
			bind:this={dialogEl}
			role="dialog"
			aria-modal="true"
			aria-labelledby={titleId}
			aria-describedby={subtitleId}
			tabindex="-1"
			class="relative w-full {sizeClass} rounded-lg border border-border bg-surface text-fg shadow-2xl focus:outline-none"
		>
			<!-- Header -->
			<div class="flex items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-6">
				<div class="min-w-0 flex-1">
					<h2
						id={titleId}
						class="text-lg font-semibold tracking-tight text-balance text-fg sm:text-xl"
					>
						{title}
					</h2>
					{#if subtitle}
						<p id={subtitleId} class="mt-1 text-sm text-pretty text-muted">
							{subtitle}
						</p>
					{/if}
				</div>
				{#if !hideCloseButton}
					<button
						type="button"
						onclick={close}
						aria-label="Close dialog"
						class="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
					>
						<svg
							aria-hidden="true"
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 20 20"
							fill="currentColor"
							class="size-5"
						>
							<path
								d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"
							/>
						</svg>
					</button>
				{/if}
			</div>

			<!-- Body -->
			<div class="px-4 py-5 sm:px-6">
				{#if children}
					{@render children()}
				{/if}
			</div>

			<!-- Footer (optional) -->
			{#if footer}
				<div
					class="flex flex-wrap items-center justify-end gap-3 rounded-b-lg border-t border-border bg-surface-2 px-4 py-3 sm:px-6"
				>
					{@render footer()}
				</div>
			{/if}
		</div>
	</div>
{/if}
