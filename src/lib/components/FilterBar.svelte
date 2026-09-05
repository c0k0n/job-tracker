<script lang="ts">
	import type { ApplicationFilters, ApplicationSort, SortKey, SortDir } from '$lib/types';
	import { STAGES } from '$lib/constants/stages';
	import { STATUSES } from '$lib/constants/stages';
	import { ARRANGEMENTS } from '$lib/constants/stages';

	interface Props {
		/** Bindable filter state. Parent owns it. */
		filters: ApplicationFilters;
		/** Bindable sort state. Parent owns it. */
		sort: ApplicationSort;
		/** When true, "Add your first application" empty-state hides the
		 * filter bar. When false, the filter bar always shows. */
		hasApplications: boolean;
	}

	let { filters = $bindable(), sort = $bindable(), hasApplications }: Props = $props();

	let queryInput = $state(filters.q);

	// Push debounced updates from the local input back to the parent's
	// filters.q. Debounced so the user can type without re-running the
	// filter on every keystroke (which would feel laggy with 18+ rows).
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		// Track local changes only.
		const next = queryInput;
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			if (next !== filters.q) {
				filters = { ...filters, q: next };
			}
		}, 150);
		return () => {
			if (debounceTimer) clearTimeout(debounceTimer);
		};
	});

	function toggleStage(value: (typeof STAGES)[number]['value']) {
		const has = filters.stages.includes(value);
		filters = {
			...filters,
			stages: has ? filters.stages.filter((v) => v !== value) : [...filters.stages, value]
		};
	}
	function toggleStatus(value: (typeof STATUSES)[number]['value']) {
		const has = filters.statuses.includes(value);
		filters = {
			...filters,
			statuses: has ? filters.statuses.filter((v) => v !== value) : [...filters.statuses, value]
		};
	}
	function toggleArrangement(value: (typeof ARRANGEMENTS)[number]['value']) {
		const has = filters.arrangements.includes(value);
		filters = {
			...filters,
			arrangements: has
				? filters.arrangements.filter((v) => v !== value)
				: [...filters.arrangements, value]
		};
	}

	function clearAll() {
		filters = { q: '', stages: [], statuses: [], arrangements: [], tags: [] };
		queryInput = '';
	}

	function setSort(key: SortKey) {
		if (sort.key === key) {
			// Toggle direction if same key
			sort = { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' };
		} else {
			sort = { key, dir: 'desc' };
		}
	}

	function sortDirFor(key: SortKey): SortDir | null {
		return sort.key === key ? sort.dir : null;
	}

	const hasActiveFilters = $derived(
		filters.q.length > 0 ||
			filters.stages.length > 0 ||
			filters.statuses.length > 0 ||
			filters.arrangements.length > 0
	);
</script>

{#if hasApplications}
	<section
		aria-labelledby="filter-heading"
		class="rounded-lg border border-border bg-surface px-4 py-4 sm:px-5 sm:py-5"
	>
		<div class="flex items-center justify-between gap-3">
			<h2 id="filter-heading" class="text-sm font-medium text-fg">Filters</h2>
			{#if hasActiveFilters}
				<button
					type="button"
					onclick={clearAll}
					class="rounded-sm text-xs text-muted underline-offset-2 transition-colors hover:text-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
				>
					Clear all
				</button>
			{/if}
		</div>

		<!-- Search input -->
		<div class="mt-3">
			<label for="filter-search" class="sr-only">Search applications</label>
			<input
				id="filter-search"
				type="search"
				bind:value={queryInput}
				placeholder="Search company, role, description, notes…"
				class="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
			/>
		</div>

		<!-- Stage chips -->
		<div class="mt-4">
			<h3 class="font-mono text-[10px] tracking-widest text-muted uppercase">Stage</h3>
			<div class="mt-2 flex flex-wrap gap-1.5">
				{#each STAGES as stage (stage.value)}
					{@const active = filters.stages.includes(stage.value)}
					<button
						type="button"
						onclick={() => toggleStage(stage.value)}
						aria-pressed={active}
						class="cursor-pointer rounded-full border px-2.5 py-1 font-mono text-[11px] tracking-wide uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
						class:border-accent={active}
						class:bg-accent={active}
						class:text-accent-fg={active}
						class:border-border={!active}
						class:bg-surface={!active}
						class:text-fg={!active}
						class:hover:bg-surface-2={!active}
					>
						{stage.shortLabel}
					</button>
				{/each}
			</div>
		</div>

		<!-- Status chips -->
		<div class="mt-4">
			<h3 class="font-mono text-[10px] tracking-widest text-muted uppercase">Status</h3>
			<div class="mt-2 flex flex-wrap gap-1.5">
				{#each STATUSES as status (status.value)}
					{@const active = filters.statuses.includes(status.value)}
					<button
						type="button"
						onclick={() => toggleStatus(status.value)}
						aria-pressed={active}
						class="cursor-pointer rounded-full border px-2.5 py-1 font-mono text-[11px] tracking-wide uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
						class:border-accent={active}
						class:bg-accent={active}
						class:text-accent-fg={active}
						class:border-border={!active}
						class:bg-surface={!active}
						class:text-fg={!active}
						class:hover:bg-surface-2={!active}
					>
						{status.shortLabel}
					</button>
				{/each}
			</div>
		</div>

		<!-- Arrangement chips -->
		<div class="mt-4">
			<h3 class="font-mono text-[10px] tracking-widest text-muted uppercase">Work</h3>
			<div class="mt-2 flex flex-wrap gap-1.5">
				{#each ARRANGEMENTS as arrangement (arrangement.value)}
					{@const active = filters.arrangements.includes(arrangement.value)}
					<button
						type="button"
						onclick={() => toggleArrangement(arrangement.value)}
						aria-pressed={active}
						class="cursor-pointer rounded-full border px-2.5 py-1 font-mono text-[11px] tracking-wide uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
						class:border-accent={active}
						class:bg-accent={active}
						class:text-accent-fg={active}
						class:border-border={!active}
						class:bg-surface={!active}
						class:text-fg={!active}
						class:hover:bg-surface-2={!active}
					>
						{arrangement.label}
					</button>
				{/each}
			</div>
		</div>

		<!-- Sort row (secondary; users mostly sort by clicking column headers) -->
		<div class="mt-4 flex items-center gap-2">
			<h3 class="font-mono text-[10px] tracking-widest text-muted uppercase">Sort by</h3>
			<div class="flex flex-wrap gap-1.5">
				{#each [{ key: 'stageChangedAt' as const, label: 'Last activity' }, { key: 'appliedAt' as const, label: 'Applied' }, { key: 'company' as const, label: 'Company' }, { key: 'nextActionAt' as const, label: 'Next action' }] as opt (opt.key)}
					{@const active = sortDirFor(opt.key) !== null}
					{@const dir = sortDirFor(opt.key)}
					<button
						type="button"
						onclick={() => setSort(opt.key)}
						aria-pressed={active}
						class="cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
						class:border-accent={active}
						class:bg-accent={active}
						class:text-accent-fg={active}
						class:border-border={!active}
						class:bg-surface={!active}
						class:text-fg={!active}
						class:hover:bg-surface-2={!active}
					>
						{opt.label}
						{#if dir === 'asc'}
							<span aria-hidden="true">↑</span>
						{:else if dir === 'desc'}
							<span aria-hidden="true">↓</span>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	</section>
{/if}
