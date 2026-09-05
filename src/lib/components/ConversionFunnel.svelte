<script lang="ts">
	import { STAGES } from '$lib/constants/stages';
	import type { Application } from '$lib/types';

	interface Props {
		apps: readonly Application[];
	}

	let { apps }: Props = $props();

	// Conversion funnel: for each stage, how many applications are at or
	// past that stage right now. The "applied" count is the largest (every
	// app that ever applied); successive stages are smaller because
	// rejected/withdrawn apps don't appear at the open stages past where
	// they exited.
	//
	// Note: this is a *current-state* funnel, not a historical one. Apps
	// that were rejected at the onsite stage count toward "applied",
	// "phone_screen", "technical", and "onsite" but not toward "final",
	// "offer", or "accepted". This is the right read for a personal
	// tracker where rejection-history detail isn't yet modeled.
	const STAGE_INDEX: Record<string, number> = STAGES.reduce(
		(acc, s, i) => {
			acc[s.value] = i;
			return acc;
		},
		{} as Record<string, number>
	);

	// Static class maps. Literals must appear in source verbatim — the v4
	// scanner can't see interpolated class names.
	const STAGE_BG: Record<string, string> = {
		'stage-saved': 'bg-stage-saved-100',
		'stage-applied': 'bg-stage-applied-100',
		'stage-progress': 'bg-stage-progress-100',
		'stage-late': 'bg-stage-late-100',
		'stage-offer': 'bg-stage-offer-100',
		'stage-terminal': 'bg-stage-terminal-100',
		'stage-closed': 'bg-stage-closed-100'
	};
	const STAGE_TEXT: Record<string, string> = {
		'stage-saved': 'text-stage-saved-700',
		'stage-applied': 'text-stage-applied-700',
		'stage-progress': 'text-stage-progress-700',
		'stage-late': 'text-stage-late-700',
		'stage-offer': 'text-stage-offer-700',
		'stage-terminal': 'text-stage-terminal-700',
		'stage-closed': 'text-stage-closed-700'
	};

	type FunnelRow = {
		stage: (typeof STAGES)[number];
		count: number;
		pct: number;
		prevCount: number; // count at the previous open stage (0 for the first row)
	};

	const funnel: FunnelRow[] = $derived.by(() => {
		// Count apps whose current stage is at or past this index.
		// "saved" doesn't count toward any open funnel stage.
		const rows: FunnelRow[] = [];
		const openStages = STAGES.filter((s) => s.value !== 'saved');

		const total = apps.filter((a) => a.stage !== 'saved').length;

		for (const stage of openStages) {
			const stageIdx = STAGE_INDEX[stage.value] ?? 0;
			const count = apps.filter((a) => {
				const aIdx = STAGE_INDEX[a.stage] ?? -1;
				// Closed stages: only `accepted` counts toward later stages.
				// We treat rejected/withdrawn as having reached at least
				// `applied` (they definitely applied) but no later stage.
				if (a.stage === 'rejected' || a.stage === 'withdrawn') {
					return stage.value === 'applied';
				}
				return aIdx >= stageIdx;
			}).length;
			// prevCount is the count of the previous row, or 0 for the first
			// row. We hoist it out of the template so the conversion math
			// doesn't fight `noUncheckedIndexedAccess` (funnel[i-1] would
			// otherwise be `FunnelRow | undefined` inside the each block).
			const prevCount = rows.length === 0 ? 0 : (rows[rows.length - 1]?.count ?? 0);
			rows.push({
				stage,
				count,
				pct: total === 0 ? 0 : (count / total) * 100,
				prevCount
			});
		}
		return rows;
	});

	const totalApplications = $derived(apps.filter((a) => a.stage !== 'saved').length);
	const hasData = $derived(totalApplications > 0);

	// The widest bar is the first stage (everyone who applied). All others
	// are scaled relative to it so the funnel visually narrows.
	const maxCount = $derived(Math.max(1, funnel[0]?.count ?? 1));
</script>

