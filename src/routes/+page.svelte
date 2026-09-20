<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { ActionData } from './$types';

	type Mode = 'signin' | 'signup';

	let { form }: { form: ActionData } = $props();

	/** `?signedout=1` → calm confirmation banner (set by the pending-approval
	 * sign-out and the dashboard sign-out). */
	const justSignedOut = $derived(page.url.searchParams.get('signedout') === '1');

	// Active mode for the tabs. Drives what the form submits and which
	// heading the user sees. Reacts to `form.mode` after a server failure so
	// a failed sign-up lands the user back on the sign-up tab.
	let mode: Mode = $state('signin');
	let submitting = $state(false);
	$effect(() => {
		if (form?.mode === 'signup' || form?.mode === 'signin') {
			mode = form.mode;
		}
	});

	// Field-level errors surfaced from the server action.
	const emailError = $derived(form?.fieldErrors?.emailOrUsername);
	const passwordError = $derived(form?.fieldErrors?.password);
	const confirmError = $derived(form?.fieldErrors?.confirm);
	const formError = $derived(form?.fieldErrors?._form);

	// Heading id is referenced by the form via aria-labelledby so screen
	// readers know the form context.
	const headingId = 'auth-heading';
	const signinPanelId = 'auth-panel-signin';
	const signupPanelId = 'auth-panel-signup';

	function select(next: Mode) {
		mode = next;
	}

	// WAI-ARIA tabs pattern: arrow keys move between tabs, Home/End jump to
	// the ends. Focus follows selection so keyboard users aren't stranded.
	function onTabKeydown(e: KeyboardEvent) {
		const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
		if (!keys.includes(e.key)) return;
		e.preventDefault();
		const prev = mode === 'signin' ? 'signup' : 'signin';
		const nextMode: Mode =
			e.key === 'ArrowRight' || e.key === 'End'
				? 'signup'
				: e.key === 'ArrowLeft' || e.key === 'Home'
					? 'signin'
					: prev;
		mode = nextMode;
		// Focus the newly selected tab.
		queueMicrotask(() => {
			const id = nextMode === 'signin' ? 'auth-tab-signin' : 'auth-tab-signup';
			document.getElementById(id)?.focus();
		});
	}
</script>

<svelte:head>
	<title>Sign in · Job Tracker</title>
	<meta name="robots" content="noindex" />
	<meta name="description" content="Sign in to your private job application tracker." />
</svelte:head>

<!--
	Authentication surface.
	- Two tabs (sign in / create account) on the same page; the server action
	  branches on the `mode` field so we don't need separate routes.
	- Form is progressive-enhanced via use:enhance; works without JS.
	- All copy is concise; no marketing flourish.
-->
<main
	id="main"
	class="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-12 sm:py-20"
