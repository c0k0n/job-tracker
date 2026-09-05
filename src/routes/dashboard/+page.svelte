<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve as resolvePath } from '$app/paths';
	import { page as pageStore } from '$app/state';
	import type { PageData } from './$types';
	import type {
		Application,
		ApplicationFilters,
		ApplicationSort,
		ApplicationStage,
		KpiCounts
	} from '$lib/types';
	import { applyFilters, applySort, serializeFiltersToUrl } from '$lib/utils/sortFilter';
	import StatCard from '$lib/components/StatCard.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import ApplicationsTable from '$lib/components/ApplicationsTable.svelte';
	import PipelineBar from '$lib/components/PipelineBar.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Button from '$lib/components/Button.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import StageActivityHeatmap from '$lib/components/StageActivityHeatmap.svelte';
	import VelocityChart from '$lib/components/VelocityChart.svelte';
	import ConversionFunnel from '$lib/components/ConversionFunnel.svelte';

	let { data }: { data: PageData } = $props();

	// Local copies of filters/sort that drive the URL on every change.
	// We round-trip through `goto` so the URL is always the source of
	// truth (refresh-safe, shareable, back-button-friendly).
	let filters: ApplicationFilters = $state({
		q: '',
		stages: [],
		statuses: [],
		arrangements: [],
		tags: []
	});
	let sort: ApplicationSort = $state({ key: 'stageChangedAt', dir: 'desc' });
	let activeStageFilter: ApplicationStage | null = $state(null);

	// Apply URL changes → local state. This is one-directional: URL wins
	// on load; user interactions then write to URL via the `$effect` below.
	$effect(() => {
		filters = data.filters;
		sort = data.sort;
	});

	// Local changes → URL. We do this with `goto(..., { replaceState: true })`
	// so the back button doesn't accumulate every keystroke (the search
	// input is already debounced 150ms before this fires).
	//
	// Pattern: extract the URL target into a derived, then in a separate
	// `$effect` fire the navigation. The target is built with
	// `resolvePath()` from `$app/paths` so it's typed as `ResolvedPathname`
	// and the `no-navigation-without-resolve` rule recognizes it as a
	// canonical internal URL.
	const urlTarget = $derived.by(() => {
		const sp = serializeFiltersToUrl(filters, sort);
		const search = sp.toString() ? `?${sp.toString()}` : '';
		// `/dashboard${search}` starts with `/`, satisfying resolvePath's
		// absolute-path requirement. The interpolated search keeps the
		// type narrower than a bare `string` so TS is happy too.
		return resolvePath(`/dashboard${search}`);
	});

	$effect(() => {
		const target = urlTarget;
		const current = pageStore.url.pathname + pageStore.url.search;
		if (target !== current) {
			// `goto` is fire-and-forget here. The promise's resolution
			// (the load function re-running) is what we actually want;
			// awaiting it doesn't add value. We attach `.catch` to
			// silently swallow navigation cancellations (e.g. the user
			// clicked another link first).
			void goto(target, {
				replaceState: true,
				keepFocus: true,
				noScroll: true
			}).catch(() => {
				// Navigation cancelled (e.g. user clicked another link first).
				// No-op.
			});
		}
	});

	// Derived data: filter → sort → render. Pure, no side effects.
	const visibleRows: Application[] = $derived(
		applySort(applyFilters(data.applications, filters), sort)
	);

	// Apply stage filter (clicked from the pipeline bar) on top of the
	// existing filter set. Single-stage only at MVP; future round can add
	// multi-select by extending the filter shape. We do this in the click
	// handler (not in an $effect) because updating `filters` inside an
	// $effect that reads `filters` is the classic reactivity anti-pattern.
	function onSelectStage(stage: ApplicationStage) {
		const isActive = activeStageFilter === stage;
		activeStageFilter = isActive ? null : stage;
		if (isActive) {
			// Active stage was unset and the current stage filter matches
			// the previously-active one — clear it.
			if (filters.stages.length === 1 && filters.stages[0] === stage) {
				filters = { ...filters, stages: [] };
			}
		} else {
			filters = { ...filters, stages: [stage] };
		}
	}

	const kpis: KpiCounts = $derived(data.kpis);
	const hasApplications = $derived(data.applications.length > 0);
	const hasVisibleRows = $derived(visibleRows.length > 0);
	const hasActiveFilters = $derived(
		filters.q.length > 0 ||
			filters.stages.length > 0 ||
			filters.statuses.length > 0 ||
			filters.arrangements.length > 0 ||
			filters.tags.length > 0
	);

	const staleCount = $derived(
		data.applications.filter((a) => a.status === 'stalled' || a.status === 'ghosted').length
	);

	// KpiCard sublabel copy.
	const interviewsSublabel = $derived.by(() => {
		if (kpis.interviewsNext30Days === 0) return 'No interviews scheduled';
		if (kpis.interviewsNext30Days === 1) return '1 interview in the next 30 days';
		return `${kpis.interviewsNext30Days} interviews in the next 30 days`;
	});
	const appliedSublabel = $derived.by(() => {
		if (kpis.appliedThisMonth === 0) return 'No applications this month';
		if (kpis.appliedThisMonth === 1) return '1 application this month';
		return `${kpis.appliedThisMonth} applications this month`;
	});
	const offersSublabel = $derived.by(() => {
		if (kpis.offersPending === 0) return 'No offers yet';
		return `${kpis.offersPending} ${kpis.offersPending === 1 ? 'offer' : 'offers'} pending decision`;
	});
	const activeSublabel = $derived.by(() => {
		if (kpis.active === 0) return 'No active applications';
		return `Across all open stages`;
	});
	const needsAttentionSublabel = $derived.by(() => {
		if (kpis.needsAttention === 0) return 'All applications have fresh signals';
		return `Stalled or ghosted: consider following up`;
	});

	// Per-row click handler. In Round A we just log it; Round C wires
	// it to the application-detail modal.
	function onRowClick() {
		// Intentionally a no-op in Round A. The row already shows hover
		// focus and `role="link"` for keyboard activation; the modal
		// lands in Round C.
	}