{#if !hasData}
	<div
		class="rounded-lg border border-border bg-surface px-4 py-6 sm:px-5"
		aria-label="No funnel data"
	>
		<h3 class="font-mono text-[11px] tracking-widest text-muted uppercase">Funnel</h3>
		<p class="mt-4 text-center text-sm text-muted">No applications yet.</p>
	</div>
{:else}
	<div
		class="rounded-lg border border-border bg-surface px-4 py-5 sm:px-5"
		aria-label="Stage conversion funnel"
	>
		<header class="mb-3 flex items-baseline justify-between gap-2">
			<h3 class="font-mono text-[11px] tracking-widest text-muted uppercase">Funnel</h3>
			<p class="font-mono text-[11px] text-muted">
				{totalApplications}
				{totalApplications === 1 ? 'application' : 'applications'} tracked
			</p>
		</header>

		<!--
			Each stage is a horizontal bar. Width is pct-of-max (so the
			first bar is the widest and the rest narrow visually). The bar's
			color is its stage color. The label + count sits inside the bar
			when there's room; outside when the bar is too thin.
		-->
		<ol class="space-y-1.5">
			{#each funnel as item (item.stage.value)}
				{@const isFirst = item.prevCount === 0}
				{@const conv = isFirst
					? null
					: item.prevCount === 0
						? 0
						: (item.count / item.prevCount) * 100}
				{@const convLabel = conv === null ? '' : `${conv.toFixed(0)}% of prev`}
				<!-- Color the conversion so a sharp drop reads at a glance:
					healthy → green, some loss → amber, big drop → red. -->
				{@const convClass = (() => {
					if (conv === null) return '';
					if (conv >= 80) return 'text-success';
					if (conv >= 40) return 'text-status-stalled-700';
					return 'text-danger';
				})()}
				{@const convTooltip = isFirst
					? `${item.stage.label}: reached by ${item.count} of ${totalApplications} tracked applications, so ${item.pct.toFixed(0)}%.`
					: `${item.stage.label}: ${item.count} of the ${item.prevCount} applications that reached the previous stage progressed to at least this stage (${(conv ?? 0).toFixed(0)}%). This is ${item.pct.toFixed(0)}% of all tracked applications.`}
				<li class="flex items-center gap-3" title={convTooltip} aria-label={convTooltip}>
					<!-- Stage label column: fixed width so bars align. -->
					<span class="w-32 shrink-0 text-right font-mono text-[11px] text-muted uppercase">
						{item.stage.label}
					</span>

					<!--
						Bar track + fill. Track is the full row width; fill is
						width = pct-of-max. The fill uses the stage's color token.
					-->
					<div class="relative h-6 flex-1 overflow-hidden rounded-sm bg-surface-2">
						<div
							class="absolute inset-y-0 left-0 rounded-sm {STAGE_BG[item.stage.colorToken] ??
								'bg-surface-2'}"
							style:width="{((item.count / maxCount) * 100).toFixed(1)}%"
						></div>
						<div
							class="absolute inset-y-0 left-0 flex items-center gap-2 px-2"
							style:width="{((item.count / maxCount) * 100).toFixed(1)}%"
						>
							<span
								class="truncate font-mono text-xs font-semibold tabular-nums {STAGE_TEXT[
									item.stage.colorToken
								] ?? 'text-fg'}"
							>
								{item.count}
							</span>
						</div>
					</div>

					<!--
						Readout: share of ALL tracked apps (pct) plus the
						conversion from the previous stage, so the drop at each
						gate is visible. The first row has no previous stage.
						Hover/title explains each number in plain words.
					-->
					<span
						class="hidden w-40 shrink-0 text-right font-mono text-[11px] tabular-nums sm:inline"
						title={convTooltip}
					>
						<span class="text-fg">{item.pct.toFixed(0)}%</span>
						{#if conv !== null}
							<span class="ml-1 {convClass}">{convLabel}</span>
						{/if}
					</span>
				</li>
			{/each}
		</ol>

		<p class="mt-3 text-xs text-muted">
			% is the share of all tracked applications that reached at least this stage.
			<span class="font-medium text-fg/70"> % of prev </span>
			is the conversion from the previous stage. Rejected or withdrawn applications count only toward
			"applied".
		</p>
	</div>
{/if}
