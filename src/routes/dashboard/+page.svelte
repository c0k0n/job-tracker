<script lang="ts">
	import { goto, replaceState } from '$app/navigation';
	import { resolve as resolvePath } from '$app/paths';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { page as pageStore } from '$app/state';
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import type { PageData } from './$types';
	import type { Application, ApplicationFilters, ApplicationSort, KpiCounts } from '$lib/types';
	import {
		applyFilters,
		applySort,
		hasActiveFilters,
		serializeFiltersToUrl
	} from '$lib/utils/sortFilter';
	import StatCard from '$lib/components/StatCard.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import ApplicationsTable from '$lib/components/ApplicationsTable.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Button from '$lib/components/Button.svelte';
	import StageDwellChart from '$lib/components/StageDwellChart.svelte';
	import VelocityChart from '$lib/components/VelocityChart.svelte';
	import ConversionFunnel from '$lib/components/ConversionFunnel.svelte';
	import ApplicationDetailModal from '$lib/components/ApplicationDetailModal.svelte';
	import ResumeLibraryModal from '$lib/components/ResumeLibraryModal.svelte';
	import ApplicationForm from '$lib/components/ApplicationForm.svelte';
	import Modal from '$lib/components/Modal.svelte';

	let { data }: { data: PageData } = $props();

	// Local copies of filters/sort that drive the URL on every change.
	// The URL stays the source of truth (refresh-safe, shareable) but
	// updates go through shallow routing — see the sync effects below.
	let filters: ApplicationFilters = $state({
		q: '',
		stages: [],
		statuses: [],
		arrangements: [],
		tags: []
	});
	let sort: ApplicationSort = $state({ key: 'stageChangedAt', dir: 'desc' });

	// Apply URL changes → local state. URL wins on hard load/SSR so a
	// shared URL renders the same view for everyone; the one-directional
	// sync below then keeps local state as the user interacts.
	$effect(() => {
		filters = data.filters;
		sort = data.sort;
	});

	// Derived data: filter → sort → render. Pure, no side effects.
	const visibleRows: Application[] = $derived(
		applySort(applyFilters(data.applications, filters), sort)
	);

	const kpis: KpiCounts = $derived(data.kpis);
	const hasApplications = $derived(data.applications.length > 0 && !data.trashView);
	const hasTrashedApps = $derived(data.trashView && data.applications.length > 0);
	const hasVisibleRows = $derived(visibleRows.length > 0);
	const hasActive = $derived(hasActiveFilters(filters));

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

	// Server-side validation results from the create/edit actions surface
	// here via `pageStore.form` (progressive enhancement keeps the modal open
	// so the user can fix the highlighted fields). Only failure payloads are
	// forwarded — successes carry no `errors` and the modal is closed by the
	// form's onsuccess callback, so forwarding one would re-open a busy form.
	const formResult = $derived(pageStore.form);
	const newAppForm = $derived(
		formResult && formResult.operation === 'create' && formResult.errors
			? formResult
			: { values: undefined, errors: undefined, operation: undefined }
	);

	// ---- Modal state: local truth, one URL/page.state sync effect ----
	// SvelteKit's replaceState/pushState update `page.state` but NEVER
	// `page.url` (verified against the installed @sveltejs/kit source).
	// So modal open/close can't be derived from page.url.searchParams —
	// that was the "button does nothing" bug. Instead: local $state is
	// the UI truth; ONE effect shallow-routes the full query string +
	// typed page.state from it (no worker invocation); real navigations
	// (goto/back/forward) hydrate the local state from page.url.

	// Detail modal: opens via goto(?app=) so the server load fetches the
	// bundle; SSR initial value comes from the load's activeDetail
	// (initial-only by design — live updates flow through the hydrate
	// effect below).
	let detailId = $state<string | null>(untrack(() => data.activeDetail?.application.id ?? null));
	let detailOpen = $state(untrack(() => data.activeDetail !== null));

	// New-application + resume-library modals: pure client state; hard
	// loading a ?new=1 / ?resume=1 URL (refresh/share) opens them too.
	// untrack keeps the read initial-only (hydration); live updates flow
	// through the hydrate effect below.
	let newAppOpen = $state(untrack(() => pageStore.url.searchParams.get('new') === '1'));
	let resumeOpen = $state(untrack(() => pageStore.url.searchParams.get('resume') === '1'));

	// Real navigations (goto, back/forward) → local state. page.url only
	// changes on real navigations, so this hydrates; it never fights the
	// local truth between navigations.
	$effect(() => {
		detailId = pageStore.url.searchParams.get('app');
		detailOpen = !!pageStore.url.searchParams.get('app');
	});

	function onRowClick(app: Application) {
		// goto (real navigation): the detail bundle must be fetched by the
		// server load (?app=), and page.url updates — which the hydrate
		// effect above turns into detailOpen = true.
		const sp = new SvelteURLSearchParams(pageStore.url.searchParams);
		sp.set('app', app.id);
		void goto(resolvePath(`/dashboard?${sp.toString()}`), {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}

	// Modal open helpers — flip local state; the URL-sync effect below
	// shallow-routes the query string (no worker invocation).
	function openNewApp() {
		newAppOpen = true;
	}
	function openResume() {
		resumeOpen = true;
	}

	// Trash view: two-click "empty trash" confirm. Local only — one armed
	// state for the whole header, mirroring the row-level pattern.
	let confirmEmptyTrash = $state(false);

	// Trash view toggle: a real navigation (different row set from the
	const trashHref = $derived(resolvePath(data.trashView ? '/dashboard' : '/dashboard?trash=1'));
	const trashLabel = $derived(data.trashView ? 'Active' : 'Trash');

	// Any modal open → background must be inert so screen readers and the
	// Tab key can't reach behind the dialog.
	const anyModalOpen = $derived(detailOpen || newAppOpen || resumeOpen);

	// `username` is nullable (rows created before the username plugin, or
	// accounts where it was never set), so fall back through name → email →
	// a neutral greeting rather than rendering "Welcome back, .".
	const greeting = $derived(data.user.username ?? data.user.name ?? data.user.email ?? 'there');

	// THE single URL writer: local truth → query string + typed page.state
	// via shallow routing. The guard compares against window.location (the
	// NATIVE url) — pageStore.url is frozen between real navigations
	// (replaceState doesn't update it), so comparing against it would
	// silently skip legit writes like stripping ?new= on close.
	$effect(() => {
		const sp = serializeFiltersToUrl(filters, sort);
		if (data.trashView) sp.set('trash', '1');
		if (detailOpen && detailId) sp.set('app', detailId);
		if (newAppOpen) sp.set('new', '1');
		if (resumeOpen) sp.set('resume', '1');
		const qs = sp.toString();
		const target = resolvePath(qs ? `/dashboard?${qs}` : '/dashboard');
		if (
			typeof window !== 'undefined' &&
			target !== window.location.pathname + window.location.search
		) {
			replaceState(target, {
				detailId: detailOpen ? (detailId ?? undefined) : undefined,
				newApp: newAppOpen || undefined,
				resumeLibrary: resumeOpen || undefined
			});
		}
	});
</script>

<svelte:head>
	<title>{data.trashView ? 'Trash' : 'Dashboard'} · Job Tracker</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div
	inert={anyModalOpen}
	aria-hidden={anyModalOpen}
	class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:py-10"
>
	<!-- Header -->
	<header class="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
		<div>
			<p class="font-mono text-[11px] tracking-widest text-muted uppercase">Job Tracker</p>
			<h1 class="mt-1 text-2xl font-semibold tracking-tight text-balance text-fg sm:text-3xl">
				{data.trashView ? 'Trash' : 'Dashboard'}
			</h1>
			<p class="mt-1 text-sm text-pretty text-muted">
				Welcome back, {greeting}.
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
				<ConversionFunnel apps={data.applications} />
			</div>
		</section>

		{#if hasApplications}
			<section class="mt-6 sm:mt-8" aria-labelledby="insights-heading">
				<h2 id="insights-heading" class="text-sm font-medium text-fg">Insights</h2>
				<div class="mt-3 grid gap-3 sm:gap-4 lg:grid-cols-2">
					<VelocityChart apps={data.applications} stageMoves={data.stageMoves} />
					<StageDwellChart apps={data.applications} />
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
					title="Browse, preview, and upload your saved resumes"
				>
					Resumes
				</Button>
				<a
					href={resolvePath('/dashboard/export.csv')}
					download
					title="Download all your applications as a spreadsheet"
					class="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-fg transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
				>
					Export CSV
				</a>
				{#if data.isAdmin}
					<a
						href={resolvePath('/admin/approvals')}
						title="Approve or reject new sign-ups"
						class="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-fg transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
					>
						Admin queue
					</a>
				{/if}
				{#if data.trashView && data.applications.length > 0}
					{#if confirmEmptyTrash}
						<form method="POST" action="?/emptyTrash" use:enhance class="contents">
							<Button
								type="submit"
								variant="danger"
								size="sm"
								ariaLabel="Confirm empty trash"
								title="Permanently delete every application in the trash"
							>
								Delete all {data.applications.length} for good
							</Button>
						</form>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onclick={() => (confirmEmptyTrash = false)}
							ariaLabel="Cancel empty trash"
						>
							Cancel
						</Button>
					{:else}
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onclick={() => (confirmEmptyTrash = true)}
							ariaLabel="Empty trash"
							title="Permanently delete everything in the trash at once"
						>
							Empty trash
						</Button>
					{/if}
				{/if}
				{#if !data.trashView && hasApplications}
					<Button
						variant="primary"
						size="sm"
						onclick={openNewApp}
						ariaLabel="Add new application"
						title="Track a new job application"
					>
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
					description={hasActive
						? 'Try clearing one of the filters or the search box.'
						: 'Adjust the search to see results.'}
				/>
			{:else}
				<ApplicationsTable
					rows={visibleRows}
					trashView={data.trashView}
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
			</p>
		{/if}
	</section>

	<footer class="mt-12 border-t border-border pt-4 text-xs text-muted">
		<p>Private job tracker. Your data stays in your account only.</p>
	</footer>
</div>
<!--
	Modals. All open state is local $state above (single URL-sync effect
	keeps the query string + page.state shallow-routed without worker
	invocations). Detail opens via goto so the server load fetches its
	bundle; resume/new are pure client state.
-->
<ApplicationDetailModal detail={data.activeDetail} form={pageStore.form} bind:open={detailOpen} />
<ResumeLibraryModal applications={data.applications} bind:open={resumeOpen} />
<Modal
	bind:open={newAppOpen}
	title="Add application"
	subtitle="Track a new job application."
	size="lg"
>
	<ApplicationForm create result={newAppForm} onsuccess={() => (newAppOpen = false)} />
</Modal>
