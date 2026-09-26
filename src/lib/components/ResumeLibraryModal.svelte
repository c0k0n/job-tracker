<script lang="ts">
	/**
	 * The resume library: upload PDFs to R2, see which applications each one
	 * is attached to, open or download it, and delete it.
	 *
	 * Every mutation goes through /api/resumes and then `invalidateAll()`, so
	 * the list below is always the server's truth rather than a local copy
	 * that can drift. Deleting a resume detaches it from every application
	 * that pointed at it — the count is shown first so nobody loses a link by
	 * surprise.
	 */

	import { invalidateAll } from '$app/navigation';
	import { resolve as resolvePath } from '$app/paths';
	import Modal from './Modal.svelte';
	import Button from './Button.svelte';
	import {
		MAX_RESUMES_PER_USER,
		MAX_RESUME_BYTES,
		RESUME_CONTENT_TYPE,
		formatBytes
	} from '$lib/constants/resumes';
	import { formatDateShort } from '$lib/utils/dates';
	import type { Resume } from '$lib/types';

	interface Props {
		/** The signed-in user's resumes, from the dashboard load. */
		resumes: readonly Resume[];
		/** Bindable open state — the dashboard owns it; Modal flips it false
		 * on Esc/backdrop/X through the bind:open chain. */
		open?: boolean;
	}

	let { resumes, open = $bindable(false) }: Props = $props();

	let file = $state<File | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	/** One flag for upload + delete: they can't usefully run at once. */
	let busy = $state(false);
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);
	/** Two-click delete: the id awaiting confirmation, or null. */
	let confirmingId = $state<string | null>(null);

	const atCapacity = $derived(resumes.length >= MAX_RESUMES_PER_USER);

	function resetFileInput() {
		if (fileInput) fileInput.value = '';
		file = null;
	}

	function onFileChange(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const picked = input.files?.[0] ?? null;
		error = null;
		notice = null;
		if (!picked) {
			file = null;
			return;
		}
		// Courtesy checks. The route re-checks size and sniffs the real magic
		// bytes — this only spares the user a pointless round-trip. `type` can
		// be empty on some platforms, in which case we let the server decide.
		if (picked.size > MAX_RESUME_BYTES) {
			error = `That file is ${formatBytes(picked.size)}. The limit is ${formatBytes(MAX_RESUME_BYTES)}.`;
			resetFileInput();
			return;
		}
		if (picked.type && picked.type !== RESUME_CONTENT_TYPE) {
			error = 'Only PDF files are accepted.';
			resetFileInput();
			return;
		}
		file = picked;
	}

	async function upload() {
		if (!file || busy) return;
		busy = true;
		error = null;
		notice = null;
		try {
			const body = new FormData();
			body.append('file', file);
			const res = await fetch(resolvePath('/api/resumes'), { method: 'POST', body });
			const data = await res.json().catch(() => null);
			if (!res.ok) {
				throw new Error(
					(data as { error?: string } | null)?.error ?? `Upload failed (${res.status}).`
				);
			}
			const name = (data as { resume?: { name?: string } } | null)?.resume?.name ?? 'Resume';
			resetFileInput();
			notice = `${name} uploaded. Attach it from any application's edit form.`;
			await invalidateAll();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Upload failed. Please try again.';
		} finally {
			busy = false;
		}
	}

	async function remove(resume: Resume) {
		if (busy) return;
		busy = true;
		error = null;
		notice = null;
		try {
			const res = await fetch(resolvePath(`/api/resumes/${resume.id}`), { method: 'DELETE' });
			const data = await res.json().catch(() => null);
			if (!res.ok) {
				throw new Error(
					(data as { error?: string } | null)?.error ?? `Delete failed (${res.status}).`
				);
			}
			const detached = (data as { detached?: number } | null)?.detached ?? 0;
			confirmingId = null;
			notice =
				detached > 0
					? `${resume.name} deleted and detached from ${detached} application${
							detached === 1 ? '' : 's'
						}.`
					: `${resume.name} deleted.`;
			await invalidateAll();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Delete failed. Please try again.';
		} finally {
			busy = false;
		}
	}
</script>

