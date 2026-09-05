<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import type {
		Application,
		ApplicationStage,
		ApplicationStatus,
		WorkArrangement
	} from '$lib/types';
	import { STAGES, STATUSES, ARRANGEMENTS } from '$lib/constants/stages';
	import Button from './Button.svelte';

	type FieldErrors = {
		company?: string;
		role?: string;
		stage?: string;
		status?: string;
		workArrangement?: string;
	};

	type DefaultValues = {
		company?: string;
		role?: string;
		stage?: ApplicationStage;
		status?: ApplicationStatus;
		workArrangement?: WorkArrangement;
		postingUrl?: string | null;
		appliedAt?: string | null;
		tagsRaw?: string;
	};

	interface Props {
		/** When set, the form edits this application (POSTs to ?/edit). */
		application?: Application;
		/** When true, the form creates a new application (POSTs to ?/create). */
		create?: boolean;
		/** Values echoed back from the server on a validation failure. */
		values?: DefaultValues;
		/** Field-level errors from the server on a validation failure. */
		errors?: FieldErrors;
		/** Operation tag, surfaced in the submit button label. */
		operation?: string;
	}

	let { application, create = false, values, errors, operation }: Props = $props();

	// Local form state. `application` provides the defaults when editing;
	// `values` is the echo-back from a server-side validation failure.
	// Per Svelte 5 best practices, we read props once (untracked) at
	// mount and don't sync live — the form is short-lived inside a
	// shallow-routed modal that remounts on each open.
	const init = (): {
		company: string;
		role: string;
		stage: ApplicationStage;
		status: ApplicationStatus;
		workArrangement: WorkArrangement;
		postingUrl: string;
		appliedAt: string;
		tagsRaw: string;
	} =>
		untrack(() => ({
			company: values?.company ?? application?.company ?? '',
			role: values?.role ?? application?.role ?? '',
			stage: values?.stage ?? application?.stage ?? 'applied',
			status: values?.status ?? application?.status ?? 'active',
			workArrangement: values?.workArrangement ?? application?.workArrangement ?? 'remote',
			postingUrl: values?.postingUrl ?? application?.postingUrl ?? '',
			appliedAt:
				values?.appliedAt ??
				(application?.appliedAt ? application.appliedAt.slice(0, 10) : '') ??
				'',
			tagsRaw: values?.tagsRaw ?? application?.tags?.join(', ') ?? ''
		}));
	const initial = init();

	let company = $state(initial.company);
	let role = $state(initial.role);
	let stage = $state<ApplicationStage>(initial.stage);
	let status = $state<ApplicationStatus>(initial.status);
	let workArrangement = $state<WorkArrangement>(initial.workArrangement);
	let postingUrl = $state(initial.postingUrl);
	let appliedAt = $state(initial.appliedAt);
	let tagsRaw = $state(initial.tagsRaw);

	// Tags input is free-form; lowercase-hyphenated per design.
	// Normalize on blur so the user sees immediate feedback.
	function normalizeTags(input: string): string {
		return input
			.split(',')
			.map((t) => t.trim().toLowerCase().replace(/\s+/g, '-'))
			.filter(Boolean)
			.join(', ');
	}

	const formError = $derived(
		errors?.company || errors?.role || errors?.stage || errors?.status || errors?.workArrangement
	);
	const isBusy = $derived(operation === 'create' || operation === 'edit');
</script>

<form
	method="POST"
	action={create ? '?/create' : '?/edit'}
	use:enhance={() => {
		return async ({ update }) => {
			await update({ reset: false });
		};
	}}
	class="space-y-5"
	aria-label={create ? 'Create new application' : `Edit ${application?.company ?? 'application'}`}
>
	{#if !create}
		<input type="hidden" name="id" value={application?.id ?? ''} />
	{/if}

	<!-- Company + Role -->
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<div class="space-y-1.5">
			<label for="app-company" class="block text-sm font-medium text-fg">Company</label>
			<input
				id="app-company"
				name="company"
				type="text"
				required
				bind:value={company}
				aria-invalid={errors?.company ? 'true' : undefined}
				aria-describedby={errors?.company ? 'app-company-error' : undefined}
				class="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
				class:border-danger={errors?.company}
			/>
			{#if errors?.company}
				<p id="app-company-error" class="text-xs text-danger" role="alert">{errors.company}</p>
			{/if}
		</div>

		<div class="space-y-1.5">
			<label for="app-role" class="block text-sm font-medium text-fg">Role</label>
			<input
				id="app-role"
				name="role"
				type="text"
				required
				bind:value={role}
				aria-invalid={errors?.role ? 'true' : undefined}
				aria-describedby={errors?.role ? 'app-role-error' : undefined}
				class="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
				class:border-danger={errors?.role}
			/>
			{#if errors?.role}
				<p id="app-role-error" class="text-xs text-danger" role="alert">{errors.role}</p>
			{/if}
		</div>
	</div>

	<!-- Stage + Status + Work arrangement -->
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
		<div class="space-y-1.5">
			<label for="app-stage" class="block text-sm font-medium text-fg">Stage</label>
			<select
				id="app-stage"
				name="stage"
				bind:value={stage}
				class="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
			>
				{#each STAGES as s (s.value)}
					<option value={s.value}>{s.label}</option>
				{/each}
			</select>
		</div>

		<div class="space-y-1.5">
			<label for="app-status" class="block text-sm font-medium text-fg">Status</label>
			<select
				id="app-status"
				name="status"
				bind:value={status}
				class="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
			>
				{#each STATUSES as s (s.value)}
					<option value={s.value}>{s.label}</option>
				{/each}
			</select>
		</div>

		<div class="space-y-1.5">
			<label for="app-arr" class="block text-sm font-medium text-fg">Work</label>
			<select
				id="app-arr"
				name="workArrangement"
				bind:value={workArrangement}
				class="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
			>
				{#each ARRANGEMENTS as a (a.value)}
					<option value={a.value}>{a.label}</option>
				{/each}
			</select>
		</div>
	</div>

	<!-- Posting URL + Applied date -->
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<div class="space-y-1.5">
			<label for="app-url" class="block text-sm font-medium text-fg">Posting URL</label>
			<input
				id="app-url"
				name="postingUrl"
				type="url"
				bind:value={postingUrl}
				placeholder="https://"
				class="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
			/>
		</div>

		<div class="space-y-1.5">
			<label for="app-applied" class="block text-sm font-medium text-fg">Applied date</label>
			<input
				id="app-applied"
				name="appliedAt"
				type="date"
				bind:value={appliedAt}
				class="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
			/>
		</div>
	</div>

	<!-- Tags -->
	<div class="space-y-1.5">
		<label for="app-tags" class="block text-sm font-medium text-fg">Tags</label>
		<input
			id="app-tags"
			name="tags"
			type="text"
			bind:value={tagsRaw}
			onblur={() => (tagsRaw = normalizeTags(tagsRaw))}
			placeholder="remote, fintech, high-priority"
			class="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
		/>
		<p class="text-xs text-muted">
			Comma-separated. Lowercase, hyphen-separated (e.g. dream-company).
		</p>
	</div>

	{#if formError}
		<div
			role="alert"
			aria-live="polite"
			class="rounded-md border border-danger bg-danger-bg px-3 py-2 text-sm text-danger"
		>
			Fix the highlighted fields before saving.
		</div>
	{/if}

	<div class="flex justify-end gap-2">
		<Button
			type="submit"
			variant="primary"
			busy={isBusy}
			ariaLabel={create ? 'Create application' : 'Save changes'}
		>
			{create ? 'Create application' : 'Save changes'}
		</Button>
	</div>
</form>
