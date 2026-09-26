<script lang="ts">
	import { STAGES } from '$lib/constants/stages';
	import type { Application, ApplicationStage } from '$lib/types';

	interface Props {
		apps: readonly Application[];
	}

	let { apps }: Props = $props();

	/**
	 * Conversion funnel: for each rung, how many applications are at or past
	 * that stage *right now*.
	 *
	 * Two kinds of stage deliberately do not appear as rungs:
	 *
	 * - `saved` has not entered the pipeline yet. Counting it as the first
	 *   rung would make "Applied" a smaller number than the total, which
	 *   inverts the shape of a funnel.
	 * - `rejected` and `withdrawn` are exits, not rungs. This is a
	 *   *current-state* funnel, and the model does not record where a
	 *   rejection happened — an application sitting at `rejected` may have
	 *   died at the phone screen or at the final round, and nothing here
	 *   can tell the difference. Putting them in the chain therefore made
	 *   both bars permanently zero (every rejected app short-circuits
	 *   before the "at or past" test), which read as "0% of the
	 *   applications that reached Offer got to Rejected" — a sentence
	 *   about nothing. They are reported as exact counts underneath
	 *   instead, where "how many am I sitting on right now" is the
	 *   question actually being answered.
	 *
	 * Rejected/withdrawn rows do count toward `applied`: they definitely
	 * applied. They are simply never assumed to have gone further.
	 */
	const STAGE_INDEX: Record<string, number> = STAGES.reduce(
		(acc, s, i) => {
			acc[s.value] = i;
			return acc;
		},
		{} as Record<string, number>
	);

	const EXIT_STAGES: readonly ApplicationStage[] = ['rejected', 'withdrawn'];
	const isExit = (stage: ApplicationStage) => EXIT_STAGES.includes(stage);

	/** The rungs, in pipeline order. `saved` and the two exits are excluded. */
	const RUNGS = STAGES.filter((s) => s.value !== 'saved' && !isExit(s.value));

	// Static class maps. Literals must appear in source verbatim — the v4
	// scanner can't see interpolated class names.
	const STAGE_BG: Record<string, string> = {
		'stage-saved': 'bg-stage-saved-100',
		'stage-applied': 'bg-stage-applied-100',
		'stage-progress': 'bg-stage-progress-100',
		'stage-late': 'bg-stage-late-100',
		'stage-offer': 'bg-stage-offer-100',
		'stage-closed': 'bg-stage-closed-100'
	};
	const STAGE_TEXT: Record<string, string> = {
		'stage-saved': 'text-stage-saved-700',
		'stage-applied': 'text-stage-applied-700',
		'stage-progress': 'text-stage-progress-700',
		'stage-late': 'text-stage-late-700',
		'stage-offer': 'text-stage-offer-700',
		'stage-closed': 'text-stage-closed-700'
	};

	/** Stages that never entered the pipeline. Counted, never a rung. */
	const savedCount = $derived(apps.filter((a) => a.stage === 'saved').length);

	/** Applications currently sitting at each exit stage, exactly. */
	const exits = $derived(
		STAGES.filter((s) => isExit(s.value)).map((stage) => ({
			stage,
			count: apps.filter((a) => a.stage === stage.value).length
		}))
	);

	type FunnelRow = {
		stage: (typeof STAGES)[number];
		count: number;
		pct: number;
		prevCount: number; // count at the previous rung (0 for the first row)
	};

	const funnel: FunnelRow[] = $derived.by(() => {
		const rows: FunnelRow[] = [];
		// Denominator: everything that has actually been applied for.
		const total = apps.filter((a) => a.stage !== 'saved').length;

		for (const stage of RUNGS) {
			const stageIdx = STAGE_INDEX[stage.value] ?? 0;
			const count = apps.filter((a) => {
				// An exit counts toward `applied` and nothing further: we
				// know it applied, we do not know how far it got.
				if (isExit(a.stage)) return stage.value === 'applied';
				return (STAGE_INDEX[a.stage] ?? -1) >= stageIdx;
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

	// The widest bar is the first rung (everyone who applied). All others
	// are scaled relative to it so the funnel visually narrows.
	const maxCount = $derived(Math.max(1, funnel[0]?.count ?? 1));
</script>

{#if !hasData}
	<div class="rounded-lg border border-border bg-surface px-4 py-6 sm:px-5">
		<h3 class="font-mono text-[11px] tracking-widest text-muted uppercase">Funnel</h3>
		<p class="mt-4 text-center text-sm text-muted">No applications yet.</p>
	</div>
{:else}
	<div class="rounded-lg border border-border bg-surface px-4 py-5 sm:px-5">
		<header class="mb-3 flex items-baseline justify-between gap-2">
			<h3 class="font-mono text-[11px] tracking-widest text-muted uppercase">Funnel</h3>
			<p class="font-mono text-[11px] text-muted">
				{totalApplications}
				{totalApplications === 1 ? 'application' : 'applications'} tracked
			</p>
		</header>

		<!--
			Each rung is a horizontal bar. Width is pct-of-max (so the first
			bar is the widest and the rest narrow visually). The bar's color
			is its stage color. The label + count sits inside the bar when
			there's room; outside when the bar is too thin.
		-->
		<ol class="space-y-1.5">
			{#each funnel as item (item.stage.value)}
				{@const isFirst = item.prevCount === 0}
				{@const conv = isFirst ? null : (item.count / item.prevCount) * 100}
				{@const convPct = conv ?? 0}
				{@const convLabel = conv === null ? '' : `${convPct.toFixed(0)}% of prev`}
				<!-- Color the conversion so a sharp drop reads at a glance:
					healthy → green, some loss → amber, big drop → red. -->
				{@const convClass = (() => {
					if (conv === null) return '';
					if (convPct >= 80) return 'text-success';
					if (convPct >= 40) return 'text-status-stalled-700';
					return 'text-danger';
				})()}
				{@const convTooltip = isFirst
					? `${item.stage.label}: reached by ${item.count} of ${totalApplications} tracked applications, so ${item.pct.toFixed(0)}%.`
					: `${item.stage.label}: ${item.count} of the ${item.prevCount} applications that reached the previous stage progressed to at least this stage (${convPct.toFixed(0)}%). This is ${item.pct.toFixed(0)}% of all tracked applications.`}
				<li class="flex items-center gap-3" title={convTooltip}>
					<!-- Stage label column: fixed width so bars align.
						Fixed width so bars align; narrower on phones so the
						bar keeps usable width at 320px. -->
					<span class="w-24 shrink-0 text-right font-mono text-[11px] text-muted uppercase sm:w-32">
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

		<!--
			Exits and pre-pipeline work, as exact counts. Deliberately not
			rungs and deliberately without a "% of prev": these are not
			ordered gates, so a conversion rate between them would be
			meaningless. See the note at the top of this file.
		-->
		<div
			class="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-3 font-mono text-[11px] text-muted"
		>
			{#if savedCount > 0}
				<span title="Saved but not yet applied for.">
					{savedCount} saved
				</span>
			{/if}
			{#each exits as exit (exit.stage.value)}
				{#if exit.count > 0}
					<span
						title="{exit.count} application{exit.count === 1
							? ''
							: 's'} currently at {exit.stage.label.toLowerCase()}."
					>
						{exit.count}
						{exit.stage.label.toLowerCase()}
					</span>
				{/if}
			{/each}
		</div>

		<p class="mt-3 text-xs text-muted">
			% is the share of all tracked applications that reached at least this stage.
			<span class="font-medium text-fg/70"> % of prev </span>
			is the conversion from the previous stage. Rejected and withdrawn applications count only toward
			"applied": the tracker does not record which stage they exited from.
		</p>
	</div>
{/if}
