/**
 * Resume metadata data layer (D1/Drizzle). The file bodies live in the R2
 * `RESUMES` bucket — this module only owns the rows that describe them.
 *
 * User isolation: every function takes the acting `userId` and filters on
 * it. There is no "get any resume by id" path, so a guessed id from another
 * account is indistinguishable from a missing one (IDOR is closed here, not
 * in the route).
 *
 * `usedBy` is not a column; it is counted from `application.resume_id` so
 * the library can warn before a delete detaches live applications.
 */

import { and, count, eq, isNotNull, sql } from 'drizzle-orm';
import type { Db } from './db';
import { application, resume, rowToResume } from './db/schema';
import type { Resume } from '$lib/types';

/** Fields the caller supplies; `userId` comes from the session. */
export interface NewResume {
	id: string;
	name: string;
	r2Key: string;
	sizeBytes: number;
	contentType: string;
}

/** One query: how many of this user's applications point at each resume. */
async function usageByResumeId(db: Db, userId: string): Promise<Map<string, number>> {
	const rows = await db
		.select({ resumeId: application.resumeId, used: count() })
		.from(application)
		.where(and(eq(application.userId, userId), isNotNull(application.resumeId)))
		.groupBy(application.resumeId)
		.all();

	const map = new Map<string, number>();
	for (const r of rows) if (r.resumeId) map.set(r.resumeId, r.used);
	return map;
}

/** Every resume the user owns, newest first, with its attachment count. */
export async function listResumes(db: Db, userId: string): Promise<Resume[]> {
	const [rows, usage] = await Promise.all([
		db.select().from(resume).where(eq(resume.userId, userId)).all(),
		usageByResumeId(db, userId)
	]);
	return rows
		.map((r) => rowToResume(r, usage.get(r.id) ?? 0))
		.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * A single resume, scoped to the owner. Returns null for a missing id *or*
 * one belonging to somebody else — callers can safely 404 on null.
 */
export async function getResumeForUser(db: Db, userId: string, id: string): Promise<Resume | null> {
	const row = await db
		.select()
		.from(resume)
		.where(and(eq(resume.id, id), eq(resume.userId, userId)))
		.get();
	if (!row) return null;
	const usage = await usageByResumeId(db, userId);
	return rowToResume(row, usage.get(row.id) ?? 0);
}

/** Cheap ownership check used before attaching a resume to an application. */
export async function isResumeOwned(db: Db, userId: string, id: string): Promise<boolean> {
	const row = await db
		.select({ id: resume.id })
		.from(resume)
		.where(and(eq(resume.id, id), eq(resume.userId, userId)))
		.get();
	return row !== undefined;
}

export async function countResumes(db: Db, userId: string): Promise<number> {
	const row = await db.select({ n: count() }).from(resume).where(eq(resume.userId, userId)).get();
	return row?.n ?? 0;
}

export async function insertResume(db: Db, userId: string, input: NewResume): Promise<Resume> {
	const rows = await db
		.insert(resume)
		.values({ ...input, userId })
		.returning()
		.all();
	const row = rows[0];
	if (!row) throw new Error('resume insert returned no row');
	return rowToResume(row, 0);
}

/**
 * Delete a resume and detach it from every application that pointed at it.
 *
 * There is no FK on `application.resume_id` (see db/schema.ts), so the
 * detach is a explicit UPDATE rather than `ON DELETE SET NULL`. Active and
 * trashed rows are both covered — a trashed application restored later
 * should not resurrect a dangling resume id.
 */
export async function deleteResume(db: Db, userId: string, id: string): Promise<Resume | null> {
	const target = await getResumeForUser(db, userId, id);
	if (!target) return null;

	await db
		.update(application)
		.set({ resumeId: null, updatedAt: sql`(unixepoch())` })
		.where(and(eq(application.userId, userId), eq(application.resumeId, id)))
		.run();
	await db
		.delete(resume)
		.where(and(eq(resume.id, id), eq(resume.userId, userId)))
		.run();
	return target;
}
