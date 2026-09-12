import { fail, redirect } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { isAdminUser } from '$lib/server/auth';
import { getDb } from '$lib/server/db';
import { user as userTable } from '$lib/server/db/schema';

/**
 * Admin queue page: lists sign-ups awaiting approval (disabled = true) and
 * flips the flag via the approve/reject actions. Guarded server-side by
 * the admin role on the session user (see auth.ts isAdminUser).
 */
export const load: PageServerLoad = async ({ locals, platform }) => {
	if (!locals.user) throw redirect(303, '/?next=/admin/approvals');
	if (!isAdminUser(locals.user)) throw redirect(303, '/dashboard');
	const db = getDb(platform!.env.DB);

	const rows = await db
		.select({
			id: userTable.id,
			username: userTable.username,
			displayUsername: userTable.displayUsername,
			email: userTable.email,
			name: userTable.name,
			createdAt: userTable.createdAt
		})
		.from(userTable)
		.where(and(eq(userTable.disabled, true), eq(userTable.banned, false)))
		.orderBy(desc(userTable.createdAt))
		.all();

	return {
		user: locals.user,
		pending: rows.map((r) => ({
			id: r.id,
			username: r.username ?? r.displayUsername ?? r.name,
			email: r.email,
			requestedAt: r.createdAt.toISOString()
		}))
	};
};

export const actions: Actions = {
	/** Approve: flip disabled → false. The user can sign in immediately. */
	approve: async ({ request, locals, platform }) => {
		if (!locals.user) throw redirect(303, '/?next=/admin/approvals');
		if (!isAdminUser(locals.user)) throw redirect(303, '/dashboard');
		const db = getDb(platform!.env.DB);
		const id = String((await request.formData()).get('id') ?? '');
		if (!id) return fail(400, { id: '', errors: { id: 'Missing id.' } });

		const result = await db
			.update(userTable)
			.set({ disabled: false, updatedAt: new Date() })
			.where(and(eq(userTable.id, id), eq(userTable.disabled, true)))
			.returning({ id: userTable.id })
			.all();
		if (result.length === 0)
			return fail(404, { id, errors: { id: 'Not found or already approved.' } });
		return { approved: id };
	},

	/**
	 * Reject: remove the pending account entirely (cascades sessions,
	 * accounts, applications — a rejected sign-up has no data worth keeping).
	 */
	reject: async ({ request, locals, platform }) => {
		if (!locals.user) throw redirect(303, '/?next=/admin/approvals');
		if (!isAdminUser(locals.user)) throw redirect(303, '/dashboard');
		const db = getDb(platform!.env.DB);
		const id = String((await request.formData()).get('id') ?? '');
		if (!id) return fail(400, { id: '', errors: { id: 'Missing id.' } });

		// Only reject still-disabled users — a disabled guard prevents an
		// admin from nuking an enabled account through this action.
		const result = await db
			.delete(userTable)
			.where(and(eq(userTable.id, id), eq(userTable.disabled, true)))
			.returning({ id: userTable.id })
			.all();
		if (result.length === 0)
			return fail(404, { id, errors: { id: 'Not found or already approved.' } });
		return { rejected: id };
	}
};
