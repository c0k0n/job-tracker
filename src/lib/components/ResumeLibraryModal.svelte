<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve as resolvePath } from '$app/paths';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import Modal from './Modal.svelte';
	import Button from './Button.svelte';
	import { formatDateShort, formatRelative } from '$lib/utils/dates';
	import type { Application } from '$lib/types';

	interface Props {
		/** All apps with a `resumeId`. Source: dashboard load returns `applications`. */
		applications: readonly Application[];
	}

	let { applications }: Props = $props();

	// Two-way bound open state mirrored from the `?resume=1` query param
	// (same pattern as the details modal): a writable `$derived` satisfies
	// `Modal`'s `bind:open`, and the URL stays the single source of truth.
	// Closing flips `open` (Esc, backdrop, X) and the effect below strips
	// the query so the modal doesn't reopen on the next render.
	let open = $derived(page.url.searchParams.get('resume') === '1');

	$effect(() => {
		if (open) return;
		if (typeof window === 'undefined') return;
		const sp = new SvelteURLSearchParams(window.location.search);
		if (!sp.has('resume')) return;
		sp.delete('resume');
		const qs = sp.toString();
		const next = (qs ? `/dashboard?${qs}` : '/dashboard') as `/${string}`;
		void goto(resolvePath(next), {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	});

	// Mock "library": list each app's resumeId + name. R2 upload lands
	// in the backend round. For now we just show the inventory + a
	// local-only file picker that records the chosen file's metadata
	// (no upload, no persistence beyond the session).
	const RESUME_URLS: Record<string, string> = {
		'resume-acme': 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
		'resume-stripe': 'https://www.africau.edu/images/default/sample.pdf',
		'resume-figma': 'https://www.orimi.com/pdf-test.pdf',
		'resume-linear': 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
		'resume-datadog': 'https://www.africau.edu/images/default/sample.pdf',
		'resume-openai': 'https://www.orimi.com/pdf-test.pdf'
	};

	type ResumeEntry = {
		id: string;
		company: string;
		role: string;
		filename: string;
		previewUrl: string | null;
		updatedAt: string;
	};

	// Derive the resume library from the passed `applications` prop.
	const library: ResumeEntry[] = $derived(
		applications
			.filter((a): a is Application & { resumeId: string } => a.resumeId !== null)
			.map((a) => ({
				id: a.resumeId,
				company: a.company,
				role: a.role,
				filename: `${a.resumeId}.pdf`,
				previewUrl: RESUME_URLS[a.resumeId] ?? null,
				updatedAt: a.updatedAt
			}))
	);

	// Staged upload: previews the chosen file via `URL.createObjectURL`
	// but does not persist it. R2 upload lands in the backend round.
	type PendingUpload = {
		file: File;
		name: string;
		size: number;
		previewUrl: string;
	};
	let pending = $state<PendingUpload | null>(null);
	let uploadError = $state<string | null>(null);

	function onFileChange(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0] ?? null;
		uploadError = null;
		if (!file) {
			pending = null;
			return;
		}
		if (file.type !== 'application/pdf') {
			uploadError = 'Only PDF files are accepted.';
			pending = null;
			return;
		}
		if (file.size > 10 * 1024 * 1024) {
			uploadError = 'Files must be under 10 MB.';
			pending = null;
			return;
		}
		pending = {
			file,
			name: file.name,
			size: file.size,
			previewUrl: URL.createObjectURL(file)
		};
	}

	function clearPending() {
		if (pending) URL.revokeObjectURL(pending.previewUrl);
		pending = null;
	}

	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
</script>

<Modal bind:open title="Resume library" subtitle="Upload and manage your resumes">
	<div class="space-y-5">
		<div
			role="region"
			aria-labelledby="resume-upload-heading"
			class="rounded-md border border-border bg-surface-2 p-4"
		>
			<h3
				id="resume-upload-heading"
				class="mb-2 font-mono text-[11px] tracking-widest text-muted uppercase"
			>
				Upload a new resume
			</h3>
			<div class="space-y-3">
				<label for="resume-file" class="block text-sm font-medium text-fg">PDF resume</label>
				<input
					id="resume-file"
					type="file"
					accept="application/pdf"
					onchange={onFileChange}
					class="block w-full cursor-pointer rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg file:mr-3 file:rounded-sm file:border-0 file:bg-accent file:px-3 file:py-1.5 file:font-medium file:text-accent-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
				/>
				<p class="text-xs text-muted">Max 10 MB. Stored in R2 once the backend round lands.</p>
				{#if uploadError}
					<p class="text-xs text-danger" role="alert">{uploadError}</p>
				{/if}
				{#if pending}
					<div
						class="flex items-center justify-between gap-3 rounded-sm bg-surface px-3 py-2 text-xs"
					>
						<span class="truncate font-mono">
							{pending.name} · {formatSize(pending.size)}
						</span>
						<button
							type="button"
							onclick={clearPending}
							class="cursor-pointer text-muted underline-offset-2 hover:text-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
						>
							Remove
						</button>
					</div>
					<div class="flex justify-end gap-2 pt-1">
						<Button
							type="button"
							variant="primary"
							size="sm"
							disabled
							ariaLabel="Upload resume (pending backend round)"
							onclick={() => {
								uploadError =
									'Upload is wired in the backend round. File metadata is captured below; nothing is persisted yet.';
							}}
						>
							Upload (pending backend)
						</Button>
					</div>
				{/if}
			</div>
		</div>

		<div role="region" aria-labelledby="resume-library-heading">
			<h3
				id="resume-library-heading"
				class="mb-2 font-mono text-[11px] tracking-widest text-muted uppercase"
			>
				Attached to applications · {library.length}
			</h3>
			{#if library.length === 0}
				<p class="text-sm text-muted">No resumes attached yet.</p>
			{:else}
				<ul class="divide-y divide-border">
					{#each library as entry (entry.id)}
						<li class="flex items-center justify-between gap-3 py-3">
							<div class="min-w-0 flex-1">
								<div class="truncate text-sm font-medium text-fg">{entry.filename}</div>
								<div class="truncate text-xs text-muted">
									{entry.company} · {entry.role} · updated {formatRelative(entry.updatedAt)}
								</div>
							</div>
							{#if entry.previewUrl}
								<!-- Preview URLs are external (mock PDFs today, presigned
									R2 in the backend round), so use the URL directly —
									resolve() is only for internal SvelteKit routes. -->
								<a
									href={entry.previewUrl}
									target="_blank"
									rel="external noreferrer"
									class="rounded-sm px-2 py-1 text-xs text-muted underline-offset-2 hover:text-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
								>
									Open ↗
								</a>
							{/if}
						</li>
					{/each}
				</ul>
				<p class="mt-3 text-xs text-muted">
					Title attribute shows the most recent attach date: {formatDateShort(
						new Date().toISOString()
					)}.
				</p>
			{/if}
		</div>
	</div>
</Modal>
