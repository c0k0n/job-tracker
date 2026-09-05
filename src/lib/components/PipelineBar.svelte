<script lang="ts">
	import type { ApplicationStage } from '$lib/types';
	import { STAGES } from '$lib/constants/stages';

	interface Props {
		/** Counts per stage. Keys are stage values. Stages with zero count may
		 * be omitted; we fill missing stages with 0 for rendering. */
		counts: Record<string, number>;
		/** When the user clicks a stage, this fires with the stage value. */
		onSelect?: (stage: ApplicationStage) => void;
		/** Currently-active stage filter (highlighted). */
		activeStage?: ApplicationStage | null;
	}

	let { counts, onSelect, activeStage = null }: Props = $props();

	const total = $derived(STAGES.reduce((sum, s) => sum + (counts[s.value] ?? 0), 0));

	const segments = $derived(
		STAGES.map((stage) => {
			const count = counts[stage.value] ?? 0;
			const pct = total === 0 ? 0 : (count / total) * 100;
			return { stage, count, pct };
		}).filter((seg) => seg.count > 0)
	);
</script>

{#if total === 0}
	<!--
		Empty state. We still render the bar (so layout is stable) but with
		a placeholder track so the user sees the shape.
	-->
	<div
		class="flex h-2 w-full overflow-hidden rounded-full bg-surface-2"
		aria-label="No applications yet"
	>
		<div class="flex-1"></div>
	</div>
	<p class="mt-3 text-center text-sm text-muted">No applications yet.</p>
{:else}
	<div
		role="group"
		aria-label="Application pipeline by stage"
		class="overflow-hidden rounded-lg border border-border bg-surface"
	>
		<!--
			Bar itself. We render each non-empty segment as a button so the
			user can click any stage to filter the table by it.
		-->
		<div class="flex h-3 w-full overflow-hidden">
			{#each segments as seg (seg.stage.value)}
				{@const isActive = activeStage === seg.stage.value}
				<button
					type="button"
					onclick={() => onSelect?.(seg.stage.value)}
					aria-pressed={isActive}
					aria-label="{seg.stage.label}: {seg.count} {seg.count === 1
						? 'application'
						: 'applications'} ({seg.pct.toFixed(0)} percent)"
					title="{seg.stage.label}: {seg.count}"
					class="bg-{seg.stage.colorToken}-100 hover:bg-{seg.stage
						.colorToken}-700/20 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
					class:ring-2={isActive}
					class:ring-accent={isActive}
					style:width="{seg.pct}%"
				></button>
			{/each}
		</div>

		<!-- Legend with counts -->
		<dl class="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-5 lg:grid-cols-10">
			{#each segments as seg (seg.stage.value)}
				<div class="flex items-center gap-2">
					<dt>
						<span
							aria-hidden="true"
							class="inline-block size-2 rounded-full bg-{seg.stage.colorToken}-700"
						></span>
					</dt>
					<dd class="flex items-baseline gap-1.5 text-xs text-muted">
						<span class="font-mono tracking-wide uppercase">{seg.stage.shortLabel}</span>
						<span class="font-semibold text-fg tabular-nums">{seg.count}</span>
					</dd>
				</div>
			{/each}
		</dl>
	</div>
{/if}
