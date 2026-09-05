<script lang="ts">
	import type { ApplicationStage, ApplicationStatus, WorkArrangement } from '$lib/types';
	import { STAGE_BY_VALUE, STATUS_BY_VALUE, ARRANGEMENT_BY_VALUE } from '$lib/constants/stages';

	type Kind = 'stage' | 'status' | 'arrangement';

	interface Props {
		kind: Kind;
		value: ApplicationStage | ApplicationStatus | WorkArrangement;
		/** Compact label (shortLabel) vs full. */
		variant?: 'compact' | 'full';
	}

	let { kind, value, variant = 'compact' }: Props = $props();

	const meta = $derived.by(() => {
		if (kind === 'stage') return STAGE_BY_VALUE[value as ApplicationStage];
		if (kind === 'status') return STATUS_BY_VALUE[value as ApplicationStatus];
		return ARRANGEMENT_BY_VALUE[value as WorkArrangement];
	});

	const colorToken = $derived(meta && 'colorToken' in meta ? meta.colorToken : null);

	// Map colorToken to a Tailwind class pair. The literals must stay in
	// source verbatim — the v4 scanner can't see interpolated class names.
	const BG_BY_TOKEN: Record<string, string> = {
		'stage-saved': 'bg-stage-saved-100',
		'stage-applied': 'bg-stage-applied-100',
		'stage-progress': 'bg-stage-progress-100',
		'stage-late': 'bg-stage-late-100',
		'stage-offer': 'bg-stage-offer-100',
		'stage-terminal': 'bg-stage-terminal-100',
		'stage-closed': 'bg-stage-closed-100',
		'status-active': 'bg-status-active-100',
		'status-stalled': 'bg-status-stalled-100',
		'status-ghosted': 'bg-status-ghosted-100',
		'status-paused': 'bg-status-paused-100',
		'status-closed': 'bg-status-closed-100'
	};
	const TEXT_BY_TOKEN: Record<string, string> = {
		'stage-saved': 'text-stage-saved-700',
		'stage-applied': 'text-stage-applied-700',
		'stage-progress': 'text-stage-progress-700',
		'stage-late': 'text-stage-late-700',
		'stage-offer': 'text-stage-offer-700',
		'stage-terminal': 'text-stage-terminal-700',
		'stage-closed': 'text-stage-closed-700',
		'status-active': 'text-status-active-700',
		'status-stalled': 'text-status-stalled-700',
		'status-ghosted': 'text-status-ghosted-700',
		'status-paused': 'text-status-paused-700',
		'status-closed': 'text-status-closed-700'
	};

	const bgClass = $derived(BG_BY_TOKEN[colorToken ?? ''] ?? 'bg-surface-2');
	const textClass = $derived(TEXT_BY_TOKEN[colorToken ?? ''] ?? 'text-fg');

	const displayLabel = $derived.by(() => {
		if (kind === 'arrangement') {
			// ArrangementMeta has `label` (no shortLabel)
			return meta?.label ?? String(value);
		}
		const m = meta as { shortLabel?: string; label?: string } | undefined;
		return variant === 'compact'
			? (m?.shortLabel ?? m?.label ?? String(value))
			: (m?.label ?? String(value));
	});
</script>

<span
	class="inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[11px] font-medium tracking-wide uppercase {bgClass} {textClass}"
	data-kind={kind}
	data-value={value}
>
	{displayLabel}
</span>
