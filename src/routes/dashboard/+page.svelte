<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve as resolvePath } from '$app/paths';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { page as pageStore } from '$app/state';
	import { enhance } from '$app/forms';
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
	import ApplicationDetailModal from '$lib/components/ApplicationDetailModal.svelte';
	import ResumeLibraryModal from '$lib/components/ResumeLibraryModal.svelte';
	import ApplicationForm from '$lib/components/ApplicationForm.svelte';
	import Modal from '$lib/components/Modal.svelte';

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
		const search = sp.toString() ? sp.toString() : '';
		const trash = data.trashView ? 'trash=1' : '';
		// Preserve the modal-open flags (?app, ?new, ?resume) when
		// filter/sort/trash changes, so the sync effect below never
		// strips a modal the user just opened.
		const flags: string[] = [];
		for (const key of ['app', 'new', 'resume']) {
			const value = pageStore.url.searchParams.get(key);
			if (value) flags.push(`${key}=${encodeURIComponent(value)}`);
		}
		const parts = [trash, search, ...flags].filter(Boolean);
		const query = parts.length ? `?${parts.join('&')}` : '';
		return resolvePath(`/dashboard${query}`);
	});

	$effect(() => {
		const target = urlTarget;
		const current = pageStore.url.pathname + pageStore.url.search;
		if (target !== current) {
			void goto(target, {
				replaceState: true,
				keepFocus: true,
				noScroll: true
			}).catch(() => {
				// Navigation cancelled.
			});
		}
	});

	// Derived data: filter → sort → render. Pure, no side effects.
	const visibleRows: Application[] = $derived(
		applySort(applyFilters(data.applications, filters), sort)
	);

	// Apply stage filter (clicked from the pipeline bar) on top of the
	// existing filter set. Single-stage only at MVP.
	function onSelectStage(stage: ApplicationStage) {
		const isActive = activeStageFilter === stage;
		activeStageFilter = isActive ? null : stage;
		if (isActive) {
			if (filters.stages.length === 1 && filters.stages[0] === stage) {
				filters = { ...filters, stages: [] };
			}
		} else {
			filters = { ...filters, stages: [stage] };
		}
	}

	const kpis: KpiCounts = $derived(data.kpis);
	const hasApplications = $derived(data.applications.length > 0 && !data.trashView);
	const hasTrashedApps = $derived(data.trashView && data.applications.length > 0);
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

	// Row click → server reload to fetch the detail bundle, then
	// the modal renders from `data.activeDetail`. Using `?app=`
	// (not shallow routing) because the detail bundle is large
	// and we want it server-rendered for the initial paint.
	function onRowClick(app: Application) {
		const sp = new SvelteURLSearchParams(pageStore.url.searchParams);
		sp.set('app', app.id);
		void goto(resolvePath(`/dashboard?${sp.toString()}`), {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}

	// Trash view toggle: navigate to /dashboard?trash=1 / without.
	const trashHref = $derived(resolvePath(data.trashView ? '/dashboard' : '/dashboard?trash=1'));
	const trashLabel = $derived(data.trashView ? 'Active' : 'Trash');

	let isNewAppOpen = $derived(pageStore.url.searchParams.get('new') === '1');

	// The new-app modal is `bind:open` on the derived above, so when it
	// closes itself (Esc, backdrop, header X) `open` flips without the
	// URL changing. Strip `?new=` so the URL stays the source of truth
	// and the modal doesn't reopen on the next render.
	$effect(() => {
		if (isNewAppOpen) return;
		if (typeof window === 'undefined') return;
		const sp = new SvelteURLSearchParams(window.location.search);
		if (!sp.has('new')) return;
		sp.delete('new');
		const qs = sp.toString();
		const next = (qs ? `/dashboard?${qs}` : '/dashboard') as `/${string}`;
		void goto(resolvePath(next), {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	});

	function openNewApp() {
		const sp = new SvelteURLSearchParams(pageStore.url.searchParams);
		sp.set('new', '1');
		void goto(resolvePath(`/dashboard?${sp.toString()}`), {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}
	function openResume() {
		const sp = new SvelteURLSearchParams(pageStore.url.searchParams);
		sp.set('resume', '1');
		void goto(resolvePath(`/dashboard?${sp.toString()}`), {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}
</script>

<svelte:head>
	<title>{data.trashView ? 'Trash' : 'Dashboard'} · Job Tracker</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:py-10">
	<!-- Header -->
	<header class="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
		<div>
			<p class="font-mono text-[11px] tracking-widest text-muted uppercase">Job Tracker</p>
			<h1 class="mt-1 text-2xl font-semibold tracking-tight text-balance text-fg sm:text-3xl">
				{data.trashView ? 'Trash' : 'Dashboard'}
			</h1>
			<p class="mt-1 text-sm text-pretty text-muted">
				Welcome back, {data.user.username}.
			</p>
		</div>
		<!-- Actions live in the Applications section header, not here.
			The top header only carries sign-out. -->
		<form method="POST" action="?/signout" use:enhance>
			<Button type="submit" variant="outline">Sign out</Button>
		</form>
	</header>

	{#if staleCount > 0 && !data.trashView}
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

	{#if !data.trashView}
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
	{/if}

	{#if !data.trashView}
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
	{/if}

	<!-- Applications table (active or trashed) -->
	<section class="mt-6 sm:mt-8" aria-labelledby="applications-heading">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div class="flex flex-wrap items-baseline gap-3">
				<h2 id="applications-heading" class="text-sm font-medium text-fg">
					{data.trashView ? 'Trash' : 'Applications'}
				</h2>
				{#if data.trashedCount > 0}
					<a
						href={trashHref}
						class="rounded-full border border-border bg-surface px-2.5 py-0.5 font-mono text-[11px] tracking-wide text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
					>
						{trashLabel} · {data.trashedCount}
					</a>
				{/if}
			</div>
			<!-- Action cluster: secondary actions sit beside the primary
				"Add application" button, not in the top header (sign-out only). -->
			<div class="flex flex-wrap items-center gap-2">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onclick={openResume}
					ariaLabel="Open resume library"
				>
					Resumes
				</Button>
				<a
					href={resolvePath('/dashboard/export.csv')}
					download
					class="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-fg transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
				>
					Export CSV
				</a>
				<a
					href={resolvePath('/admin/approvals')}
					class="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-fg transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
				>
					Admin queue
				</a>
				{#if !data.trashView && hasApplications}
					<Button variant="primary" size="sm" onclick={openNewApp} ariaLabel="Add new application">
						+ Add application
					</Button>
				{/if}
			</div>
		</div>

		{#if !data.trashView && hasApplications}
			<div class="mt-4">
				<FilterBar bind:filters bind:sort {hasApplications} tagFacets={data.tagFacets} />
			</div>
		{/if}

		<div class="mt-4">
			{#if !data.trashView && !hasApplications}
				<EmptyState
					title="Add your first application"
					description="Track job applications, contacts, interviews, and notes. Private to your account."
				>
					{#snippet action()}
						<Button variant="primary" onclick={openNewApp} ariaLabel="Add new application">
							+ Add application
						</Button>
					{/snippet}
				</EmptyState>
			{:else if data.trashView && !hasTrashedApps}
				<EmptyState
					title="Trash is empty"
					description="Soft-deleted applications will appear here so you can restore or permanently delete them."
				>
					{#snippet action()}
						<a
							href={resolvePath('/dashboard')}
							class="rounded-md border border-border bg-surface px-4 py-2 text-sm text-fg transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
						>
							Back to active
						</a>
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

		{#if (hasApplications || hasTrashedApps) && !data.trashView}
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

	<footer class="mt-12 border-t border-border pt-4 text-xs text-muted">
		<p>Sharing + R2 resume upload land in the backend round (D).</p>
	</footer>
</div>
<!--
	Modals. Each is mounted unconditionally; their open state is derived
	from the URL query (?app / ?new / ?resume). Closing a modal flips the
	bound `open` and an effect strips that query param, so the URL remains
	the single source of truth (refresh-safe, shareable).
-->
<ApplicationDetailModal detail={data.activeDetail} />
<ResumeLibraryModal applications={data.applications} />
<Modal
	bind:open={isNewAppOpen}
	title="Add application"
	subtitle="Track a new job application."
	size="lg"
>
	<ApplicationForm create />
</Modal>
