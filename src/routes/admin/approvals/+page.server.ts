import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getSession } from '$lib/server/auth';

/**
 * Admin queue page. Server-guarded by a hardcoded ADMIN_ID env stub.
 * Per the Round C scope, this is the UI shell only — the actual
 * approve / reject mutations are wired in the backend round once
 * Better Auth + D1 / Drizzle land.
 */

interface PendingSignup {
	id: string;
	username: string;
	email: string;
	requestedAt: string;
	reason: string | null;
}

const ADMIN_ID = 'stub-user-id';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(303, '/?next=/admin/approvals');
	}
	// Admin guard: per HANDOFF §2.2 the admin is the user with id
	// `ADMIN_ID` until we add a `role` column. Stub for now.
	if (locals.user.id !== ADMIN_ID) {
		throw redirect(303, '/dashboard');
	}

	// Mock pending signups. Backend round replaces this with a real
	// `user` table query filtered by `disabled = true`.
	const pending: PendingSignup[] = [
		{
			id: 'pending-1',
			username: 'casey',
			email: 'casey@example.com',
			requestedAt: '2026-08-28T12:00:00.000Z',
			reason: 'Friend of the user; private tracker invite.'
		},
		{
			id: 'pending-2',
			username: 'drew',
			email: 'drew@example.com',
			requestedAt: '2026-09-01T09:30:00.000Z',
			reason: null
		},
		{
			id: 'pending-3',
			username: 'morgan',
			email: 'morgan@example.com',
			requestedAt: '2026-09-03T17:45:00.000Z',
			reason: 'Referred by ada.'
		}
	];

	return {
		user: locals.user,
		pending
	};
};

void getSession; // imported for symmetry with dashboard server; reserved for the backend round.

/**
 * Approve / reject actions. Round C: server-side accept + log only.
 * The actual flag flip on the `user` table lands in the backend round.
 */
export const actions: Actions = {
	approve: async ({ request }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		// In the backend round this becomes:
		//   await db.update(user).set({ disabled: false }).where(eq(user.id, id))
		// For now, log to the server console so the dev can see the action fired.
		console.info('[admin/approvals] approve', id);
		return { approved: id };
	},
	reject: async ({ request }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		// Future: hard-delete the pending user record, or set a
		// `rejectedAt` column. For now, log only.
		console.info('[admin/approvals] reject', id);
		return { rejected: id };
	}
};
