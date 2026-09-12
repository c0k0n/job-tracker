<script lang="ts">
	import { SvelteDate } from 'svelte/reactivity';
	import type { Application } from '$lib/types';

	interface Props {
		apps: readonly Application[];
		/** Server-computed stage-change timestamps (ISO), for the
		 * transitions line. Falls back to stageChangedAt-only when absent. */
		stageMoves?: readonly { occurredAt: string }[];
		/** Window in days. 90 is a good balance — long enough to show
		 * trends, short enough to render at a sensible resolution. */
		windowDays?: number;
	}

	let { apps, stageMoves = [], windowDays = 90 }: Props = $props();

	type DayPoint = {
		date: Date;
		applied: number;
		transitions: number;
		label: string; // "May 12" — for x-axis
	};

	// Build the day series, oldest first. We initialize all days to zero
	// so the line is smooth even on days with no activity.
	const series: DayPoint[] = $derived.by(() => {
		const days: DayPoint[] = [];
		const today = new SvelteDate();
		today.setHours(0, 0, 0, 0);
		for (let i = windowDays - 1; i >= 0; i--) {
			const d = new SvelteDate(today);
			d.setDate(today.getDate() - i);
			days.push({
				date: d,
				applied: 0,
				transitions: 0,
				label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
			});
		}
		for (const a of apps) {
			// "applied" event on appliedAt
			if (a.appliedAt) {
				const d = new SvelteDate(a.appliedAt);
				d.setHours(0, 0, 0, 0);
				const ms = today.getTime() - d.getTime();
				const dayIdx = windowDays - 1 - Math.floor(ms / (24 * 60 * 60 * 1000));
				if (dayIdx >= 0 && dayIdx < days.length) {
					const point = days[dayIdx];
					if (point) point.applied += 1;
				}
			}
		}
		// "transition" events come from the activity timeline (server-passed
		// stageMoves), so multi-step progressions count every move, not just
		// the latest stage entry.
		for (const move of stageMoves) {
			const scd = new SvelteDate(move.occurredAt);
			scd.setHours(0, 0, 0, 0);
			const dayIdx = windowDays - 1 - Math.floor((today.getTime() - scd.getTime()) / 86400000);
			if (dayIdx >= 0 && dayIdx < days.length) {
				const point = days[dayIdx];
				if (point) point.transitions += 1;
			}
		}
		return days;
	});

	const totalApplied = $derived(series.reduce((s, p) => s + p.applied, 0));
	const totalTransitions = $derived(series.reduce((s, p) => s + p.transitions, 0));
	const peakApplied = $derived(Math.max(1, ...series.map((p) => p.applied)));
	const peakTransitions = $derived(Math.max(1, ...series.map((p) => p.transitions)));
	const hasData = $derived(totalApplied > 0 || totalTransitions > 0);

	// SVG geometry.
	const W = 800;
	const H = 180;
	const PAD_X = 0;
	const PAD_Y = 12;

	const peak = $derived(Math.max(peakApplied, peakTransitions));

	function xFor(i: number): number {
		if (series.length <= 1) return PAD_X;
		return PAD_X + (i / (series.length - 1)) * (W - PAD_X);
	}

	function yFor(value: number, max: number): number {
		if (max === 0) return H - PAD_Y;
		return H - PAD_Y - (value / max) * (H - 2 * PAD_Y);
	}

	const appliedPath = $derived(
		series
			.map(
				(p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(p.applied, peak).toFixed(1)}`
			)
			.join(' ')
	);
	const transitionsPath = $derived(
		series
			.map(
				(p, i) =>
					`${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(p.transitions, peak).toFixed(1)}`
			)
			.join(' ')
	);

	// Sparse x-axis labels: only show ~6 dates evenly across the window.
	const labelIndices = $derived.by(() => {
		const n = series.length;
		if (n === 0) return [];
		const out: number[] = [];
		const step = Math.max(1, Math.floor(n / 6));
		for (let i = 0; i < n; i += step) out.push(i);
		if (out[out.length - 1] !== n - 1) out.push(n - 1);
		return out;
	});

	// Human-readable date for tooltips, e.g. "Tue, May 12".
	const DATE_LABEL = new Intl.DateTimeFormat('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric'
	});

	function dayTooltip(p: DayPoint): string {
		const parts = [DATE_LABEL.format(p.date)];
		if (p.applied > 0) parts.push(`${p.applied} applied`);
		if (p.transitions > 0)
			parts.push(`${p.transitions} stage move${p.transitions === 1 ? '' : 's'}`);
		if (p.applied === 0 && p.transitions === 0) parts.push('no activity');
		return parts.join(' · ');
	}
</script>

{#if !hasData}
	<!--
		Empty state. The line shape would be flat at zero; we skip the SVG
		entirely and show a quiet prompt. (An aria-label on a plain div is
		ignored by AT — the sr-only heading below carries the semantics.)
	-->
	<div class="rounded-lg border border-border bg-surface px-4 py-6 sm:px-5">
		<header class="mb-3 flex items-baseline justify-between gap-2">
			<h3 class="font-mono text-[11px] tracking-widest text-muted uppercase">
				Activity · last {windowDays} days
			</h3>
			<p class="font-mono text-[11px] text-muted">0 events</p>
		</header>
		<p class="text-center text-sm text-muted">No activity yet.</p>
	</div>
{:else}
	<div class="rounded-lg border border-border bg-surface px-4 py-5 sm:px-5">
		<header class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
			<h3 class="font-mono text-[11px] tracking-widest text-muted uppercase">
				Activity · last {windowDays} days
			</h3>
			<div class="flex items-center gap-4 text-xs">
				<span class="flex items-center gap-1.5">
					<span aria-hidden="true" class="inline-block size-2 rounded-full bg-accent"></span>
					<span class="text-muted">Applied · {totalApplied}</span>
				</span>
				<span class="flex items-center gap-1.5">
					<span aria-hidden="true" class="inline-block size-2 rounded-full bg-status-stalled-700"
					></span>
					<span class="text-muted">Stage moves · {totalTransitions}</span>
				</span>
			</div>
		</header>

		<!--
			Inline SVG. ViewBox scales the chart to the container width so it
			adapts to any layout. `preserveAspectRatio="none"` would distort
			labels; we use the default `xMidYMid meet` so labels stay crisp.
		-->
		<svg
			viewBox={`0 0 ${W} ${H}`}
			class="block h-32 w-full sm:h-44"
			role="img"
			aria-labelledby="velocity-chart-title"
		>
			<title id="velocity-chart-title">
				Daily application and stage-transition activity. Peak day: {peak} event{peak === 1
					? ''
					: 's'}.
			</title>

			<!-- Subtle horizontal grid lines (3 lines: top, mid, bottom). -->
			<g class="text-border" stroke="currentColor" stroke-width="0.5" opacity="0.5">
				<line x1={PAD_X} x2={W} y1={PAD_Y} y2={PAD_Y} />
				<line x1={PAD_X} x2={W} y1={(H - PAD_Y) / 2} y2={(H - PAD_Y) / 2} />
				<line x1={PAD_X} x2={W} y1={H - PAD_Y} y2={H - PAD_Y} />
			</g>

			<!-- Applications line (filled accent). -->
			<path
				d={appliedPath}
				fill="none"
				stroke="var(--color-accent)"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>

			<!-- Transitions line (status-stalled-700, dashed). -->
			<path
				d={transitionsPath}
				fill="none"
				stroke="var(--color-status-stalled-700)"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-dasharray="4 3"
			/>

			<!-- Per-day hover target: an invisible column over each day with
				a native tooltip ("Tue, May 12 · 2 applied · 1 stage move"). -->
			<g>
				{#each series as point, i (i)}
					<rect
						x={xFor(i) - W / series.length / 2}
						y={PAD_Y}
						width={W / series.length}
						height={H - 2 * PAD_Y}
						fill="transparent"
					>
						<title>{dayTooltip(point)}</title>
					</rect>
				{/each}
			</g>
		</svg>

		<!--
			X-axis labels. SVG doesn't render the x-axis labels (we want
			HTML labels for crisp typography + screen-reader friendliness).
		-->
		<div class="mt-1 flex justify-between font-mono text-[10px] text-muted">
			{#each labelIndices as i (i)}
				<span>{series[i]?.label ?? ''}</span>
			{/each}
		</div>

		<p class="mt-2 text-xs text-muted">
			Hover any day for its dates. A "stage move" is a promotion after the day you applied — it
			measures momentum, not just new applications.
		</p>
	</div>
{/if}
