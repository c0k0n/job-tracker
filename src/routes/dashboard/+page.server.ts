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
	permanentlyDeleteApplication,
	restoreApplication,
	softDeleteApplication,
	updateApplication
} from '$lib/server/applications-data';
import { computeKpis } from '$lib/utils/kpis';
import { parseSalaryFromForm } from '$lib/utils/money';
import { parseFiltersFromUrl, tagFacetsFor } from '$lib/utils/sortFilter';
import { STAGE_VALUES, STATUS_VALUES, ARRANGEMENT_VALUES } from '$lib/constants/stages';

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

	// One D1 round-trip for every dashboard rollup (active list, trash
	// count, upcoming interviews, stage moves) — the queries are
	// independent, so Promise.all + D1's session reuse issues them
	// together instead of sequentially (free-tier CPU + latency win).
	const { active, trashedCount, upcomingInterviews, stageMoves } = await getDashboardData(
		db,
		locals.user.id,
		30
	);
	const applications = trashView
		? await getApplicationsForUser(db, locals.user.id, { onlyTrashed: true })
		: active;
	const kpis = computeKpis(active, upcomingInterviews);
	const { filters, sort } = parseFiltersFromUrl(url.searchParams);

	return {
		user: locals.user,
		applications,
		kpis,
		isAdmin: isAdminUser(locals.user),
		filters,
		sort,
		tagFacets: tagFacetsFor(active),
		trashView,
		// Server-computed stage-move timestamps for the velocity chart.
		stageMoves,
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
	try {
		const url = new URL(trimmed);
		if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString();
	} catch {
		// fall through
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

export const actions: Actions = {
	/**
	 * Sign out via Better Auth (clears the session row + cookie). Named
	 * (not `default`) because SvelteKit forbids default alongside named
	 * actions.
	 */
	signout: async ({ request }) => {
		const auth = getAuth();
		await auth.api.signOut({ headers: request.headers });
		throw redirect(303, '/');
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
		const tags = tagsRaw
			? tagsRaw
					.split(',')
					.map((t) => t.trim().toLowerCase().replace(/\s+/g, '-'))
					.filter(Boolean)
			: [];

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
			salary?: string;
			appliedAt?: string;
			nextActionAt?: string;
		} = { ...salaryErrors };
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
		const tags = tagsRaw
			? tagsRaw
					.split(',')
					.map((t) => t.trim().toLowerCase().replace(/\s+/g, '-'))
					.filter(Boolean)
			: undefined;
		const { salary, errors: salaryErrors } = parseSalaryFromForm(
			String(form.get('salaryShape') ?? ''),
			String(form.get('salaryCurrency') ?? ''),
			String(form.get('salaryExact') ?? '') || null,
			String(form.get('salaryMin') ?? '') || null,
			String(form.get('salaryMax') ?? '') || null
		);

		const errors: { salary?: string; appliedAt?: string; nextActionAt?: string } = {
			...salaryErrors
		};
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
		const result = await addContact(db, locals.user.id, applicationId, {
			name,
			role,
			company,
			email,
			phone: null,
			notes
		});
		if (!result) return fail(404, { operation: 'addContact', errors: { id: 'Not found.' } });
		throw redirect(303, '/dashboard');
	}
};
