import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { clearSession, isAdminUser } from '$lib/server/auth';
import {
	addContact,
	addInterview,
	createApplication,
	getApplicationsForUser,
	getApplicationDetail,
	listTrashedForUser,
	permanentlyDeleteApplication,
	restoreApplication,
	softDeleteApplication,
	updateApplication
} from '$lib/server/applications-data';
import { computeKpis } from '$lib/utils/kpis';
import { parseFiltersFromUrl, tagFacetsFor } from '$lib/utils/sortFilter';
import type { ApplicationStage, ApplicationStatus, WorkArrangement } from '$lib/types';

/**
 * Dashboard server load.
 *
 * The security guarantee: if there is no valid session, no code below this
 * line ever runs. The redirect happens before any data is fetched or any
 * page component is rendered. With Better Auth wired later, this exact
 * check (`event.locals.user` populated by the hooks) is the gate.
 *
 * Once Better Auth is in place, add a `disabled` flag to the user record
 * and gate access here:
 *
 *   if (locals.user.disabled) {
 *     throw redirect(303, '/pending-approval');
 *   }
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		const next = encodeURIComponent(url.pathname + url.search);
		throw redirect(303, `/?next=${next}`);
	}

	// Trash view toggle: ?trash=1 returns only soft-deleted rows;
	// default returns only active rows. KPI + chart rollups always
	// come from the active set — they don't make sense for trashed rows.
	// `activeApps` is fetched once and reused (the stub is a Map, but this
	// keeps the call sites honest for when the real DB lands).
	const trashView = url.searchParams.get('trash') === '1';
	const activeApps = getApplicationsForUser(locals.user.id);
	const applications = trashView ? listTrashedForUser(locals.user.id) : activeApps;
	const kpis = computeKpis(activeApps);
	const { filters, sort } = parseFiltersFromUrl(url.searchParams);
	const trashedCount = trashView ? applications.length : listTrashedForUser(locals.user.id).length;

	return {
		user: locals.user,
		applications,
		kpis,
		isAdmin: isAdminUser(locals.user),
		filters,
		sort,
		tagFacets: tagFacetsFor(activeApps),
		trashView,
		trashedCount,
		// Round C: when the URL has `?app=<id>`, fetch the detail bundle
		// server-side so the modal can render without a client-side
		// server-only import (we don't expose $lib/server/* to the page).
		activeDetail: (() => {
			const id = url.searchParams.get('app');
			if (!id) return null;
			return getApplicationDetail(locals.user.id, id, { includeTrashed: true });
		})()
	};
};

/** Coerce a string from FormData into the right union or fail 400. */
function pickEnum<T extends string>(form: FormData, key: string, allowed: readonly T[]): T | null {
	const raw = String(form.get(key) ?? '').trim();
	return (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
}

const STAGE_VALUES: readonly ApplicationStage[] = [
	'saved',
	'applied',
	'phone_screen',
	'technical',
	'onsite',
	'final',
	'offer',
	'accepted',
	'rejected',
	'withdrawn'
];

const STATUS_VALUES: readonly ApplicationStatus[] = [
	'active',
	'stalled',
	'ghosted',
	'paused',
	'closed'
];

const ARRANGEMENT_VALUES: readonly WorkArrangement[] = [
	'remote',
	'hybrid',
	'onsite',
	'unspecified'
];

/**
 * Form actions for the dashboard. Each action returns either:
 *   - `redirect()` to navigate after a state mutation
 *   - `fail()` with field-level errors that the page surfaces
 *
 * Modals that open these actions are closed via SvelteKit's normal
 * `use:enhance` flow — the redirect (when issued) clears `page.state`
 * which closes the shallow-routed modal automatically.
 */
export const actions: Actions = {
	/**
	 * Sign out. Named (not `default`) because SvelteKit forbids a default
	 * action alongside named actions (docs/kit/form-actions#named-actions).
	 * The dashboard's sign-out form posts to `?/signout`.
	 */
	signout: async ({ cookies }) => {
		clearSession(cookies);
		throw redirect(303, '/');
	},

	/**
	 * Create a new application from the "+ Add application" modal.
	 * Returns 400 on validation errors; 303 back to /dashboard on success.
	 */
	create: async ({ request, locals }) => {
		if (!locals.user) throw redirect(303, '/');
		const form = await request.formData();

		const company = String(form.get('company') ?? '').trim();
		const role = String(form.get('role') ?? '').trim();
		const stage = pickEnum(form, 'stage', STAGE_VALUES);
		const status = pickEnum(form, 'status', STATUS_VALUES);
		const workArrangement = pickEnum(form, 'workArrangement', ARRANGEMENT_VALUES);
		const postingUrl = String(form.get('postingUrl') ?? '').trim() || null;
		const appliedAt = String(form.get('appliedAt') ?? '').trim() || null;
		const tagsRaw = String(form.get('tags') ?? '').trim();
		const tags = tagsRaw
			? tagsRaw
					.split(',')
					.map((t) => t.trim().toLowerCase())
					.filter(Boolean)
			: [];

		const errors: {
			company?: string;
			role?: string;
			stage?: string;
			status?: string;
			workArrangement?: string;
		} = {};
		if (!company) errors.company = 'Company is required.';
		if (!role) errors.role = 'Role is required.';
		if (!stage) errors.stage = 'Pick a stage.';
		if (!status) errors.status = 'Pick a status.';
		if (!workArrangement) errors.workArrangement = 'Pick a work arrangement.';
		if (Object.keys(errors).length > 0) {
			return fail(400, {
				operation: 'create',
				values: { company, role, stage, status, workArrangement, postingUrl, appliedAt, tagsRaw },
				errors
			});
		}

		createApplication(locals.user.id, {
			company,
			role,
			stage: stage!,
			status: status!,
			workArrangement: workArrangement!,
			salary: null,
			postingUrl,
			postingDescription: null,
			notes: null,
			resumeId: null,
			appliedAt,
			nextActionAt: null,
			tags
		});

		throw redirect(303, '/dashboard');
	},

	/**
	 * Edit an existing application. The full edit form posts all
	 * fields, so this is a partial PATCH (whatever was submitted is
	 * merged). Stage changes bump stageChangedAt (handled by the
	 * data layer) and append an activity event.
	 */
	edit: async ({ request, locals }) => {
		if (!locals.user) throw redirect(303, '/');
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { operation: 'edit', errors: { id: 'Missing id.' } });

		const stage = pickEnum(form, 'stage', STAGE_VALUES);
		const status = pickEnum(form, 'status', STATUS_VALUES);
		const workArrangement = pickEnum(form, 'workArrangement', ARRANGEMENT_VALUES);
		const postingUrl = String(form.get('postingUrl') ?? '').trim() || null;
		const appliedAt = String(form.get('appliedAt') ?? '').trim() || null;
		const tagsRaw = String(form.get('tags') ?? '').trim();
		const tags = tagsRaw
			? tagsRaw
					.split(',')
					.map((t) => t.trim().toLowerCase())
					.filter(Boolean)
			: undefined;

		const updated = updateApplication(locals.user.id, id, {
			company: String(form.get('company') ?? '').trim() || undefined,
			role: String(form.get('role') ?? '').trim() || undefined,
			stage: stage ?? undefined,
			status: status ?? undefined,
			workArrangement: workArrangement ?? undefined,
			postingUrl,
			appliedAt,
			nextActionAt: null,
			tags
		});
		if (!updated) return fail(404, { operation: 'edit', errors: { id: 'Not found.' } });

		throw redirect(303, '/dashboard');
	},

	/** Move an application to trash (soft-delete). */
	delete: async ({ request, locals }) => {
		if (!locals.user) throw redirect(303, '/');
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { operation: 'delete', errors: { id: 'Missing id.' } });
		const result = softDeleteApplication(locals.user.id, id);
		if (!result) return fail(404, { operation: 'delete', errors: { id: 'Not found.' } });
		throw redirect(303, '/dashboard');
	},

	/** Restore from trash back to active view. */
	restore: async ({ request, locals }) => {
		if (!locals.user) throw redirect(303, '/');
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { operation: 'restore', errors: { id: 'Missing id.' } });
		const result = restoreApplication(locals.user.id, id);
		if (!result) return fail(404, { operation: 'restore', errors: { id: 'Not found.' } });
		throw redirect(303, '/dashboard?trash=1');
	},

	/** Hard-delete (irreversible). */
	purge: async ({ request, locals }) => {
		if (!locals.user) throw redirect(303, '/');
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { operation: 'purge', errors: { id: 'Missing id.' } });
		const result = permanentlyDeleteApplication(locals.user.id, id);
		if (!result) return fail(404, { operation: 'purge', errors: { id: 'Not found.' } });
		throw redirect(303, '/dashboard?trash=1');
	},

	/** Add an interview record to an application. */
	addInterview: async ({ request, locals }) => {
		if (!locals.user) throw redirect(303, '/');
		const form = await request.formData();
		const applicationId = String(form.get('applicationId') ?? '');
		const kindRaw = String(form.get('kind') ?? '');
		const allowedKinds = [
			'phone_screen',
			'technical',
			'onsite',
			'final',
			'coffee_chat',
			'other'
		] as const;
		const kind = (allowedKinds as readonly string[]).includes(kindRaw)
			? (kindRaw as (typeof allowedKinds)[number])
			: null;
		const scheduledAt = String(form.get('scheduledAt') ?? '').trim();
		const withName = String(form.get('withName') ?? '').trim() || null;
		const notes = String(form.get('notes') ?? '').trim() || null;

		if (!applicationId || !kind || !scheduledAt) {
			return fail(400, {
				operation: 'addInterview',
				errors: { form: 'Kind, scheduledAt, and applicationId are required.' }
			});
		}
		const result = addInterview(locals.user.id, applicationId, {
			kind,
			scheduledAt,
			durationMinutes: null,
			withName,
			withRole: null,
			notes,
			outcome: null
		});
		if (!result) return fail(404, { operation: 'addInterview', errors: { id: 'Not found.' } });
		throw redirect(303, '/dashboard');
	},

	/** Add a contact record to an application. */
	addContact: async ({ request, locals }) => {
		if (!locals.user) throw redirect(303, '/');
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
		const result = addContact(locals.user.id, applicationId, {
			name,
			role,
			company,
			email,
			phone: null,
			notes
		});
		if (!result) return fail(404, { operation: 'addContact', errors: { id: 'Not found.' } });
		throw redirect(303, '/dashboard');
	},

	/** Stub for future: load a single application detail. Used by deep-link
	 * pre-fetching; the modal itself is shallow-routed so it doesn't hit
	 * this action. Kept so future "fetch on hover" hooks have a clean target.
	 */
	getDetail: async ({ request, locals }) => {
		if (!locals.user) throw redirect(303, '/');
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { errors: { id: 'Missing id.' } });
		const detail = getApplicationDetail(locals.user.id, id, { includeTrashed: true });
		if (!detail) return fail(404, { errors: { id: 'Not found.' } });
		return { detail };
	}
};
