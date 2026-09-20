<!--
	AgendaPanel — "what do I actually do next?"

	The other three charts on the dashboard are all retrospective: they
	describe where applications sit (funnel), how long they have sat there
	(dwell), and how busy the last 90 days were (velocity). Useful, but
	nothing on the page answers the question a job seeker opens the app
	with. This panel answers it, by merging the two dated commitments the
	data model already tracks — scheduled interviews and each
	application's `nextActionAt` follow-up date — into one chronologically
	sorted list.

	Deliberately not a chart. A bar or pie adds nothing here; the value is
	the ordering and the ability to tap straight through to the record.
-->
<script lang="ts">
	import { SvelteDate } from 'svelte/reactivity';
	import type { Application, Interview } from '$lib/types';
	import { formatDateShort, formatRelative } from '$lib/utils/dates';

	interface Props {
		/** Active applications. Provides company/role and `nextActionAt`. */
		apps: readonly Application[];
		/** Pending interviews already fetched by the dashboard rollup. */
		interviews: readonly Interview[];
		/** Open the detail modal for an application (parent owns routing). */
		onSelect: (applicationId: string) => void;
		/** How many rows to show. Overdue rows are never truncated away. */
		limit?: number;
	}

	let { apps, interviews, onSelect, limit = 6 }: Props = $props();

	const KIND_LABEL: Record<Interview['kind'], string> = {
		phone_screen: 'Phone screen',
		technical: 'Technical',
		onsite: 'Onsite',
		final: 'Final',
		coffee_chat: 'Coffee chat',
		other: 'Interview'
	};

	type Item = {
		key: string;
		applicationId: string;
		company: string;
		role: string;
		at: number;
		iso: string;
		label: string;
		kind: 'interview' | 'followup';
	};

	const appById = $derived(new Map(apps.map((a) => [a.id, a])));

	// Midnight this morning. Computed once rather than per-row so a row
	// can't flip between "overdue" and "upcoming" mid-render, and so the
	// classification doesn't depend on the current time-of-day.
	const DAY_START = (() => {
		const d = new SvelteDate();
		d.setHours(0, 0, 0, 0);
		return d.getTime();
	})();

	const items: Item[] = $derived.by(() => {
		const out: Item[] = [];

		for (const iv of interviews) {
			// Cancelled / decided interviews aren't commitments any more.
			if (iv.outcome !== null && iv.outcome !== 'pending') continue;
			const app = appById.get(iv.applicationId);
			if (!app) continue;
			const at = new Date(iv.scheduledAt).getTime();
			if (!Number.isFinite(at)) continue;
			out.push({
				key: `iv-${iv.id}`,
				applicationId: app.id,
				company: app.company,
				role: app.role,
				at,
				iso: iv.scheduledAt,
				label: `${KIND_LABEL[iv.kind]}${iv.withName ? ` with ${iv.withName}` : ''}`,
				kind: 'interview'
			});
		}

		for (const app of apps) {
			if (!app.nextActionAt) continue;
			const at = new Date(app.nextActionAt).getTime();
			if (!Number.isFinite(at)) continue;
			out.push({
				key: `na-${app.id}`,
				applicationId: app.id,
				company: app.company,
				role: app.role,
				at,
				iso: app.nextActionAt,
				label: 'Follow up',
				kind: 'followup'
			});
		}

		return out.sort((a, b) => a.at - b.at);
	});

	const overdue = $derived(items.filter((i) => i.at < DAY_START));
	const upcoming = $derived(items.filter((i) => i.at >= DAY_START));
	// Overdue rows always survive the cap — they are the reason the panel
	// exists. Only the future tail gets truncated.
	const shown = $derived([...overdue, ...upcoming].slice(0, Math.max(limit, overdue.length)));
	const hiddenCount = $derived(items.length - shown.length);
</script>

<div class="rounded-lg border border-border bg-surface px-4 py-5 sm:px-5">
	<header class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
		<h3 class="font-mono text-[11px] tracking-widest text-muted uppercase">
			Interviews &amp; follow-ups
		</h3>
		<p class="font-mono text-[11px] text-muted">
			{items.length}
			{items.length === 1 ? 'item' : 'items'}{overdue.length > 0
				? ` · ${overdue.length} overdue`
				: ''}
		</p>
	</header>

	{#if shown.length === 0}
		<p class="text-sm text-muted">
			Nothing scheduled. Set a next-action date on an application and it appears here.
		</p>
	{:else}
		<ol class="space-y-0.5">
			{#each shown as item (item.key)}
				{@const late = item.at < DAY_START}
				<li>
					<button
						type="button"
						onclick={() => onSelect(item.applicationId)}
						aria-label="{item.label}, {item.company}, {item.role}, {formatRelative(item.iso)}"
						title={formatDateShort(item.iso)}
						class="flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
					>
						<!--
							Date column. Fixed width so the company names line
							up down the list — the eye reads the column, not
							the individual cell.
						-->
						<span
							class="w-16 shrink-0 font-mono text-[11px] tabular-nums sm:w-20 {late
								? 'text-danger'
								: 'text-muted'}"
						>
							{formatRelative(item.iso)}
						</span>

						<span class="min-w-0 flex-1 truncate text-sm text-fg">
							{item.company}
							<span class="text-muted"> · {item.role}</span>
						</span>

						<span
							class="hidden shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] tracking-wide sm:inline {item.kind ===
							'interview'
								? 'bg-status-active-100 text-status-active-700'
								: 'bg-surface-2 text-muted'}"
						>
							{item.label}
						</span>
					</button>
				</li>
			{/each}
		</ol>

		{#if hiddenCount > 0}
			<p class="mt-2 text-xs text-muted">
				+{hiddenCount} more scheduled. Open an application to reschedule or clear its date.
			</p>
		{/if}
	{/if}
</div>