</script>

<svelte:head>
	<title>Dashboard · Job Tracker</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:py-10">
	<!-- Header -->
	<header class="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
		<div>
			<p class="font-mono text-[11px] tracking-widest text-muted uppercase">Job Tracker</p>
			<h1 class="mt-1 text-2xl font-semibold tracking-tight text-balance text-fg sm:text-3xl">
				Dashboard
			</h1>
			<p class="mt-1 text-sm text-pretty text-muted">
				Welcome back, {data.user.username}.
			</p>
		</div>
		<form method="POST">
			<Button type="submit" variant="outline">Sign out</Button>
		</form>
	</header>

	<!--
		Stale/ghosted banner. Always shown when the count is > 0 — these
		need explicit user attention, not a chart they might miss. We
		don't gate this on `hasApplications` so even users with one stale
		row see it.
	-->
	{#if staleCount > 0}
		<div
			role="status"
			class="mb-6 flex items-start gap-3 rounded-lg border border-status-stalled-700 bg-status-stalled-100 px-4 py-3"
		>
			<svg
				aria-hidden="true"
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 20 20"
				fill="currentColor"
				class="mt-0.5 size-5 shrink-0 text-status-stalled-700"
			>
				<path
					fill-rule="evenodd"
					d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 6a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 6Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
					clip-rule="evenodd"
				/>
			</svg>
			<div class="flex-1 text-sm">
				<p class="font-medium text-status-stalled-700">
					{staleCount}
					{staleCount === 1 ? 'application needs' : 'applications need'} your attention
				</p>
				<p class="mt-0.5 text-status-stalled-700/80">
					Stalled or ghosted. Consider a follow-up email or moving them to withdrawn.
				</p>
			</div>
		</div>
	{/if}

	<!-- KPI strip -->
	<section
		aria-label="Application metrics"
		class="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-5"
	>
		<StatCard label="Active" value={kpis.active} sublabel={activeSublabel} accent="accent" />
		<StatCard
			label="Interviews"
			value={kpis.interviewsNext30Days}
			sublabel={interviewsSublabel}
			accent="warning"
		/>
		<StatCard
			label="Offers"
			value={kpis.offersPending}
			sublabel={offersSublabel}
			accent="success"
		/>
		<StatCard
			label="Applied"
			value={kpis.appliedThisMonth}
			sublabel={appliedSublabel}
			accent="accent"
		/>
		<StatCard
			label="Needs attention"
			value={kpis.needsAttention}
			sublabel={needsAttentionSublabel}
			accent="danger"
			tone={kpis.needsAttention > 0 ? 'danger' : 'default'}
		/>
	</section>

	<!--
		Pipeline bar. Click any stage segment to filter the table by that
		stage. We render this even when there are no applications so the
		user sees the shape and knows where their counts will appear.
	-->
	<section class="mt-6 sm:mt-8" aria-labelledby="pipeline-heading">
		<h2 id="pipeline-heading" class="text-sm font-medium text-fg">Pipeline</h2>
		<div class="mt-3">
			<PipelineBar
				counts={data.stageCounts}
				onSelect={onSelectStage}
				activeStage={activeStageFilter}
			/>
		</div>
	</section>

	<!--
		Insights (Round B). Three independent visualizations, each handles
		its own empty state, so the section doesn't need a wrapper
		empty-state. Layout: heatmap + velocity side-by-side on `lg+`,
		funnel full-width below. Mobile stack order is intentional:
		heatmap (historical context) → velocity (recent activity) → funnel
		(progression shape). Only rendered when the user has any data.
	-->
	{#if hasApplications}
		<section class="mt-6 sm:mt-8" aria-labelledby="insights-heading">
			<h2 id="insights-heading" class="text-sm font-medium text-fg">Insights</h2>
			<div class="mt-3 grid gap-3 sm:gap-4 lg:grid-cols-2">
				<StageActivityHeatmap apps={data.applications} />
				<VelocityChart apps={data.applications} />
			</div>
			<div class="mt-3 sm:mt-4">
				<ConversionFunnel apps={data.applications} />
			</div>
		</section>
	{/if}

	<!-- Filters + table -->
	<section class="mt-6 sm:mt-8" aria-labelledby="applications-heading">
		<div class="flex flex-wrap items-end justify-between gap-3">
			<h2 id="applications-heading" class="text-sm font-medium text-fg">Applications</h2>
			{#if hasApplications}
				<Button
					variant="primary"
					size="sm"
					disabled
					ariaLabel="Add application (coming in Round C)"
				>
					+ Add application
				</Button>
			{/if}
		</div>

		{#if hasApplications}
			<div class="mt-4">
				<FilterBar bind:filters bind:sort {hasApplications} tagFacets={data.tagFacets} />
			</div>
		{/if}

		<div class="mt-4">
			{#if !hasApplications}
				<EmptyState
					title="Add your first application"
					description="Track job applications, contacts, interviews, and notes. Private to your account."
				>
					{#snippet action()}
						<Button variant="primary" disabled ariaLabel="Add application (coming in Round C)">
							+ Add application
						</Button>
					{/snippet}
				</EmptyState>
			{:else if !hasVisibleRows}
				<EmptyState
					title="No applications match these filters"
					description={hasActiveFilters
						? 'Try clearing one of the filters or the search box.'
						: 'Adjust the search to see results.'}
				/>
			{:else}
				<ApplicationsTable
					rows={visibleRows}
					{sort}
					{onRowClick}
					onSortChange={(next) => (sort = next)}
				/>
			{/if}
		</div>

		{#if hasApplications}
			<p class="mt-3 text-xs text-muted">
				Showing {visibleRows.length} of {data.applications.length}
				{visibleRows.length === 1 ? 'application' : 'applications'}.
				{#if staleCount > 0}
					<span class="ml-2 inline-flex items-center gap-1 align-middle">
						<StatusBadge kind="status" value="stalled" />
						<span class="text-muted">{staleCount} stalled or ghosted</span>
					</span>
				{/if}
			</p>
		{/if}
	</section>

	<!--
		Footer. Round C lands here: application detail modal, sharing,
		admin approvals, CSV export. We keep the hint small so the user
		knows the dashboard will keep growing.
	-->
	<footer class="mt-12 border-t border-border pt-4 text-xs text-muted">
		<p>Application detail, sharing, and CSV export are on the way. This is Round C.</p>
	</footer>
</div>