>
	{#if justSignedOut}
		<div
			role="status"
			class="bg-success-bg mb-6 rounded-md border border-success px-3 py-2.5 text-sm text-success"
		>
			Signed out successfully.
		</div>
	{/if}

	<header class="mb-8">
		<p class="font-mono text-xs tracking-widest text-muted uppercase">Job Tracker</p>
		<h1
			id={headingId}
			class="mt-2 text-3xl font-semibold tracking-tight text-balance text-fg sm:text-4xl"
		>
			{mode === 'signin' ? 'Welcome back' : 'Create your account'}
		</h1>
		<p class="mt-2 text-sm text-pretty text-muted sm:text-base">
			{mode === 'signin'
				? 'Sign in to manage your job applications.'
				: 'A private tracker for you and a small group.'}
		</p>
	</header>

	<!--
		Tab strip. role="tablist" with two role="tab" buttons that point at the
		tabpanel each one reveals. We don't actually swap panels — we swap
		mode and re-render the same form with one extra field. The aria
		wiring is still correct for AT.
	-->
	<div role="tablist" aria-label="Authentication mode" class="mb-6 flex border-b border-border">
		<button
			type="button"
			role="tab"
			id="auth-tab-signin"
			aria-controls={signinPanelId}
			aria-selected={mode === 'signin'}
			tabindex={mode === 'signin' ? 0 : -1}
			onkeydown={onTabKeydown}
			onclick={() => select('signin')}
			class="-mb-px cursor-pointer border-b-2 px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
			class:border-accent={mode === 'signin'}
			class:text-fg={mode === 'signin'}
			class:border-transparent={mode !== 'signin'}
			class:text-muted={mode !== 'signin'}
		>
			Sign in
		</button>
		<button
			type="button"
			role="tab"
			id="auth-tab-signup"
			aria-controls={signupPanelId}
			aria-selected={mode === 'signup'}
			tabindex={mode === 'signup' ? 0 : -1}
			onkeydown={onTabKeydown}
			onclick={() => select('signup')}
			class="-mb-px cursor-pointer border-b-2 px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
			class:border-accent={mode === 'signup'}
			class:text-fg={mode === 'signup'}
			class:border-transparent={mode !== 'signup'}
			class:text-muted={mode !== 'signup'}
		>
			Create account
		</button>
	</div>

	<form
		method="POST"
		novalidate
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				await update({ reset: false });
				submitting = false;
			};
		}}
		aria-labelledby={headingId}
		aria-describedby={formError ? 'auth-form-error' : undefined}
		class="space-y-5"
	>
		<!-- Hidden mode field tells the server action which branch to run. -->
		<input type="hidden" name="mode" value={mode} />

		<!--
			Hidden username field present so password managers can latch onto
			the form. Empty by default; safe to submit.
		-->
		<input
			type="text"
			name="username"
			tabindex="-1"
			autocomplete="username"
			aria-hidden="true"
			class="sr-only"
			value=""
		/>

		<div
			role="tabpanel"
			id={mode === 'signin' ? signinPanelId : signupPanelId}
			aria-labelledby={mode === 'signin' ? 'auth-tab-signin' : 'auth-tab-signup'}
			class="space-y-5"
		>
			<!-- Email (signup) / username or email (signin) -->
			<div class="space-y-1.5">
				<label for="emailOrUsername" class="block text-sm font-medium text-fg">
					{mode === 'signin' ? 'Username or email' : 'Email'}
				</label>
				<input
					id="emailOrUsername"
					name="emailOrUsername"
					type={mode === 'signin' ? 'text' : 'email'}
					autocomplete="username"
					spellcheck="false"
					autocapitalize="none"
					required
					value={form?.emailOrUsername ?? ''}
					aria-invalid={emailError ? 'true' : undefined}
					aria-describedby={emailError ? 'emailOrUsername-error' : 'emailOrUsername-hint'}
					class="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-fg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
					class:border-danger={emailError}
					disabled={submitting}
					placeholder={mode === 'signin' ? 'ada or ada@example.com' : 'you@example.com'}
				/>
				{#if emailError}
					<p id="emailOrUsername-error" class="text-sm text-danger" role="alert">
						{emailError}
					</p>
				{:else}
					<p id="emailOrUsername-hint" class="text-xs text-muted">
						{mode === 'signin'
							? 'You registered with either. Either works here.'
							: 'You will use this to sign in every time.'}
					</p>
				{/if}
			</div>

			<!-- Password -->
			<div class="space-y-1.5">
				<label for="password" class="block text-sm font-medium text-fg"> Password </label>
				<input
					id="password"
					name="password"
					type="password"
					autocomplete={mode === 'signin' ? 'current-password' : 'new-password'}
					minlength="8"
					maxlength="128"
					required
					aria-invalid={passwordError ? 'true' : undefined}
					aria-describedby={passwordError ? 'password-error' : undefined}
					class="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-fg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
					class:border-danger={passwordError}
					disabled={submitting}
				/>
				{#if passwordError}
					<p id="password-error" class="text-sm text-danger" role="alert">{passwordError}</p>
				{:else if mode === 'signup'}
					<p class="text-xs text-muted">At least 8 characters.</p>
				{/if}
			</div>

			<!-- Confirm password (sign-up only) -->
			{#if mode === 'signup'}
				<div class="space-y-1.5">
					<label for="confirm" class="block text-sm font-medium text-fg"> Confirm password </label>
					<input
						id="confirm"
						name="confirm"
						type="password"
						autocomplete="new-password"
						minlength="8"
						maxlength="128"
						required
						aria-invalid={confirmError ? 'true' : undefined}
						aria-describedby={confirmError ? 'confirm-error' : undefined}
						class="w-full rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-fg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
						class:border-danger={confirmError}
						disabled={submitting}
					/>
					{#if confirmError}
						<p id="confirm-error" class="text-sm text-danger" role="alert">{confirmError}</p>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Form-level error (mode mismatch, server fault, etc.) -->
		{#if formError}
			<div
				id="auth-form-error"
				role="alert"
				aria-live="polite"
				class="rounded-md border border-danger bg-danger-bg px-3 py-2.5 text-sm text-danger"
			>
				{formError}
			</div>
		{/if}

		<button
			type="submit"
			disabled={submitting}
			aria-busy={submitting}
			class="inline-flex w-full cursor-pointer items-center justify-center rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
		>
			{#if submitting}
				<span
					aria-hidden="true"
					class="mr-2 inline-block size-3 animate-spin rounded-full border border-current border-t-transparent"
				></span>
				{mode === 'signin' ? 'Signing in…' : 'Creating account…'}
			{:else}
				{mode === 'signin' ? 'Sign in' : 'Create account'}
			{/if}
		</button>
	</form>

	<footer class="mt-8 border-t border-border text-xs text-muted">
		<p class="mt-4 text-pretty">Private tool. Your data stays in your account only.</p>
	</footer>
</main>
