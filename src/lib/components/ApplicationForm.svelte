<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import type {
		Application,
		ApplicationStage,
		ApplicationStatus,
		Resume,
		WorkArrangement
	} from '$lib/types';
	import { STAGES, STATUSES, ARRANGEMENTS } from '$lib/constants/stages';
	import { formatBytes } from '$lib/constants/resumes';
	import {
		defaultSalaryFormValues,
		type SalaryFormValues,
		type SalaryShapeValue
	} from '$lib/utils/money';
	import { toDateInputValue } from '$lib/utils/dates';
	import { enhanceErrorMessage } from '$lib/utils/enhance';
	import Button from './Button.svelte';
	import SalaryInput from './SalaryInput.svelte';

	/**
	 * Per-field messages the create/edit actions can return. Mirrors the
	 * `errors` object built in `dashboard/+page.server.ts`; anything the
	 * server adds there shows up in the summary banner via
	 * `unfieldedError` even if it has no field of its own.
	 */
	interface FormErrors {
		company?: string;
		role?: string;
		stage?: string;
		status?: string;
		workArrangement?: string;
		postingUrl?: string;
		postingDescription?: string;
		notes?: string;
		tags?: string;
		resume?: string;
		salary?: string;
		appliedAt?: string;
		nextActionAt?: string;
		id?: string;
		form?: string;
	}

	interface Props {
		/** When set, the form edits this application (POSTs to ?/edit). */
		application?: Application;
		/** When true, the form creates a new application (POSTs to ?/create). */
		create?: boolean;
		/** The signed-in user's uploaded resumes — the attach options. Comes
		 * from the dashboard load, so it is already scoped to this account. */
		resumes?: readonly Resume[];
		/** Result of the create/edit form action from the server, threaded
		 * via `page.form`. Carries echoed values + per-field errors when a
		 * validation failure keeps the modal open. */
		result?: {
			values?: Record<string, unknown>;
			errors?: Record<string, string>;
			operation?: string;
		};
		/** Called once the server confirms a successful create/edit. The
		 * modal that hosts this form owns its open state, so it closes
		 * itself here — the form never touches navigation. */
		onsuccess?: () => void;
	}

	let { application, create = false, resumes = [], result, onsuccess }: Props = $props();

	// In-flight flag: disables the submit button while the action runs so
	// a slow response can't turn into duplicate submissions.
	let submitting = $state(false);

	// A failed fetch is not a validation failure — there is no field to
	// point at, and applying the error result would replace the whole page
	// (closing this modal and discarding everything typed). Reported in
	// the alert region at the bottom of the form instead.
	let networkError = $state<string | null>(null);

	// Local form state. `application` provides the defaults when editing;
	// `result.values` is the echo-back from a server-side validation failure.
	//
	// The *field defaults* are a mount-time snapshot (untracked), and that
	// is correct: the create modal is mounted inside `Modal`'s `{#if open}`,
	// so it remounts on every open and picks up the echo-back as it
	// initialises. The edit form inside ApplicationDetailModal does NOT
	// remount when the action fails, so its fields have to stay live local
	// state — which they are, via `bind:value`.
	const initial = untrack(() => {
		const values = result?.values as
			| {
					company?: string;
					role?: string;
					stage?: ApplicationStage;
					status?: ApplicationStatus;
					workArrangement?: WorkArrangement;
					postingUrl?: string | null;
					postingDescription?: string | null;
					notes?: string | null;
					resumeId?: string | null;
					appliedAt?: string | null;
					nextActionAt?: string | null;
					tagsRaw?: string;
					salaryShape?: SalaryShapeValue;
					salaryCurrency?: string;
					salaryExact?: string;
					salaryMin?: string;
					salaryMax?: string;
			  }
			| undefined;

		// Salary: prefer echo-back values, then existing application salary.
		const echoSalary: SalaryFormValues | undefined =
			values?.salaryShape !== undefined
				? {
						shape: values.salaryShape,
						currency: (values.salaryCurrency as SalaryFormValues['currency']) ?? 'USD',
						exact: values.salaryExact ?? '',
						min: values.salaryMin ?? '',
						max: values.salaryMax ?? ''
					}
				: undefined;
		const salaryDefaults = echoSalary ?? defaultSalaryFormValues(application?.salary ?? null);

		return {
			form: {
				company: values?.company ?? application?.company ?? '',
				role: values?.role ?? application?.role ?? '',
				stage: values?.stage ?? application?.stage ?? 'applied',
				status: values?.status ?? application?.status ?? 'active',
				postingUrl: values?.postingUrl ?? application?.postingUrl ?? '',
				postingDescription: values?.postingDescription ?? application?.postingDescription ?? '',
				notes: values?.notes ?? application?.notes ?? '',
				resumeId: values?.resumeId ?? application?.resumeId ?? '',
				workArrangement: values?.workArrangement ?? application?.workArrangement ?? 'remote',
				appliedAt: values?.appliedAt ?? toDateInputValue(application?.appliedAt),
				nextActionAt: values?.nextActionAt ?? toDateInputValue(application?.nextActionAt),
				tagsRaw: values?.tagsRaw ?? application?.tags?.join(', ') ?? '',
				salary: salaryDefaults
			}
		};
	});

	/**
	 * Errors, by contrast, MUST stay reactive.
	 *
	 * This used to be pulled out of the same untracked snapshot as the field
	 * defaults, which silently broke the edit form: a failed `?/edit` post
	 * updates `page.form`, this component's `result` prop changes, and a
	 * snapshot taken at mount never sees it — so the server's messages were
	 * dropped on the floor and the user got a form that simply refused to
	 * save, with nothing explaining why. Deriving from the prop means the
	 * error state appears the moment the action answers, in both the create
	 * and the edit host, and clears again on the next success.
	 */
	const errors = $derived((result?.errors ?? undefined) as FormErrors | undefined);

	const form = initial.form;

	let company = $state(form.company);
	let role = $state(form.role);
	let stage = $state<ApplicationStage>(form.stage);
	let status = $state<ApplicationStatus>(form.status);
	let workArrangement = $state<WorkArrangement>(form.workArrangement);
	let postingUrl = $state(form.postingUrl);
	let postingDescription = $state(form.postingDescription);
	let notes = $state(form.notes);
	let resumeId = $state(form.resumeId);
	let appliedAt = $state(form.appliedAt);
	let nextActionAt = $state(form.nextActionAt);
	let tagsRaw = $state(form.tagsRaw);

	// Salary fields: shape controls which amount inputs render.
	let salaryShape = $state<SalaryShapeValue>(form.salary.shape);
	let salaryCurrency = $state(form.salary.currency);
	let salaryExact = $state(form.salary.exact);
	let salaryMin = $state(form.salary.min);
	let salaryMax = $state(form.salary.max);

	// Tags input is free-form; lowercase-hyphenated per design.
	// Normalize on blur so the user sees immediate feedback.
	function normalizeTags(input: string): string {
		return input
			.split(',')
			.map((t) => t.trim().toLowerCase().replace(/\s+/g, '-'))
			.filter(Boolean)
			.join(', ');
	}

	/**
	 * Errors this form draws next to their own input. Anything else — `tags`,
	 * `notes`, `postingUrl` — has no field of its own, so its message has to
	 * surface in the summary banner. Listing the keys explicitly (rather than
	 * "any error at all") means a new server-side check can never fail
	 * silently just because nobody added a paragraph for it.
	 */
	const INLINE_ERROR_KEYS = ['company', 'role', 'salary', 'resume'] as const;

	const formError = $derived(Object.keys(errors ?? {}).length > 0);
	const unfieldedError = $derived(
		Object.entries(errors ?? {}).find(
			([key]) => !(INLINE_ERROR_KEYS as readonly string[]).includes(key)
		)?.[1] ?? null
	);

	const inputClass =
		'w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
	const labelClass = 'block text-sm font-medium text-fg';
