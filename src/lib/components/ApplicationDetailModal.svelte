<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve as resolvePath } from '$app/paths';
	import type { ApplicationDetail, Resume } from '$lib/types';
	import Modal from './Modal.svelte';
	import StatusBadge from './StatusBadge.svelte';
	import ApplicationForm from './ApplicationForm.svelte';
	import Button from './Button.svelte';
	import { formatDateShort, formatRelative, formatDurationInStage } from '$lib/utils/dates';
	import { formatSalary } from '$lib/utils/money';
	import { STAGES, STATUSES } from '$lib/constants/stages';
	import { formatBytes } from '$lib/constants/resumes';

	interface Props {
		/** Resolved detail bundle for the application currently in the modal.
		 * Null if the row was deleted / not visible. */
		detail: ApplicationDetail | null;
		/** Bindable open state — the dashboard owns it (local $state there;
		 * opened via goto so the server load fetches the bundle). */
		open?: boolean;
		/** Latest form-action result from the dashboard page (`page.form`).
		 * Forwarded to the edit ApplicationForm so server-side validation
		 * errors for the `edit` action surface above the fields. */
		form?: {
			operation?: string;
			values?: Record<string, unknown>;
			errors?: Record<string, string>;
		} | null;
		/** The user's uploaded resumes, so an attached id can be resolved to
		 * a filename. Already scoped to this account by the dashboard load. */
		resumes?: readonly Resume[];
	}

	let { detail, open = $bindable(false), form, resumes = [] }: Props = $props();

	type Tab = 'overview' | 'interviews' | 'contacts' | 'activity';
	let activeTab = $state<Tab>('overview');

	// WAI-ARIA tabs: arrow keys move between tabs, Home/End to the ends.
	// Focus follows selection (roving tabindex is on the buttons).
	const TABS: Tab[] = ['overview', 'interviews', 'contacts', 'activity'];
	function onTabKeydown(e: KeyboardEvent) {
		if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
		e.preventDefault();
		const idx = TABS.indexOf(activeTab);
		const delta =
			e.key === 'ArrowRight'
				? 1
				: e.key === 'ArrowLeft'
					? -1
					: e.key === 'End'
						? TABS.length
						: -idx;
		const nextTab = TABS[(idx + delta + TABS.length) % TABS.length]!;
		activeTab = nextTab;
		queueMicrotask(() => {
			document.getElementById(`app-tab-${nextTab}-btn`)?.focus();
		});
	}

	// Open state is the bindable `open` prop (owned by the dashboard);
	// closing via Esc/backdrop/X flips it there, and the dashboard's
	// single URL-sync effect strips `?app=` via shallow routing. This
	// component no longer touches navigation APIs itself.
	const app = $derived(detail?.application ?? null);
	// The inner ApplicationForm prop is `application`; alias for shorthand.
	const application = $derived(app ?? undefined);

	// Trash actions. `purge` is confirmed via a two-click pattern
	// (first click reveals the confirm button; second submits).
	let confirmPurgeOpen = $state(false);
	function openConfirmPurge() {
		confirmPurgeOpen = true;
	}
	function closeConfirmPurge() {
		confirmPurgeOpen = false;
	}

	// The attached resume, resolved from the user's library. Null when the
	// application has none, or when the file was deleted — deleting a resume
	// detaches every application that pointed at it, so this stays honest.
	//
	// Both URLs hit the same-origin route that re-checks ownership and
	// streams the PDF out of R2; `?download=1` makes it an attachment.
	const attached = $derived.by(() => {
		if (!app?.resumeId) return null;
		const found = resumes.find((r) => r.id === app.resumeId);
		if (!found) return null;
		return { resume: found, url: resolvePath(`/api/resumes/${found.id}`) };
	});

	const stageMeta = $derived(app ? STAGES.find((s) => s.value === app.stage) : null);
	const statusMeta = $derived(app ? STATUSES.find((s) => s.value === app.status) : null);

	const interviews = $derived(detail?.interviews ?? []);
	const contacts = $derived(detail?.contacts ?? []);
	const activities = $derived(detail?.activities ?? []);

	// Sort interviews by scheduledAt (most recent first).
	const sortedInterviews = $derived(
		[...interviews].sort(
			(a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
		)
	);
	const sortedActivities = $derived(
		[...activities].sort(
			(a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
		)
	);

	const tabButtonClass = (tab: Tab) =>
		`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
			activeTab === tab ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-surface-2 hover:text-fg'
		}`;
</script>

<Modal
	bind:open
	title={app ? `${app.company} — ${app.role}` : 'Application'}
	subtitle={app
		? `${stageMeta?.label ?? app.stage}${statusMeta ? ` · ${statusMeta.label}` : ''}`
		: ''}
	size="xl"
>
	{#if !app}
		<div class="px-6 py-10 text-center text-sm text-muted">
			This application is no longer available.
		</div>
	{:else}
		<header class="mb-3 flex items-baseline justify-between gap-3">
			<h2 id="app-detail-heading" class="text-base font-semibold text-fg">Application details</h2>
			<span class="font-mono text-[10px] tracking-widest text-muted uppercase">{app.id}</span>
		</header>
		<!-- Tabs (sticky under modal header) -->
		<div
			role="tablist"
			aria-label="Application sections"
			class="flex gap-1 border-b border-border bg-surface px-6"
		>
			<button
				type="button"
				role="tab"
				aria-selected={activeTab === 'overview'}
				aria-controls="app-tab-overview"
				id="app-tab-overview-btn"
				tabindex={activeTab === 'overview' ? 0 : -1}
				onkeydown={onTabKeydown}
				onclick={() => (activeTab = 'overview')}
				class={tabButtonClass('overview')}
			>
				Overview
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={activeTab === 'interviews'}
				aria-controls="app-tab-interviews"
				id="app-tab-interviews-btn"
				tabindex={activeTab === 'interviews' ? 0 : -1}
				onkeydown={onTabKeydown}
				onclick={() => (activeTab = 'interviews')}
				class={tabButtonClass('interviews')}
			>
				Interviews <span class="opacity-70">· {interviews.length}</span>
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={activeTab === 'contacts'}
				aria-controls="app-tab-contacts"
				id="app-tab-contacts-btn"
				tabindex={activeTab === 'contacts' ? 0 : -1}
				onkeydown={onTabKeydown}
				onclick={() => (activeTab = 'contacts')}
				class={tabButtonClass('contacts')}
			>
				Contacts <span class="opacity-70">· {contacts.length}</span>
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={activeTab === 'activity'}
				aria-controls="app-tab-activity"
				id="app-tab-activity-btn"
				tabindex={activeTab === 'activity' ? 0 : -1}
				onkeydown={onTabKeydown}
				onclick={() => (activeTab = 'activity')}
				class={tabButtonClass('activity')}
			>
				Activity <span class="opacity-70">· {activities.length}</span>
			</button>
		</div>
		<div class="px-6 py-5">
			{#if activeTab === 'overview'}
				<div
					id="app-tab-overview"
					role="tabpanel"
					aria-labelledby="app-tab-overview-btn"
					class="space-y-5"
				>
					<div class="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
						<div>
							<div class="font-mono text-[10px] tracking-widest text-muted uppercase">Stage</div>
							<div class="mt-1"><StatusBadge kind="stage" value={app.stage} /></div>
						</div>
						<div>
							<div class="font-mono text-[10px] tracking-widest text-muted uppercase">Status</div>
							<div class="mt-1"><StatusBadge kind="status" value={app.status} /></div>
						</div>
						<div>
							<div class="font-mono text-[10px] tracking-widest text-muted uppercase">
								Arrangement
							</div>
							<div class="mt-1">
								<StatusBadge kind="arrangement" value={app.workArrangement} />
							</div>
						</div>
						<div>
							<div class="font-mono text-[10px] tracking-widest text-muted uppercase">
								In stage for
							</div>
							<div class="mt-1 text-sm text-fg tabular-nums">
								{formatDurationInStage(app.stageChangedAt)}
							</div>
						</div>
						<div>
							<div class="font-mono text-[10px] tracking-widest text-muted uppercase">Applied</div>
							<div class="mt-1 text-sm text-fg" title={formatDateShort(app.appliedAt)}>
								{formatRelative(app.appliedAt)}
							</div>
						</div>
						<div>
							<div class="font-mono text-[10px] tracking-widest text-muted uppercase">
								Next action
							</div>
							<div
								class="mt-1 text-sm text-fg"
								title={app.nextActionAt ? formatDateShort(app.nextActionAt) : ''}
							>
								{#if app.nextActionAt}
									{formatRelative(app.nextActionAt)}
								{:else}
									<span class="text-muted/60">·</span>
								{/if}
							</div>
						</div>
						<div>
							<div class="font-mono text-[10px] tracking-widest text-muted uppercase">Salary</div>
							<div class="mt-1 text-sm text-fg tabular-nums">
								{formatSalary(app.salary)}
							</div>
						</div>
						<div>
							<div class="font-mono text-[10px] tracking-widest text-muted uppercase">Tags</div>
							<div class="mt-1 flex flex-wrap gap-1">
								{#each app.tags as t (t)}
									<span
										class="inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[10px] tracking-wide text-muted"
										>{t}</span
									>
								{:else}
									<span class="text-xs text-muted/60">·</span>
								{/each}
							</div>
						</div>
						<div>
							<div class="font-mono text-[10px] tracking-widest text-muted uppercase">Resume</div>
							<div class="mt-1 text-sm text-fg">
								{#if attached}
									<!-- Native `download` attribute rather than ?download=1, so the
										href stays a plain resolve()d path for the lint rule. -->
									<a
										href={attached.url}
										download={attached.resume.name}
										class="underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
									>
										{attached.resume.name}
									</a>
									<span class="text-xs text-muted">
										· {formatBytes(attached.resume.sizeBytes)}
									</span>
								{:else}
									<span class="text-muted">Not attached</span>
								{/if}
							</div>
						</div>
					</div>

					{#if app.postingUrl}
						<div>
							<!-- `postingUrl` is an external job-board link; use it
								directly — resolve() is only for internal routes. -->
							<a
								href={app.postingUrl}
								target="_blank"
								rel="external noreferrer"
								class="text-sm text-fg underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
							>
								View original posting ↗
							</a>
						</div>
					{/if}

					{#if attached}
						<div>
							<div class="mb-2 flex items-baseline justify-between gap-2">
								<div class="font-mono text-[10px] tracking-widest text-muted uppercase">
									Resume sent
								</div>
								<a
									href={resolvePath(`/api/resumes/${attached.resume.id}`)}
									target="_blank"
									rel="noreferrer"
									class="text-xs text-muted underline-offset-2 hover:text-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
								>
									Open in a new tab ↗
								</a>
							</div>
							<iframe
								title={`Resume ${attached.resume.name}, sent to ${app.company}`}
								src={attached.url}
								loading="lazy"
								class="h-64 w-full rounded-md border border-border bg-surface-2"
							></iframe>
							<p class="mt-1 text-xs text-muted">
								This is the exact file you attached. Some browsers will not draw a PDF inside an
								iframe — the link above always works.
							</p>
						</div>
					{/if}

					{#if app.deletedAt}
						<div
							role="status"
							class="rounded-md border border-status-stalled-700 bg-status-stalled-100 px-3 py-2 text-sm text-status-stalled-700"
						>
							This application is in trash (soft-deleted {formatRelative(app.deletedAt)}). You can
							restore it from the trash view.
						</div>
					{/if}

					<!-- Trash / restore / purge actions -->
					<div class="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
						<form method="POST" action="?/restore" use:enhance class="contents">
							<input type="hidden" name="id" value={app.id} />
							<Button
								type="submit"
								variant="outline"
								disabled={!app.deletedAt}
								ariaLabel="Restore from trash"
								title="Put this application back in your active list"
							>
								Restore
							</Button>
						</form>
						<form method="POST" action="?/delete" use:enhance class="contents">
							<input type="hidden" name="id" value={app.id} />
							<Button
								type="submit"
								variant="outline"
								disabled={!!app.deletedAt}
								ariaLabel="Move to trash"
								title="Move to trash. You can restore it later from the trash view."
							>
								Move to trash
							</Button>
						</form>
						{#if !confirmPurgeOpen}
							<Button
								type="button"
								variant="danger"
								onclick={openConfirmPurge}
								ariaLabel="Permanently delete"
								title="Delete this application for good. This cannot be undone."
							>
								Permanently delete
							</Button>
						{:else}
							<form method="POST" action="?/purge" use:enhance class="contents">
								<input type="hidden" name="id" value={app.id} />
								<Button
									type="submit"
									variant="danger"
									ariaLabel="Confirm permanently delete"
									title="This removes the application and all its interviews, contacts, and history."
								>
									Confirm permanent delete
								</Button>
							</form>
							<Button
								type="button"
								variant="ghost"
								onclick={closeConfirmPurge}
								ariaLabel="Cancel permanent delete"
							>
								Cancel
							</Button>
						{/if}
					</div>
				</div>
			{:else if activeTab === 'interviews'}
				<div
					id="app-tab-interviews"
					role="tabpanel"
					aria-labelledby="app-tab-interviews-btn"
					class="space-y-4"
				>
					<!-- Add interview form -->
					<form
						method="POST"
						action="?/addInterview"
						use:enhance={() => {
							return async ({ update }) => {
								await update({ reset: true });
							};
						}}
						class="rounded-md border border-border bg-surface-2 p-3"
					>
						<input type="hidden" name="applicationId" value={app.id} />
						<div class="grid grid-cols-1 gap-3 sm:grid-cols-4">
							<div>
								<label for="int-kind" class="block text-xs font-medium text-muted">Kind</label>
								<select
									id="int-kind"
									name="kind"
									required
									class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
								>
									<option value="phone_screen">Phone screen</option>
									<option value="technical">Technical</option>
									<option value="onsite">Onsite</option>
									<option value="final">Final</option>
									<option value="coffee_chat">Coffee chat</option>
									<option value="other">Other</option>
								</select>
							</div>
							<div>
								<label for="int-when" class="block text-xs font-medium text-muted">When</label>
								<input
									id="int-when"
									name="scheduledAt"
									type="datetime-local"
									required
									class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
								/>
							</div>
							<div>
								<label for="int-with" class="block text-xs font-medium text-muted">With</label>
								<input
									id="int-with"
									name="withName"
									type="text"
									placeholder="Name"
									class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm text-fg placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
								/>
							</div>
							<div>
								<label for="int-notes" class="block text-xs font-medium text-muted">Notes</label>
								<input
									id="int-notes"
									name="notes"
									type="text"
									placeholder="Optional"
									class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm text-fg placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
								/>
							</div>
						</div>
						<div class="mt-3 flex justify-end">
							<Button type="submit" variant="primary" size="sm" ariaLabel="Schedule interview">
								Schedule
							</Button>
						</div>
					</form>

					{#if sortedInterviews.length === 0}
						<p class="text-sm text-muted">No interviews scheduled yet.</p>
					{:else}
						<ul class="divide-y divide-border">
							{#each sortedInterviews as iv (iv.id)}
								<li class="py-3">
									<div class="flex items-baseline justify-between gap-3">
										<div>
											<div class="text-sm font-medium text-fg capitalize">
												{iv.kind.replace('_', ' ')}
											</div>
											<div class="mt-0.5 text-xs text-muted">
												{formatDateShort(iv.scheduledAt)}
												{#if iv.withName}
													· with {iv.withName}{/if}
											</div>
										</div>
										<span class="font-mono text-[10px] tracking-wide text-muted uppercase">
											{iv.outcome ?? 'pending'}
										</span>
									</div>
									{#if iv.notes}
										<p class="mt-1 text-sm text-muted">{iv.notes}</p>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{:else if activeTab === 'contacts'}
				<div
					id="app-tab-contacts"
					role="tabpanel"
					aria-labelledby="app-tab-contacts-btn"
					class="space-y-4"
				>
					<!-- Add contact form -->
					<form
						method="POST"
						action="?/addContact"
						use:enhance={() => {
							return async ({ update }) => {
								await update({ reset: true });
							};
						}}
						class="rounded-md border border-border bg-surface-2 p-3"
					>
						<input type="hidden" name="applicationId" value={app.id} />
						<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
							<div>
								<label for="ct-name" class="block text-xs font-medium text-muted">Name</label>
								<input
									id="ct-name"
									name="name"
									type="text"
									required
									class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
								/>
							</div>
							<div>
								<label for="ct-role" class="block text-xs font-medium text-muted">Role</label>
								<input
									id="ct-role"
									name="role"
									type="text"
									placeholder="Recruiter"
									class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm text-fg placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
								/>
							</div>
							<div>
								<label for="ct-email" class="block text-xs font-medium text-muted">Email</label>
								<input
									id="ct-email"
									name="email"
									type="email"
									class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm text-fg placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
								/>
							</div>
						</div>
						<div class="mt-3">
							<label for="ct-notes" class="block text-xs font-medium text-muted">Notes</label>
							<input
								id="ct-notes"
								name="notes"
								type="text"
								placeholder="Optional"
								class="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
							/>
						</div>
						<div class="mt-3 flex justify-end">
							<Button type="submit" variant="primary" size="sm" ariaLabel="Add contact">Add</Button>
						</div>
					</form>

					{#if contacts.length === 0}
						<p class="text-sm text-muted">No contacts yet.</p>
					{:else}
						<ul class="divide-y divide-border">
							{#each contacts as c (c.id)}
								<li class="py-3">
									<div class="text-sm font-medium text-fg">
										{c.name}{#if c.role}<span class="ml-1.5 text-xs text-muted">{c.role}</span>{/if}
									</div>
									{#if c.email}
										<a
											href="mailto:{c.email}"
											class="text-xs text-fg underline-offset-2 hover:underline"
										>
											{c.email}
										</a>
									{/if}
									{#if c.notes}
										<p class="mt-1 text-sm text-muted">{c.notes}</p>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{:else if activeTab === 'activity'}
				<div
					id="app-tab-activity"
					role="tabpanel"
					aria-labelledby="app-tab-activity-btn"
					class="space-y-3"
				>
					{#if sortedActivities.length === 0}
						<p class="text-sm text-muted">No activity recorded yet.</p>
					{:else}
						<ol class="relative space-y-3 border-s border-border ps-5">
							{#each sortedActivities as ev (ev.id)}
								<li class="relative">
									<span
										class="absolute inset-s-[-1.4rem] top-1 inline-block size-2 rounded-full bg-accent"
										aria-hidden="true"
									></span>
									<div class="flex items-baseline justify-between gap-3">
										<div class="text-sm text-fg">
											{ev.kind === 'stage_changed' && ev.fromStage && ev.toStage
												? `Stage: ${ev.fromStage.replace('_', ' ')} → ${ev.toStage.replace('_', ' ')}`
												: ev.kind === 'created'
													? 'Created'
													: ev.kind === 'interview_scheduled'
														? 'Interview scheduled'
														: ev.kind === 'contact_added'
															? 'Contact added'
															: ev.kind.replace('_', ' ')}
										</div>
										<div class="text-xs text-muted" title={formatDateShort(ev.occurredAt)}>
											{formatRelative(ev.occurredAt)}
										</div>
									</div>
									{#if ev.note}
										<p class="mt-0.5 text-sm text-muted">{ev.note}</p>
									{/if}
								</li>
							{/each}
						</ol>
					{/if}
				</div>
			{/if}
		</div>

		<!--
			Edit form lives below the tabs, always visible. Keeps the
			detail modal single-page so we don't need a separate "edit" tab.
		-->
		{#if activeTab === 'overview'}
			<div class="border-t border-border px-6 py-5">
				<h3 class="mb-3 font-mono text-[11px] tracking-widest text-muted uppercase">
					Edit details
				</h3>
				<ApplicationForm
					{application}
					{resumes}
					result={form?.operation === 'edit' && form.errors ? form : undefined}
					onsuccess={() => (open = false)}
				/>
			</div>
		{/if}
	{/if}
</Modal>
