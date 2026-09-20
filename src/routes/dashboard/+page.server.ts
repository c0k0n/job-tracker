import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getAuth, isAdminUser } from '$lib/server/auth';
import { getDb } from '$lib/server/db';
import {
	addContact,
	addInterview,
	createApplication,
	getApplicationDetail,
	getApplicationsForUser,
	getDashboardData,
	permanentlyDeleteAllTrashed,
	permanentlyDeleteApplication,
	restoreApplication,
	softDeleteApplication,
	updateApplication
} from '$lib/server/applications-data';
import { isResumeOwned, listResumes } from '$lib/server/resumes-data';
import { computeKpis } from '$lib/utils/kpis';
import { parseSalaryFromForm } from '$lib/utils/money';
import { parseFiltersFromUrl, tagFacetsFor } from '$lib/utils/sortFilter';
import { STAGE_VALUES, STATUS_VALUES, ARRANGEMENT_VALUES } from '$lib/constants/stages';

/**
 * Enhanced (use:enhance) form posts send `accept: application/json`
 * (verified in @sveltejs/kit src/runtime/app/forms.js); native posts
 * send `text/html`. Actions return success data in the enhanced case
 * so the client updates in place (no goto, no scroll jump, no stuck
 * modals) and only redirect for the no-JS path.
 */
function isEnhanced(request: Request): boolean {
	return (request.headers.get('accept') ?? '').includes('application/json');
}

/**
 * Dashboard server load.
 *
 * Security: no valid session → no code below the guard runs. locals.user is
 * populated by hooks.server.ts from the Better Auth session; disabled
 * (unapproved) users never get here (hooks nulls their user).
 */

export const load: PageServerLoad = async ({ locals, platform, url }) => {
	if (!locals.user) {
		const next = encodeURIComponent(url.pathname + url.search);
		throw redirect(303, `/?next=${next}`);
	}
	const db = getDb(platform!.env.DB);

	// Trash view toggle: ?trash=1 returns only soft-deleted rows; default
	// returns only active rows. KPI + chart rollups always come from the
	// active set — they don't make sense for trashed rows.
	const trashView = url.searchParams.get('trash') === '1';

	// Every dashboard rollup (active list, trash count, upcoming
	// interviews, stage moves) in one call rather than one per widget. The
	// queries are independent, so Promise.all issues them concurrently —
	// that is a wall-clock win, not a CPU one, because waiting on D1 does
	// not count toward the Worker's CPU budget.
	// Resumes ride alongside instead of becoming a second sequential
	// await: the library modal, the create form's picker and the table's
	// attachment icons all need them on every load.
	const [{ active, trashedCount, upcomingInterviews, stageMoves }, resumes] = await Promise.all([
		getDashboardData(db, locals.user.id, 30),
		listResumes(db, locals.user.id)
	]);
	const applications = trashView
		? await getApplicationsForUser(db, locals.user.id, { onlyTrashed: true })
		: active;
	const kpis = computeKpis(active, upcomingInterviews);
	const { filters, sort } = parseFiltersFromUrl(url.searchParams);

	return {
		user: locals.user,
		applications,
		resumes,
		kpis,
		isAdmin: isAdminUser(locals.user),
		filters,
		sort,
		tagFacets: tagFacetsFor(active),
		trashView,
		// Server-computed stage-move timestamps for the velocity chart.
		stageMoves,
		// Pending interviews for the agenda panel. Already fetched by the
		// rollup above (30-day window) — returning it costs no extra query.
		upcomingInterviews,
		trashedCount,
		// When the URL has `?app=<id>`, fetch the detail bundle server-side
		// so the modal renders without a client-side server-only import.
		activeDetail: url.searchParams.get('app')
			? await getApplicationDetail(db, locals.user.id, url.searchParams.get('app')!, {
					includeTrashed: true
				})
			: null
	};
};