<Modal bind:open title="Resume library" subtitle="Upload once, attach to any application">
	<div class="space-y-5">
		<!-- Upload -->
		<div
			role="region"
			aria-labelledby="resume-upload-heading"
			class="rounded-md border border-border bg-surface-2 p-4"
		>
			<h3
				id="resume-upload-heading"
				class="mb-2 font-mono text-[11px] tracking-widest text-muted uppercase"
			>
				Upload a resume
			</h3>

			{#if atCapacity}
				<p class="text-sm text-muted">
					You have {resumes.length} of {MAX_RESUMES_PER_USER} resumes stored. Delete one to add another.
				</p>
			{:else}
				<div class="space-y-3">
					<label for="resume-file" class="block text-sm font-medium text-fg">PDF file</label>
					<input
						id="resume-file"
						bind:this={fileInput}
						type="file"
						accept="application/pdf,.pdf"
						disabled={busy}
						onchange={onFileChange}
						aria-describedby="resume-file-hint"
						class="block w-full cursor-pointer rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg file:mr-3 file:rounded-sm file:border-0 file:bg-accent file:px-3 file:py-1.5 file:font-medium file:text-accent-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
					/>
					<p id="resume-file-hint" class="text-xs text-muted">
						PDF only, up to {formatBytes(MAX_RESUME_BYTES)}. Stored privately in your Cloudflare
						account.
					</p>

					{#if file}
						<div
							class="flex items-center justify-between gap-3 rounded-sm bg-surface px-3 py-2 text-xs"
						>
							<span class="truncate font-mono">{file.name} · {formatBytes(file.size)}</span>
							<button
								type="button"
								onclick={resetFileInput}
								disabled={busy}
								class="cursor-pointer text-muted underline-offset-2 hover:text-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
							>
								Remove
							</button>
						</div>
						<div class="flex justify-end pt-1">
							<!-- `busy` on Button disables it, sets aria-busy and
								renders the spinner — better than swapping the label. -->
							<Button
								type="button"
								variant="primary"
								size="sm"
								{busy}
								onclick={upload}
								ariaLabel={`Upload ${file.name}`}
							>
								Upload
							</Button>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Feedback. `status` is polite; `alert` interrupts for errors. -->
		{#if notice}
			<p class="text-xs text-muted" role="status">{notice}</p>
		{/if}
		{#if error}
			<p class="text-xs text-danger" role="alert">{error}</p>
		{/if}

		<!-- Library -->
		<div role="region" aria-labelledby="resume-library-heading">
			<h3
				id="resume-library-heading"
				class="mb-2 font-mono text-[11px] tracking-widest text-muted uppercase"
			>
				Your resumes · {resumes.length}
			</h3>

			{#if resumes.length === 0}
				<p class="text-sm text-muted">
					No resumes yet. Upload one and it will be available to attach to any application.
				</p>
			{:else}
				<ul class="divide-y divide-border">
					{#each resumes as r (r.id)}
						<li class="py-3">
							<div class="flex items-start justify-between gap-3">
								<div class="min-w-0 flex-1">
									<div class="truncate text-sm font-medium text-fg">{r.name}</div>
									<div class="truncate text-xs text-muted">
										{formatBytes(r.sizeBytes)} · added {formatDateShort(r.createdAt)} ·
										{r.usedBy === 0
											? 'not attached'
											: `attached to ${r.usedBy} application${r.usedBy === 1 ? '' : 's'}`}
									</div>
								</div>
								<div class="flex shrink-0 items-center gap-2 text-xs">
									<!-- resolve() inlined: the ESLint rule can't see through a
										helper function. `download` uses the native attribute
										rather than ?download=1 so the URL stays a plain path. -->
									<a
										href={resolvePath(`/api/resumes/${r.id}`)}
										target="_blank"
										rel="noreferrer"
										aria-label={`Open ${r.name} in a new tab`}
										class="rounded-sm px-2 py-1 text-muted underline-offset-2 hover:text-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
									>
										Open ↗
									</a>
									<a
										href={resolvePath(`/api/resumes/${r.id}`)}
										download={r.name}
										aria-label={`Download ${r.name}`}
										class="rounded-sm px-2 py-1 text-muted underline-offset-2 hover:text-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
									>
										Download
									</a>
									{#if confirmingId === r.id}
										<Button
											type="button"
											variant="danger"
											size="sm"
											{busy}
											onclick={() => remove(r)}
											ariaLabel={`Confirm deleting ${r.name}`}
										>
											Confirm
										</Button>
										<button
											type="button"
											onclick={() => (confirmingId = null)}
											disabled={busy}
											aria-label={`Cancel deleting ${r.name}`}
											class="cursor-pointer rounded-sm px-2 py-1 text-muted underline-offset-2 hover:text-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
										>
											Cancel
										</button>
									{:else}
										<button
											type="button"
											onclick={() => (confirmingId = r.id)}
											disabled={busy}
											aria-label={`Delete ${r.name}`}
											title={`Delete ${r.name}. The first click shows a confirm button.`}
											class="cursor-pointer rounded-sm px-2 py-1 text-muted underline-offset-2 hover:text-danger hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
										>
											Delete
										</button>
									{/if}
								</div>
							</div>
							{#if confirmingId === r.id && r.usedBy > 0}
								<p class="mt-1 text-xs text-danger" role="alert">
									This will also detach it from {r.usedBy} application{r.usedBy === 1 ? '' : 's'}.
									The applications stay; they just lose the file link.
								</p>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
</Modal>
