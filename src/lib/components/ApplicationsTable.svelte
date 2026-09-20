<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Application, ApplicationSort, SortKey } from '$lib/types';
	import StatusBadge from './StatusBadge.svelte';
	import Button from './Button.svelte';
	import { formatSalary } from '$lib/utils/money';
	import { formatRelative, formatDurationInStage, formatDateShort } from '$lib/utils/dates';

	interface Props {
		/** Already-filtered, already-sorted applications to render. */
		rows: readonly Application[];
		/** When true, rows are soft-deleted and rendering shows the
		 * Restore / Delete-permanently actions instead of Move-to-trash. */
		trashView?: boolean;
		/** Current sort state. Drives header arrows and click-to-sort. */
		sort: ApplicationSort;
		/** Click handler. Opens the application-detail modal in the dashboard. */
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

	let { rows, trashView = false, sort, onRowClick, onSortChange }: Props = $props();

	// Two-step confirm for permanent deletion: the first click arms the
	// row, a second submit performs the purge. State is per-table so only
	// one row can be armed at a time.
	let confirmPurgeId: string | null = $state(null);

	function toggleSort(key: SortKey) {
		const next: ApplicationSort =
			sort.key === key ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' };
		onSortChange?.(next);
	}

	function ariaSortFor(key: SortKey): 'ascending' | 'descending' | 'none' {
		if (sort.key !== key) return 'none';
		return sort.dir === 'asc' ? 'ascending' : 'descending';
	}

	// How many tags to show before collapsing into a "+N" tail.
	// We picked 3 to keep the cell a single line on most viewports.
	const TAGS_VISIBLE = 3;
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
								<span aria-hidden="true">{sort.dir === 'asc' ? '↑' : '↓'}</span>
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
						class="hidden px-3 py-2.5 font-mono text-[11px] tracking-widest text-muted uppercase sm:px-4 lg:table-cell"
					>
						Tags
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
					<th scope="col" class="px-3 py-2.5 text-right sm:px-4">
						<span class="sr-only">Actions</span>
					</th>
				</tr>
			</thead>

			<tbody class="divide-y divide-border">
				{#each rows as app (app.id)}
					<!--
						Mouse convenience: any non-control click on the row
						opens the detail modal. Keyboard activation lives on
						the company button (proper <button>), so this row is
						NOT role="link" + tabindex="0" (an a11y violation
						since nested <button>s/forms would make the row
						announce as both a link AND an interactive container).
					-->
					<tr
						class="transition-colors focus-within:bg-surface-2 hover:bg-surface-2"
						onclick={(e) => {
							// Skip clicks that originate inside interactive
							// controls (the row-action buttons and the open
							// button in the company cell) — those handle their
							// own activation.
							if ((e.target as Element | null)?.closest('button, a, input, select, textarea'))
								return;
							onRowClick?.(app);
						}}
					>
						<td class="px-3 py-3 sm:px-4">
							<div class="flex items-center gap-2">
								<button
									type="button"
									onclick={() => onRowClick?.(app)}
									aria-label={`Open ${app.company} ${app.role} details`}
									class="cursor-pointer text-left font-medium text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
								>
									{app.company}
								</button>
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
						<td class="hidden px-3 py-3 sm:px-4 lg:table-cell">
							{#if app.tags.length === 0}
								<span class="text-xs text-muted/60">·</span>
							{:else}
								<div class="flex flex-wrap gap-1">
									{#each app.tags.slice(0, TAGS_VISIBLE) as tag (tag)}
										<span
											class="inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[10px] tracking-wide text-muted"
											title={tag}
										>
											{tag}
										</span>
									{/each}
									{#if app.tags.length > TAGS_VISIBLE}
										<span
											class="inline-flex items-center font-mono text-[10px] text-muted/70"
											title={app.tags.slice(TAGS_VISIBLE).join(', ')}
										>
											+{app.tags.length - TAGS_VISIBLE}
										</span>
									{/if}
								</div>
							{/if}
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
								<span class="text-muted/60">·</span>
							{/if}
						</td>
						<td class="px-3 py-3 sm:px-4">
							<!--
							Row actions. The row ignores clicks/keyboard that
							originate inside buttons, so interacting with these
							controls never opens the detail modal.
						-->
							{#if trashView}
								<div class="flex items-center justify-end gap-1.5">
									<form method="POST" action="?/restore" use:enhance class="contents">
										<input type="hidden" name="id" value={app.id} />
										<Button
											type="submit"
											variant="outline"
											size="sm"
											title="Put this application back in your active list"
										>
											Restore
										</Button>
									</form>
									{#if confirmPurgeId === app.id}
										<form method="POST" action="?/purge" use:enhance class="contents">
											<input type="hidden" name="id" value={app.id} />
											<Button
												type="submit"
												variant="danger"
												size="sm"
												ariaLabel={`Permanently delete ${app.company} ${app.role}`}
												title="Remove this application and everything attached to it. This cannot be undone."
											>
												Delete for good
											</Button>
										</form>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											onclick={() => (confirmPurgeId = null)}
											ariaLabel="Cancel permanent delete"
										>
											Cancel
										</Button>
									{:else}
										<Button
											type="button"
											variant="ghost"
											size="sm"
											ariaLabel={`Delete ${app.company} ${app.role} permanently`}
											onclick={() => (confirmPurgeId = app.id)}
											title="Delete permanently. The first click shows a confirm button."
										>
											Delete
										</Button>
									{/if}
								</div>
							{:else}
								<form method="POST" action="?/delete" use:enhance class="contents">
									<input type="hidden" name="id" value={app.id} />
									<Button
										type="submit"
										variant="ghost"
										size="sm"
										ariaLabel={`Move ${app.company} ${app.role} to trash`}
										title="Move to trash. It stays restorable from the trash view."
									>
										{#snippet icon()}
											<svg
												aria-hidden="true"
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="1.5"
												class="size-4"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
												/>
											</svg>
										{/snippet}
									</Button>
								</form>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