/** Coerce a string from FormData into the right union or null. */
function pickEnum<T extends string>(form: FormData, key: string, allowed: readonly T[]): T | null {
	const raw = String(form.get(key) ?? '').trim();
	return (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
}

/**
 * postingUrl scheme allowlist. Any http(s) URL is fine; everything else
 * (javascript:, data:, …) is rejected — stored XSS via the detail modal's
 * <a href> would otherwise be reachable.
 */
function sanitizePostingUrl(raw: string): string | null {
	const trimmed = raw.trim();
	if (!trimmed) return null;
	// People paste `linkedin.com/jobs/view/123` far more often than
	// `https://…`. Rejecting a bare host would silently throw the link away
	// (the old behaviour returned null and the field just came back empty),
	// so try it once with https:// before giving up.
	for (const candidate of [trimmed, `https://${trimmed}`]) {
		try {
			const url = new URL(candidate);
			if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
			// A host without a dot is almost certainly a typo, not a URL.
			if (!url.hostname.includes('.')) continue;
			return url.toString();
		} catch {
			// try the next candidate
		}
	}
	return null;
}

/** Parse an ISO/date-input value; null when empty, undefined when absent
 * from the form (edit semantics differ per field). */
function parseDateInput(raw: string): Date | null | 'invalid' {
	const trimmed = raw.trim();
	if (!trimmed) return null;
	const d = new Date(trimmed);
	return Number.isNaN(d.getTime()) ? 'invalid' : d;
}

/**
 * Field length ceilings.
 *
 * There were none. An authenticated user could post a 2 MB `company`, or
 * 50 000 tags, and the worker would spend its entire CPU budget parsing and
 * echoing it back while D1 stored every byte — 50 000 tags is a 538 KB cell.
 * Nobody needs that much room for a job application, and the free tier has
 * 10 ms of CPU per request and 500 MB of database.
 *
 * The numbers are deliberately generous for real content: a job posting
 * paste fits comfortably in `long`, and nobody's employer name needs 200
 * characters.
 */
const FIELD_LIMITS = {
	/** company, role, contact name — one line of a table. */
	short: 200,
	/** notes, posting description — free text, can be long. */
	long: 20_000,
	/** A URL is a URL; 2048 is the de-facto browser ceiling. */
	url: 2_048,
	tags: 50,
	tagLength: 40
} as const;

/** Message for a field that went over `max`. */
function tooLong(max: number): string {
	return `That is longer than we accept (${max} characters).`;
}

/**
 * Split and normalise the tag input, rejecting rather than silently
 * truncating — a user who pasted 60 tags should be told, not quietly
 * lose ten of them.
 */
function parseTags(raw: string): { tags: string[] } | { error: string } {
	if (!raw) return { tags: [] };
	const parts = raw
		.split(',')
		.map((t) => t.trim().toLowerCase().replace(/\s+/g, '-'))
		.filter(Boolean);
	if (parts.length > FIELD_LIMITS.tags) return { error: `Use up to ${FIELD_LIMITS.tags} tags.` };
	if (parts.some((t) => t.length > FIELD_LIMITS.tagLength))
		return { error: `Keep each tag under ${FIELD_LIMITS.tagLength} characters.` };
	return { tags: parts };
}

export const actions: Actions = {
	/**
	 * Sign out via Better Auth (clears the session row + cookie). Named
	 * (not `default`) because SvelteKit forbids default alongside named
	 * actions.
	 */
	signout: async ({ request }) => {
		const auth = getAuth();
		await auth.api.signOut({ headers: request.headers });
		throw redirect(303, '/?signedout=1');
	},

	/**
	 * Create a new application. 400 with field errors on validation;
	 * 303 back to /dashboard on success.
	 */
	create: async ({ request, locals, platform }) => {
		if (!locals.user) throw redirect(303, '/');
		const db = getDb(platform!.env.DB);
		const form = await request.formData();

		const company = String(form.get('company') ?? '').trim();
		const role = String(form.get('role') ?? '').trim();
		const stage = pickEnum(form, 'stage', STAGE_VALUES);
		const status = pickEnum(form, 'status', STATUS_VALUES);
		const workArrangement = pickEnum(form, 'workArrangement', ARRANGEMENT_VALUES);
		const postingUrl = sanitizePostingUrl(String(form.get('postingUrl') ?? ''));
		const postingDescription = String(form.get('postingDescription') ?? '').trim() || null;
		const notes = String(form.get('notes') ?? '').trim() || null;
		const resumeId = String(form.get('resumeId') ?? '').trim() || null;
		const appliedAt = parseDateInput(String(form.get('appliedAt') ?? ''));
		const nextActionAt = parseDateInput(String(form.get('nextActionAt') ?? ''));
		const tagsRaw = String(form.get('tags') ?? '').trim();
		const parsedTags = parseTags(tagsRaw);
		const tags = 'tags' in parsedTags ? parsedTags.tags : [];

		const { salary, errors: salaryErrors } = parseSalaryFromForm(
			String(form.get('salaryShape') ?? ''),
			String(form.get('salaryCurrency') ?? ''),
			String(form.get('salaryExact') ?? '') || null,
			String(form.get('salaryMin') ?? '') || null,
			String(form.get('salaryMax') ?? '') || null
		);

		const errors: {
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
		} = { ...salaryErrors };
		if ('error' in parsedTags) errors.tags = parsedTags.error;
		if (company.length > FIELD_LIMITS.short) errors.company = tooLong(FIELD_LIMITS.short);
		if (role.length > FIELD_LIMITS.short) errors.role = tooLong(FIELD_LIMITS.short);
		if ((postingUrl ?? '').length > FIELD_LIMITS.url) errors.postingUrl = tooLong(FIELD_LIMITS.url);
		if ((postingDescription ?? '').length > FIELD_LIMITS.long)
			errors.postingDescription = tooLong(FIELD_LIMITS.long);
		if ((notes ?? '').length > FIELD_LIMITS.long) errors.notes = tooLong(FIELD_LIMITS.long);
		// resumeId is free text from the form: it has to be one of *this*
		// user's resumes, or an application could be pointed at a file that
		// belongs to somebody else.
		if (resumeId && !(await isResumeOwned(db, locals.user.id, resumeId))) {
			errors.resume = 'Pick one of your own resumes.';
		}
		if (!company) errors.company = 'Company is required.';
		if (!role) errors.role = 'Role is required.';
		if (!stage) errors.stage = 'Pick a stage.';
		if (!status) errors.status = 'Pick a status.';
		if (!workArrangement) errors.workArrangement = 'Pick a work arrangement.';
		if (appliedAt === 'invalid') errors.appliedAt = 'Enter a valid date.';
		if (nextActionAt === 'invalid') errors.nextActionAt = 'Enter a valid date.';
		if (
			Object.keys(errors).length > 0 ||
			!stage ||
			!status ||
			!workArrangement ||
			appliedAt === 'invalid' ||
			nextActionAt === 'invalid'
		) {
			return fail(400, {
				operation: 'create',
				values: {
					company,
					role,
					stage,
					status,
					workArrangement,
					postingUrl: postingUrl ?? '',
					postingDescription,
					notes,
					resumeId,
					appliedAt: String(form.get('appliedAt') ?? ''),
					nextActionAt: String(form.get('nextActionAt') ?? ''),
					tagsRaw,
					salaryShape: String(form.get('salaryShape') ?? ''),
					salaryCurrency: String(form.get('salaryCurrency') ?? ''),
					salaryExact: String(form.get('salaryExact') ?? ''),
					salaryMin: String(form.get('salaryMin') ?? ''),
					salaryMax: String(form.get('salaryMax') ?? '')
				},
				errors
			});
		}

		await createApplication(db, locals.user.id, {
			company,
			role,
			stage,
			status,
			workArrangement,
			salary,
			postingUrl,
			postingDescription,
			notes,
			resumeId,
			appliedAt: appliedAt ? appliedAt.toISOString() : null,
			nextActionAt: nextActionAt ? nextActionAt.toISOString() : null,
			tags
		});

		if (isEnhanced(request)) return { operation: 'create', ok: true };
		throw redirect(303, '/dashboard');
	},

	/**
	 * Edit an existing application. The full edit form posts all fields;
	 * empty values clear (user intent), absent keys keep the stored value.
	 */
	edit: async ({ request, locals, platform }) => {
		if (!locals.user) throw redirect(303, '/');
		const db = getDb(platform!.env.DB);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { operation: 'edit', errors: { id: 'Missing id.' } });

		const stage = pickEnum(form, 'stage', STAGE_VALUES);
		const status = pickEnum(form, 'status', STATUS_VALUES);
		const workArrangement = pickEnum(form, 'workArrangement', ARRANGEMENT_VALUES);
		const postingUrl = sanitizePostingUrl(String(form.get('postingUrl') ?? ''));
		const postingDescription = String(form.get('postingDescription') ?? '').trim() || null;
		const notes = String(form.get('notes') ?? '').trim() || null;
		const resumeId = String(form.get('resumeId') ?? '').trim() || null;
		const appliedAt = parseDateInput(String(form.get('appliedAt') ?? ''));
		const nextActionAt = parseDateInput(String(form.get('nextActionAt') ?? ''));
		const tagsRaw = String(form.get('tags') ?? '').trim();
		const parsedTags = parseTags(tagsRaw);
		const tags = 'tags' in parsedTags ? parsedTags.tags : undefined;
		const { salary, errors: salaryErrors } = parseSalaryFromForm(
			String(form.get('salaryShape') ?? ''),
			String(form.get('salaryCurrency') ?? ''),
			String(form.get('salaryExact') ?? '') || null,
			String(form.get('salaryMin') ?? '') || null,
			String(form.get('salaryMax') ?? '') || null
		);

		const errors: {
			company?: string;
			role?: string;
			postingUrl?: string;
			postingDescription?: string;
			notes?: string;
			tags?: string;
			salary?: string;
			appliedAt?: string;
			nextActionAt?: string;
			resume?: string;
		} = { ...salaryErrors };
		if ('error' in parsedTags) errors.tags = parsedTags.error;
		if ((postingUrl ?? '').length > FIELD_LIMITS.url) errors.postingUrl = tooLong(FIELD_LIMITS.url);
		if ((postingDescription ?? '').length > FIELD_LIMITS.long)
			errors.postingDescription = tooLong(FIELD_LIMITS.long);
		if ((notes ?? '').length > FIELD_LIMITS.long) errors.notes = tooLong(FIELD_LIMITS.long);
		// Same ownership rule as create: the id comes from the form.
		if (resumeId && !(await isResumeOwned(db, locals.user.id, resumeId))) {
			errors.resume = 'Pick one of your own resumes.';
		}
		if (appliedAt === 'invalid') errors.appliedAt = 'Enter a valid date.';
		if (nextActionAt === 'invalid') errors.nextActionAt = 'Enter a valid date.';
		if (Object.keys(errors).length > 0 || appliedAt === 'invalid' || nextActionAt === 'invalid') {
			return fail(400, {
				operation: 'edit',
				values: {
					company: String(form.get('company') ?? '').trim(),
					role: String(form.get('role') ?? '').trim(),
					stage,
					status,
					workArrangement,
					postingUrl: postingUrl ?? '',
					postingDescription,
					notes,
					resumeId,
					appliedAt: String(form.get('appliedAt') ?? ''),
					nextActionAt: String(form.get('nextActionAt') ?? ''),
					tagsRaw,
					salaryShape: String(form.get('salaryShape') ?? ''),
					salaryCurrency: String(form.get('salaryCurrency') ?? ''),
					salaryExact: String(form.get('salaryExact') ?? ''),
					salaryMin: String(form.get('salaryMin') ?? ''),
					salaryMax: String(form.get('salaryMax') ?? '')
				},
				errors
			});
		}

		const updated = await updateApplication(db, locals.user.id, id, {
			company: String(form.get('company') ?? '').trim() || undefined,
			role: String(form.get('role') ?? '').trim() || undefined,
			stage: stage ?? undefined,
			status: status ?? undefined,
			workArrangement: workArrangement ?? undefined,
			postingUrl,
			postingDescription,
			notes,
			resumeId,
			appliedAt: appliedAt ? appliedAt.toISOString() : null,
			nextActionAt: nextActionAt ? nextActionAt.toISOString() : null,
			salary,
			tags
		});
		if (!updated) return fail(404, { operation: 'edit', errors: { id: 'Not found.' } });

		if (isEnhanced(request)) return { operation: 'edit', ok: true };
		throw redirect(303, '/dashboard');
	},

	/** Move an application to trash (soft-delete). */
	delete: async ({ request, locals, platform }) => {
		if (!locals.user) throw redirect(303, '/');
		const db = getDb(platform!.env.DB);
		const id = String((await request.formData()).get('id') ?? '');
		if (!id) return fail(400, { operation: 'delete', errors: { id: 'Missing id.' } });
		const result = await softDeleteApplication(db, locals.user.id, id);
		if (!result) return fail(404, { operation: 'delete', errors: { id: 'Not found.' } });
		if (isEnhanced(request)) return { operation: 'delete', ok: true, id };
		throw redirect(303, '/dashboard');
	},

	/** Restore from trash back to active view. */
	restore: async ({ request, locals, platform }) => {
		if (!locals.user) throw redirect(303, '/');
		const db = getDb(platform!.env.DB);
		const id = String((await request.formData()).get('id') ?? '');
		if (!id) return fail(400, { operation: 'restore', errors: { id: 'Missing id.' } });
		const result = await restoreApplication(db, locals.user.id, id);
		if (!result) return fail(404, { operation: 'restore', errors: { id: 'Not found.' } });
		if (isEnhanced(request)) return { operation: 'restore', ok: true, id };
		throw redirect(303, '/dashboard?trash=1');
	},

	/** Hard-delete (irreversible). */
	purge: async ({ request, locals, platform }) => {
		if (!locals.user) throw redirect(303, '/');
		const db = getDb(platform!.env.DB);
		const id = String((await request.formData()).get('id') ?? '');
		if (!id) return fail(400, { operation: 'purge', errors: { id: 'Missing id.' } });
		const result = await permanentlyDeleteApplication(db, locals.user.id, id);
		if (!result) return fail(404, { operation: 'purge', errors: { id: 'Not found.' } });
		if (isEnhanced(request)) return { operation: 'purge', ok: true, id };
		throw redirect(303, '/dashboard?trash=1');
	},

	/**
	 * Empty the entire trash (hard-delete every soft-deleted row for the
	 * signed-in user). Irreversible; the UI arms it behind a two-click
	 * confirm like row-level purge.
	 */
	emptyTrash: async ({ request, locals, platform }) => {
		if (!locals.user) throw redirect(303, '/');
		const db = getDb(platform!.env.DB);
		const purged = await permanentlyDeleteAllTrashed(db, locals.user.id);
		if (isEnhanced(request)) return { operation: 'emptyTrash', ok: true, count: purged };
		throw redirect(303, '/dashboard?trash=1');
	},

	/** Add an interview record. Unparseable dates are rejected, never stored. */
	addInterview: async ({ request, locals, platform }) => {
		if (!locals.user) throw redirect(303, '/');
		const db = getDb(platform!.env.DB);
		const form = await request.formData();
		const applicationId = String(form.get('applicationId') ?? '');
		const kindRaw = String(form.get('kind') ?? '');
		const kind = (
			['phone_screen', 'technical', 'onsite', 'final', 'coffee_chat', 'other'] as const
		).find((k) => k === kindRaw);
		const scheduledAtRaw = String(form.get('scheduledAt') ?? '').trim();
		const scheduledAt = scheduledAtRaw ? new Date(scheduledAtRaw) : null;
		const withName = String(form.get('withName') ?? '').trim() || null;
		const notes = String(form.get('notes') ?? '').trim() || null;

		if (!applicationId || !kind || !scheduledAt || Number.isNaN(scheduledAt.getTime())) {
			return fail(400, {
				operation: 'addInterview',
				errors: { form: 'A valid kind, date, and application are required.' }
			});
		}
		if ((withName ?? '').length > FIELD_LIMITS.short || (notes ?? '').length > FIELD_LIMITS.long) {
			return fail(400, {
				operation: 'addInterview',
				errors: { form: 'Those details are longer than we accept.' }
			});
		}
		const result = await addInterview(db, locals.user.id, applicationId, {
			kind,
			scheduledAt: scheduledAt.toISOString(),
			durationMinutes: null,
			withName,
			withRole: null,
			notes,
			outcome: null
		});
		if (!result) return fail(404, { operation: 'addInterview', errors: { id: 'Not found.' } });
		if (isEnhanced(request)) return { operation: 'addInterview', ok: true };
		throw redirect(303, '/dashboard');
	},

	/** Add a contact record. */
	addContact: async ({ request, locals, platform }) => {
		if (!locals.user) throw redirect(303, '/');
		const db = getDb(platform!.env.DB);
		const form = await request.formData();
		const applicationId = String(form.get('applicationId') ?? '');
		const name = String(form.get('name') ?? '').trim();
		const role = String(form.get('role') ?? '').trim() || null;
		const company = String(form.get('company') ?? '').trim() || null;
		const email = String(form.get('email') ?? '').trim() || null;
		const notes = String(form.get('notes') ?? '').trim() || null;

		if (!applicationId || !name) {
			return fail(400, {
				operation: 'addContact',
				errors: { name: 'Name is required.' }
			});
		}
		if (
			name.length > FIELD_LIMITS.short ||
			(role ?? '').length > FIELD_LIMITS.short ||
			(company ?? '').length > FIELD_LIMITS.short ||
			(email ?? '').length > FIELD_LIMITS.short ||
			(notes ?? '').length > FIELD_LIMITS.long
		) {
			return fail(400, {
				operation: 'addContact',
				errors: { name: 'Those details are longer than we accept.' }
			});
		}
		const result = await addContact(db, locals.user.id, applicationId, {
			name,
			role,
			company,
			email,
			phone: null,
			notes
		});
		if (!result) return fail(404, { operation: 'addContact', errors: { id: 'Not found.' } });
		if (isEnhanced(request)) return { operation: 'addContact', ok: true };
		throw redirect(303, '/dashboard');
	}
};