</script>

<!--
		`novalidate` because the browser's constraint validation is both
		redundant and wrong for this form. Redundant: the actions validate
		every field and return per-field messages. Wrong: `postingUrl` is
		`type="url"`, and the browser rejects a bare host ("vercel.com/jobs")
		with "Please enter a URL" — but `sanitizePostingUrl` on the server
		deliberately accepts a bare host and prefixes https://, because that
		is what people actually paste. Native validation fired first, so the
		form silently refused to submit and the modal just sat there with no
		explanation and no request in the log. The server is the single
		validation authority; the `type` stays for mobile keyboards and for
		semantic meaning, and the sign-in form does the same thing.
	-->
<form
	method="POST"
	action={create ? '?/create' : '?/edit'}
	novalidate
	use:enhance={() => {
		submitting = true;
		networkError = null;
		return async ({ result, update }) => {
			submitting = false;
			if (result.type === 'error') {
				networkError = enhanceErrorMessage(result.error);
				return;
			}
			if (result.type === 'success') {
				// Server-side success: refresh the dashboard data and hand
				// the "close me" decision to the host modal. No goto → no
				// scroll jump, no re-navigation.
				await update({ reset: true, invalidateAll: true });
				onsuccess?.();
			} else {
				// Failure: keep the typed values (echo-back errors render
				// above the fields) and stay open.
				await update({ reset: false, invalidateAll: false });
			}
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
			<label for="app-company" class={labelClass}>Company</label>
			<input
				id="app-company"
				name="company"
				type="text"
				required
				bind:value={company}
				aria-invalid={errors?.company ? 'true' : undefined}
				aria-describedby={errors?.company ? 'app-company-error' : undefined}
				class={inputClass}
				class:border-danger={errors?.company}
			/>
			{#if errors?.company}
				<p id="app-company-error" class="text-xs text-danger" role="alert">{errors.company}</p>
			{/if}
		</div>

		<div class="space-y-1.5">
			<label for="app-role" class={labelClass}>Role</label>
			<input
				id="app-role"
				name="role"
				type="text"
				required
				bind:value={role}
				aria-invalid={errors?.role ? 'true' : undefined}
				aria-describedby={errors?.role ? 'app-role-error' : undefined}
				class={inputClass}
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
			<label for="app-stage" class={labelClass}>Stage</label>
			<select id="app-stage" name="stage" bind:value={stage} class={inputClass}>
				{#each STAGES as s (s.value)}
					<option value={s.value}>{s.label}</option>
				{/each}
			</select>
		</div>

		<div class="space-y-1.5">
			<label for="app-status" class={labelClass}>Status</label>
			<select id="app-status" name="status" bind:value={status} class={inputClass}>
				{#each STATUSES as s (s.value)}
					<option value={s.value}>{s.label}</option>
				{/each}
			</select>
		</div>

		<div class="space-y-1.5">
			<label for="app-arr" class={labelClass}>Work</label>
			<select id="app-arr" name="workArrangement" bind:value={workArrangement} class={inputClass}>
				{#each ARRANGEMENTS as a (a.value)}
					<option value={a.value}>{a.label}</option>
				{/each}
			</select>
		</div>
	</div>

	<!-- Applied date + Next action date -->
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<div class="space-y-1.5">
			<label for="app-applied" class={labelClass}>Applied date</label>
			<input
				id="app-applied"
				name="appliedAt"
				type="date"
				bind:value={appliedAt}
				class={inputClass}
			/>
		</div>

		<div class="space-y-1.5">
			<label for="app-next-action" class={labelClass}>Next action date</label>
			<input
				id="app-next-action"
				name="nextActionAt"
				type="date"
				bind:value={nextActionAt}
				class={inputClass}
			/>
			<p class="text-xs text-muted">Drives "Interviews next 30 days" KPI and sort.</p>
		</div>
	</div>

	<!-- Posting URL -->
	<div class="space-y-1.5">
		<label for="app-url" class={labelClass}>Posting URL</label>
		<input
			id="app-url"
			name="postingUrl"
			type="url"
			bind:value={postingUrl}
			placeholder="https://"
			class="{inputClass} placeholder:text-muted"
		/>
	</div>

	<!-- Posting description -->
	<div class="space-y-1.5">
		<label for="app-posting-desc" class={labelClass}>Posting description</label>
		<textarea
			id="app-posting-desc"
			name="postingDescription"
			bind:value={postingDescription}
			placeholder="Optional job description text"
			rows="3"
			class="{inputClass} placeholder:text-muted"></textarea>
	</div>

	<!-- Notes -->
	<div class="space-y-1.5">
		<label for="app-notes" class={labelClass}>Notes</label>
		<textarea
			id="app-notes"
			name="notes"
			bind:value={notes}
			placeholder="Anything you want to remember about this application"
			rows="3"
			class="{inputClass} placeholder:text-muted"></textarea>
	</div>

	<!-- Resume: attach the version that was actually sent, so the record
		can answer "which CV did I use for this one?" months later. -->
	<div class="space-y-1.5">
		<label for="app-resume" class={labelClass}>Resume</label>
		<select
			id="app-resume"
			name="resumeId"
			bind:value={resumeId}
			aria-describedby="app-resume-hint"
			class={inputClass}
		>
			<option value="">None</option>
			{#each resumes as r (r.id)}
				<option value={r.id}>{r.name} · {formatBytes(r.sizeBytes)}</option>
			{/each}
		</select>
		<p id="app-resume-hint" class="text-xs text-muted">
			{#if resumes.length === 0}
				No resumes yet. Upload one with the Resumes button on the dashboard.
			{:else}
				Pick the version you sent. It stays linked to this application.
			{/if}
		</p>
		{#if errors?.resume}
			<p class="text-xs text-danger" role="alert">{errors.resume}</p>
		{/if}
	</div>

	<!-- Compensation (Modular SalaryInput component) -->
	<SalaryInput
		bind:shape={salaryShape}
		bind:currency={salaryCurrency}
		bind:exact={salaryExact}
		bind:min={salaryMin}
		bind:max={salaryMax}
		error={errors?.salary}
		{inputClass}
	/>

	<!-- Tags -->
	<div class="space-y-1.5">
		<label for="app-tags" class={labelClass}>Tags</label>
		<input
			id="app-tags"
			name="tags"
			type="text"
			bind:value={tagsRaw}
			onblur={() => (tagsRaw = normalizeTags(tagsRaw))}
			placeholder="remote, fintech, high-priority"
			class="{inputClass} placeholder:text-muted"
		/>
		<p class="text-xs text-muted">
			Comma-separated. Lowercase, hyphen-separated (e.g. dream-company).
		</p>
	</div>

	{#if networkError}
		<div
			role="alert"
			aria-live="polite"
			class="rounded-md border border-danger bg-danger-bg px-3 py-2 text-sm text-danger"
		>
			{networkError}
		</div>
	{:else if formError}
		<div
			role="alert"
			aria-live="polite"
			class="rounded-md border border-danger bg-danger-bg px-3 py-2 text-sm text-danger"
		>
			{unfieldedError ?? 'Fix the highlighted fields before saving.'}
		</div>
	{/if}

	<div class="flex justify-end gap-2">
		<Button
			type="submit"
			variant="primary"
			busy={submitting}
			disabled={submitting}
			ariaLabel={create ? 'Create application' : 'Save changes'}
			title={create ? 'Save this application and close' : 'Save your changes'}
		>
			{create ? 'Create application' : 'Save changes'}
		</Button>
	</div>
</form>
