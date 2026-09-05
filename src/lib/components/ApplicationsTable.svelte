<script lang="ts">
	import type { Application, ApplicationSort, SortKey } from '$lib/types';
	import StatusBadge from './StatusBadge.svelte';
	import { formatSalary } from '$lib/utils/money';
	import { formatRelative, formatDurationInStage, formatDateShort } from '$lib/utils/dates';

	interface Props {
		/** Already-filtered, already-sorted applications to render. */
		rows: readonly Application[];
		/** Current sort state. Drives header arrows and click-to-sort. */
		sort: ApplicationSort;
		/** Click handler. In Round A we just highlight the row; in Round C
		 * we'll wire it to the application-detail modal. */
		onRowClick?: (app: Application) => void;
		/**
		 * Fires when the user clicks a sortable column header. Parent
		 * owns the sort state (it lives in the URL) so the table can't
		 * mutate it directly. We could `$bindable()` instead, but we
		 * want one source of truth — the URL — and an explicit callback
		 * makes that direction of data flow obvious.
		 */
		onSortChange?: (next: ApplicationSort) => void;
	}

	let { rows, sort, onRowClick, onSortChange }: Props = $props();

	function toggleSort(key: SortKey) {
		const next: ApplicationSort =
			sort.key === key ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' };
		onSortChange?.(next);
	}

	function ariaSortFor(key: SortKey): 'ascending' | 'descending' | 'none' {
		if (sort.key !== key) return 'none';
		return sort.dir === 'asc' ? 'ascending' : 'descending';
	}
</script>

