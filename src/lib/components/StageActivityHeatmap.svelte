<script lang="ts">
	import { daysSince } from '$lib/utils/dates';

	interface Props {
		/** All applications, including closed. The heatmap aggregates
		 * by stage-change date, not by current status, so it shows
		 * historical activity. */
		apps: readonly import('$lib/types').Application[];
	}

	let { apps }: Props = $props();

	// 90-day window. We bucket by week for display, but the color
	// intensity is the count per day (so a single busy day is visible).
	const WINDOW_DAYS = 90;
	const WEEK_BUCKETS = 13; // 90/7 ≈ 12.86

	type DayBucket = {
		weekIndex: number; // 0 = oldest, 12 = this week
		count: number; // stage-changes on any day in this week
		daysAgo: number; // smallest daysAgo in this week (for the label)
	};

	const buckets: DayBucket[] = $derived.by(() => {
		const out: DayBucket[] = [];
		for (let i = 0; i < WEEK_BUCKETS; i++) {
			out.push({
				weekIndex: i,
				count: 0,
				daysAgo: WINDOW_DAYS - i * 7
			});
		}
		for (const a of apps) {
			const d = daysSince(a.stageChangedAt);
			if (d > WINDOW_DAYS) continue;
			const weekIndex = Math.floor((WINDOW_DAYS - d) / 7);
			if (weekIndex < 0 || weekIndex >= WEEK_BUCKETS) continue;
			const bucket = out[weekIndex];
			if (bucket) bucket.count += 1;
		}
		return out;
	});

	const maxCount = $derived(Math.max(1, ...buckets.map((b) => b.count)));
	const totalCount = $derived(buckets.reduce((sum, b) => sum + b.count, 0));

	function intensity(count: number, max: number): number {
		if (max === 0) return 0;
		return Math.min(1, count / max);
	}
</script>

{#if totalCount === 0}
	<!--
		Empty state. Render the bar shape (so the section doesn't jump
		when applications land) with no data, and a quiet prompt.
	-->
	<div
		class="rounded-lg border border-border bg-surface px-4 py-6 sm:px-5"
		aria-label="No stage-change activity in the last 90 days"
	>
		<div class="flex h-12 w-full gap-1">
			{#each [...Array(WEEK_BUCKETS).keys()] as i (i)}
				<div class="flex-1 rounded-sm bg-surface-2" aria-hidden="true" style:opacity={0.4}></div>
			{/each}
		</div>
		<p class="mt-4 text-center text-sm text-muted">No stage changes in the last 90 days.</p>
	</div>
{:else}
	<div
		class="rounded-lg border border-border bg-surface px-4 py-5 sm:px-5"
		aria-label="Stage change activity over the last 90 days, grouped by week"
	>
		<header class="mb-3 flex items-baseline justify-between gap-2">
			<h3 class="font-mono text-[11px] tracking-widest text-muted uppercase">
				Stage activity · 90 days
			</h3>
			<p class="font-mono text-[11px] text-muted">
				{totalCount}
				{totalCount === 1 ? 'change' : 'changes'}
			</p>
		</header>

		<!--
			Each cell is a 1-week bucket. Color intensity = count / max.
			Higher count = darker cell. Lighter (white-100) = zero.
			No tooltips in Round B; future round can add a per-day breakdown
			on hover.
		-->
		<div
			role="img"
			aria-label="Heatmap of stage changes by week. Lighter cells mean fewer changes; darker cells mean more."
			class="flex h-10 w-full gap-1"
		>
			{#each buckets as bucket, i (i)}
				<div
					class="flex-1 rounded-sm"
					title="{bucket.count} stage {bucket.count === 1
						? 'change'
						: 'changes'} around {bucket.daysAgo} days ago"
					style:background-color="oklch(0.97 {intensity(bucket.count, maxCount) * 0.06} 250)"
				></div>
			{/each}
		</div>

		<!--
			Day axis. We only label start / middle / end so the labels
			don't crowd. Days-ago values for context.
		-->
		<div class="mt-2 flex justify-between font-mono text-[10px] text-muted">
			<span>90d ago</span>
			<span>60d ago</span>
			<span>30d ago</span>
			<span>now</span>
		</div>
	</div>
{/if}
