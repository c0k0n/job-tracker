<script lang="ts">
	import { STAGES } from '$lib/constants/stages';
	import { daysSince } from '$lib/utils/dates';
	import type { Application, ApplicationStatus } from '$lib/types';

	interface Props {
		apps: readonly Application[];
	}

	let { apps }: Props = $props();

	// Which stages get a dwell row: everything except terminal outcomes
	// (accepted / rejected / withdrawn). "Saved" is included — it is
	// "time spent before applying", a real stalling signal.
	const LIVE_STAGES = STAGES.filter(
		(s) => s.value !== 'accepted' && s.value !== 'rejected' && s.value !== 'withdrawn'
	);

	// Dot color by status. Literals must appear in source verbatim — the v4
	// scanner can't see interpolated class names.
	const DOT_BG: Record<string, string> = {
		active: 'bg-status-active-700',
		stalled: 'bg-status-stalled-700',
		ghosted: 'bg-status-ghosted-700',
		paused: 'bg-status-paused-700',
		closed: 'bg-status-closed-700'
	};

	// Baseline ticks on the dwell axis ("how old should a stage feel?").
	const TICKS = [7, 14, 21];

	type DwellRow = {
		stage: (typeof STAGES)[number];
		apps: Application[];
		longest: number; // days
		stalledCount: number; // stalled + ghosted in this stage
	};

	// Live = status isn't 'closed'. Dwell = days spent in the current stage.
	const liveApps = $derived(apps.filter((a) => a.status !== 'closed'));

	const rows: DwellRow[] = $derived.by(() =>
		LIVE_STAGES.map((stage) => {
			const inStage = liveApps.filter((a) => a.stage === stage.value);
			const stalledCount = inStage.filter(
				(a) => a.status === 'stalled' || a.status === 'ghosted'
			).length;
			return {
				stage,
				apps: inStage,
				longest:
					inStage.length === 0 ? 0 : Math.max(...inStage.map((a) => daysSince(a.stageChangedAt))),
				stalledCount
			};
		})
	);

	// The dwell track is scaled to a shared window so dot positions are
	// comparable across stages. A 30-day floor keeps the axis readable
	// even when everything is fresh.
	const dwellDays = $derived(rows.flatMap((r) => r.apps.map((a) => daysSince(a.stageChangedAt))));
	const windowDays = $derived(Math.max(30, ...dwellDays.filter((d) => Number.isFinite(d))));

	const totalLive = $derived(liveApps.length);
	const hasData = $derived(totalLive > 0);

	function pct(days: number): number {
		const d = Number.isFinite(days) ? Math.max(days, 0) : 0;
		return (Math.min(d, windowDays) / windowDays) * 100;
	}

	function dotBg(status: ApplicationStatus): string {
		return DOT_BG[status] ?? 'bg-status-closed-700';
	}
</script>

{#if !hasData}
	<div class="rounded-lg border border-border bg-surface px-4 py-6 sm:px-5">
		<header class="mb-3 flex items-baseline justify-between gap-2">
			<h3 class="font-mono text-[11px] tracking-widest text-muted uppercase">Time in stage</h3>
			<p class="font-mono text-[11px] text-muted">0 live</p>
		</header>
		<p class="text-center text-sm text-muted">No active applications to track.</p>
	</div>
{:else}
	<div class="rounded-lg border border-border bg-surface px-4 py-5 sm:px-5">
		<header class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
			<h3 class="font-mono text-[11px] tracking-widest text-muted uppercase">
				Time in stage · now
			</h3>
			<div class="flex items-center gap-4 text-xs">
				{#each [{ label: 'Active', token: 'bg-status-active-700' }, { label: 'Stalled', token: 'bg-status-stalled-700' }, { label: 'Ghosted', token: 'bg-status-ghosted-700' }, { label: 'Paused', token: 'bg-status-paused-700' }] as item (item.label)}
					<span class="flex items-center gap-1.5">
						<span aria-hidden="true" class="inline-block size-2 rounded-full {item.token}"></span>
						<span class="text-muted">{item.label}</span>
					</span>
				{/each}
			</div>
		</header>

		<!--
			One track per live stage. Each application is a dot whose
			horizontal position is its dwell; color is its status. The
			track shows reference ticks at 1w / 2w / 3w so "stuck" is
			readable at a glance.
		-->
		<ol class="space-y-1.5">
			{#each rows as row (row.stage.value)}
				<li
					class="flex items-center gap-3"
					aria-label="{row.stage.label}: {row.apps.length} {row.apps.length === 1
						? 'application'
						: 'applications'}{row.longest > 0
						? `, longest ${row.longest} days`
						: ''}{row.stalledCount > 0 ? `, ${row.stalledCount} stalled or ghosted` : ''}"
				>
					<!-- Fixed-width gutters so the tracks align. Narrowed on
						phones (w-20) to leave the track enough room to be
						readable at 320px. -->
					<span class="w-20 shrink-0 text-right font-mono text-[11px] text-muted uppercase sm:w-28">
						{row.stage.label}
					</span>

					<div
						class="relative h-5 flex-1 overflow-hidden rounded-sm bg-surface-2"
						aria-hidden="true"
					>
						{#each TICKS as tick (tick)}
							{#if tick <= windowDays}
								<span class="absolute inset-y-0 w-px bg-border" style:left="{pct(tick).toFixed(1)}%"
								></span>
							{/if}
						{/each}
						{#if row.apps.length === 0}
							<span
								class="absolute inset-0 flex items-center justify-center font-mono text-[10px] text-muted/50"
							>
								—
							</span>
						{:else}
							{#each row.apps as app (app.id)}
								{@const dwell = daysSince(app.stageChangedAt)}
								<span
									class="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full {dotBg(
										app.status
									)}"
									style:left="{pct(dwell).toFixed(1)}%"
									title="{app.company} · {app.status} · {Number.isFinite(dwell)
										? `${dwell}d in stage`
										: 'no stage date'}"
								></span>
							{/each}
						{/if}
					</div>

					<span class="w-20 shrink-0 text-right font-mono text-[11px] tabular-nums sm:w-28">
						<span class="text-fg">
							{row.apps.length > 0 ? `${row.apps.length} · ${row.longest}d` : '·'}
						</span>
						{#if row.stalledCount > 0}
							<span class="ml-1 text-status-stalled-700">{row.stalledCount} stuck</span>
						{/if}
					</span>
				</li>
			{/each}
		</ol>

		<!-- Shared axis: where the reference ticks land, and the window end. -->
		<div class="relative mt-1 h-3" aria-hidden="true">
			{#each TICKS as tick (tick)}
				{#if tick <= windowDays}
					<span
						class="absolute -translate-x-1/2 font-mono text-[10px] text-muted"
						style:left="{pct(tick).toFixed(1)}%"
					>
						{tick}d
					</span>
				{/if}
			{/each}
			<span class="absolute right-0 -translate-x-1/2 font-mono text-[10px] text-muted">
				{windowDays}d
			</span>
		</div>

		<p class="mt-2 text-xs text-muted">
			Each dot is a live application placed by how long it has sat in its current stage. Stalled or
			ghosted dots are follow-up candidates — the KPI strip tracks them globally.
		</p>
	</div>
{/if}