<div class="overflow-hidden rounded-lg border border-border bg-surface">
	<div class="overflow-x-auto">
		<table class="w-full text-left text-sm">
			<thead class="border-b border-border bg-surface-2 text-fg">
				<tr>
					<th
						scope="col"
						aria-sort={ariaSortFor('company')}
						class="px-3 py-2.5 font-mono text-[11px] tracking-widest text-muted uppercase sm:px-4"
					>
						<button
							type="button"
							onclick={() => toggleSort('company')}
							class="-mx-2 inline-flex cursor-pointer items-center gap-1 rounded-sm px-2 py-1 transition-colors hover:bg-border/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
						>
							Company
							{#if sort.key === 'company'}
								<span aria-hidden="true">{sort.dir === 'asc' ? '↑' : '↓'}</span>
							{/if}
						</button>
					</th>
					<th
						scope="col"
						class="hidden px-3 py-2.5 font-mono text-[11px] tracking-widest text-muted uppercase sm:table-cell sm:px-4"
					>
						Role
					</th>
					<th
						scope="col"
						aria-sort={ariaSortFor('stage')}
						class="px-3 py-2.5 font-mono text-[11px] tracking-widest text-muted uppercase sm:px-4"
					>
						<button
							type="button"
							onclick={() => toggleSort('stage')}
							class="-mx-2 inline-flex cursor-pointer items-center gap-1 rounded-sm px-2 py-1 transition-colors hover:bg-border/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
						>
							Stage
							{#if sort.key === 'stage'}
								<span aria-hidden="true">{sort.dir === 'asc' ? '↓' : '↑'}</span>
							{/if}
						</button>
					</th>
					<th
						scope="col"
						class="hidden px-3 py-2.5 font-mono text-[11px] tracking-widest text-muted uppercase sm:px-4 md:table-cell"
					>
						Status
					</th>
					<th
						scope="col"
						class="hidden px-3 py-2.5 font-mono text-[11px] tracking-widest text-muted uppercase sm:px-4 md:table-cell"
					>
						Arrangement
					</th>
					<th
						scope="col"
						class="hidden px-3 py-2.5 font-mono text-[11px] tracking-widest text-muted uppercase sm:px-4 lg:table-cell"
					>
						Salary
					</th>
					<th
						scope="col"
						aria-sort={ariaSortFor('appliedAt')}
						class="hidden px-3 py-2.5 font-mono text-[11px] tracking-widest text-muted uppercase sm:px-4 md:table-cell"
					>
						<button
							type="button"
							onclick={() => toggleSort('appliedAt')}
							class="-mx-2 inline-flex cursor-pointer items-center gap-1 rounded-sm px-2 py-1 transition-colors hover:bg-border/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
						>
							Applied
							{#if sort.key === 'appliedAt'}
								<span aria-hidden="true">{sort.dir === 'asc' ? '↑' : '↓'}</span>
							{/if}
						</button>
					</th>
					<th
						scope="col"
						aria-sort={ariaSortFor('stageChangedAt')}
						class="px-3 py-2.5 font-mono text-[11px] tracking-widest text-muted uppercase sm:px-4"
					>
						<button
							type="button"
							onclick={() => toggleSort('stageChangedAt')}
							class="-mx-2 inline-flex cursor-pointer items-center gap-1 rounded-sm px-2 py-1 transition-colors hover:bg-border/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
						>
							In stage
							{#if sort.key === 'stageChangedAt'}
								<span aria-hidden="true">{sort.dir === 'asc' ? '↑' : '↓'}</span>
							{/if}
						</button>
					</th>
					<th
						scope="col"
						aria-sort={ariaSortFor('nextActionAt')}
						class="hidden px-3 py-2.5 font-mono text-[11px] tracking-widest text-muted uppercase sm:px-4 lg:table-cell"
					>
						<button
							type="button"
							onclick={() => toggleSort('nextActionAt')}
							class="-mx-2 inline-flex cursor-pointer items-center gap-1 rounded-sm px-2 py-1 transition-colors hover:bg-border/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
						>
							Next action
							{#if sort.key === 'nextActionAt'}
								<span aria-hidden="true">{sort.dir === 'asc' ? '↑' : '↓'}</span>
							{/if}
						</button>
					</th>
				</tr>
			</thead>

			<tbody class="divide-y divide-border">
				{#each rows as app (app.id)}
					<tr
						class="cursor-pointer transition-colors focus-within:bg-surface-2 hover:bg-surface-2"
						onclick={() => onRowClick?.(app)}
						tabindex="0"
						role="link"
						aria-label="Open {app.company} {app.role}"
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								onRowClick?.(app);
							}
						}}
					>
						<td class="px-3 py-3 sm:px-4">
							<div class="flex items-center gap-2">
								<div class="font-medium text-fg">{app.company}</div>
								{#if app.resumeId}
									<span
										aria-label="Resume attached"
										title="Resume attached"
										class="inline-flex size-4 items-center justify-center rounded-sm bg-surface-2 text-muted"
									>
										<svg
											aria-hidden="true"
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 20 20"
											fill="currentColor"
											class="size-3"
										>
											<path
												fill-rule="evenodd"
												d="M15.621 4.379a3 3 0 0 0-4.242 0l-7 7a3 3 0 0 0 4.241 4.243h.001l.497-.5a.75.75 0 0 1 1.064 1.057l-.498.501-.002.002a4.5 4.5 0 0 1-6.364-6.364l7-7a4.5 4.5 0 0 1 6.368 6.36l-3.455 3.553A2.625 2.625 0 1 1 9.52 9.52l3.45-3.451a.75.75 0 1 1 1.061 1.06l-3.45 3.451a1.125 1.125 0 0 0 1.587 1.595l3.454-3.553a3 3 0 0 0 0-4.242Z"
												clip-rule="evenodd"
											/>
										</svg>
									</span>
								{/if}
							</div>
							{#if app.role}
								<div class="mt-0.5 text-xs text-muted sm:hidden">{app.role}</div>
							{/if}
						</td>
						<td class="hidden px-3 py-3 text-fg sm:table-cell sm:px-4">{app.role}</td>
						<td class="px-3 py-3 sm:px-4">
							<StatusBadge kind="stage" value={app.stage} />
						</td>
						<td class="hidden px-3 py-3 sm:px-4 md:table-cell">
							<StatusBadge kind="status" value={app.status} />
						</td>
						<td class="hidden px-3 py-3 text-xs text-muted sm:px-4 md:table-cell">
							<StatusBadge kind="arrangement" value={app.workArrangement} />
						</td>
						<td class="hidden px-3 py-3 text-xs text-muted tabular-nums sm:px-4 lg:table-cell">
							{formatSalary(app.salary)}
						</td>
						<td
							class="hidden px-3 py-3 text-xs text-muted sm:px-4 md:table-cell"
							title={formatDateShort(app.appliedAt)}
						>
							{formatRelative(app.appliedAt)}
						</td>
						<td class="px-3 py-3 text-xs text-muted tabular-nums sm:px-4">
							{formatDurationInStage(app.stageChangedAt)}
						</td>
						<td
							class="hidden px-3 py-3 text-xs text-muted sm:px-4 lg:table-cell"
							title={app.nextActionAt ? formatDateShort(app.nextActionAt) : ''}
						>
							{#if app.nextActionAt}
								{formatRelative(app.nextActionAt)}
							{:else}
								<span class="text-muted/60">—</span>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
