/**
 * D1/Drizzle-backed application data layer.
 *
 * Every function takes the per-request Db instance (from
 * event.platform.env.DB → getDb) plus the acting userId. The exported
 * signatures mirror the in-memory stub this replaces, so route call sites
 * only change in that they now pass `db` — the user-isolation contract is
 * identical (every query filters on userId).
 *
 * Domain mapping: ISO-string dates in the domain types ↔ unix-second
 * timestamps in D1, via the row mappers in db/schema.ts.
 */

import { and, eq, gte, isNotNull, isNull, lte } from 'drizzle-orm';
import type { Db } from './db';
import {
	activityEvent,
	application,
	contact,
	interview,
	rowToActivity,
	rowToApplication,
	rowToContact,
	rowToInterview
} from './db/schema';
import type { Application, ApplicationDetail, Contact, Interview } from '$lib/types';

/** Options for `getApplicationsForUser`. */
export interface ListApplicationsOptions {
	/** Return only trashed rows (default false: only active). */
	onlyTrashed?: boolean;
}

function scopeFor(userId: string) {
	return eq(application.userId, userId);
}

/**
 * All applications for a user, ordered by most-recent stage change.
 * Excludes soft-deleted rows by default; `onlyTrashed` flips to the
 * trash view.
 */
export async function getApplicationsForUser(
	db: Db,
	userId: string,
	options: ListApplicationsOptions = {}
): Promise<Application[]> {
	const where = options.onlyTrashed
		? and(scopeFor(userId), isNotNull(application.deletedAt))
		: and(scopeFor(userId), isNull(application.deletedAt));
	const rows = await db.select().from(application).where(where).all();
	return rows
		.map(rowToApplication)
		.sort((a, b) => new Date(b.stageChangedAt).getTime() - new Date(a.stageChangedAt).getTime());
}

/** Visible-to-user check shared by every single-application read. */
function visible(app: Application | undefined, userId: string): app is Application {
	return !!app && app.userId === userId;
}

/**
 * The application + its side tables (interviews, contacts, activities) for
 * the detail modal. Returns null when the row doesn't exist, belongs to
 * another user, or is soft-deleted without `includeTrashed`.
 */
export async function getApplicationDetail(
	db: Db,
	userId: string,
	id: string,
	options: { includeTrashed?: boolean } = {}
): Promise<ApplicationDetail | null> {
	const row = await db.select().from(application).where(eq(application.id, id)).get();
	const app = row ? rowToApplication(row) : undefined;
	if (!visible(app, userId)) return null;
	if (!options.includeTrashed && app.deletedAt !== null) return null;

	const [interviewRows, contactRows, activityRows] = await Promise.all([
		db.select().from(interview).where(eq(interview.applicationId, id)).all(),
		db.select().from(contact).where(eq(contact.applicationId, id)).all(),
		db.select().from(activityEvent).where(eq(activityEvent.applicationId, id)).all()
	]);

	return {
		application: app,
		interviews: interviewRows.map(rowToInterview),
		contacts: contactRows.map(rowToContact),
		activities: activityRows.map(rowToActivity)
	};
}

export type CreateApplicationInput = Omit<
	Application,
	'id' | 'userId' | 'createdAt' | 'updatedAt' | 'stageChangedAt' | 'deletedAt'
>;

export async function createApplication(
	db: Db,
	userId: string,
	input: CreateApplicationInput
): Promise<Application> {
	const now = new Date();
	const [row] = await db
		.insert(application)
		.values({
			id: crypto.randomUUID(),
			userId,
			company: input.company,
			role: input.role,
			stage: input.stage,
			status: input.status,
			workArrangement: input.workArrangement,
			salary: input.salary,
			postingUrl: input.postingUrl,
			postingDescription: input.postingDescription,
			notes: input.notes,
			resumeId: input.resumeId,
			appliedAt: input.appliedAt ? new Date(input.appliedAt) : null,
			stageChangedAt: now,
			nextActionAt: input.nextActionAt ? new Date(input.nextActionAt) : null,
			createdAt: now,
			updatedAt: now,
			tags: input.tags
		})
		.returning()
		.all();
	const app = rowToApplication(row!);

	await db.insert(activityEvent).values({
		id: crypto.randomUUID(),
		applicationId: app.id,
		kind: 'created',
		occurredAt: now,
		fromStage: null,
		toStage: 'saved',
		note: null
	});
	return app;
}

export type UpdateApplicationInput = Partial<
	Omit<Application, 'id' | 'userId' | 'createdAt' | 'deletedAt'>
>;

export async function updateApplication(
	db: Db,
	userId: string,
	id: string,
	patch: UpdateApplicationInput
): Promise<Application | null> {
	const existingRow = await db.select().from(application).where(eq(application.id, id)).get();
	const existing = existingRow ? rowToApplication(existingRow) : undefined;
	if (!visible(existing, userId)) return null;

	const now = new Date();
	const stageChanged = patch.stage !== undefined && patch.stage !== existing.stage;
	const statusChanged = patch.status !== undefined && patch.status !== existing.status;

	const [row] = await db
		.update(application)
		.set({
			company: patch.company ?? existing.company,
			role: patch.role ?? existing.role,
			stage: patch.stage ?? existing.stage,
			status: patch.status ?? existing.status,
			workArrangement: patch.workArrangement ?? existing.workArrangement,
			salary: 'salary' in patch ? patch.salary : existing.salary,
			postingUrl: 'postingUrl' in patch ? patch.postingUrl : existing.postingUrl,
			postingDescription:
				'postingDescription' in patch ? patch.postingDescription : existing.postingDescription,
			notes: 'notes' in patch ? patch.notes : existing.notes,
			resumeId: 'resumeId' in patch ? patch.resumeId : existing.resumeId,
			appliedAt:
				'appliedAt' in patch
					? patch.appliedAt
						? new Date(patch.appliedAt)
						: null
					: (existingRow?.appliedAt ?? null),
			nextActionAt:
				'nextActionAt' in patch
					? patch.nextActionAt
						? new Date(patch.nextActionAt)
						: null
					: (existingRow?.nextActionAt ?? null),
			tags: patch.tags ?? existing.tags,
			updatedAt: now,
			// Bump stageChangedAt on stage moves so duration-in-stage resets;
			// this is the canonical place to detect the transition.
			stageChangedAt: stageChanged ? now : (existingRow?.stageChangedAt ?? now)
		})
		.where(and(eq(application.id, id), eq(application.userId, userId)))
		.returning()
		.all();
	const updated = rowToApplication(row!);

	// Activity events for the transitions.
	if (stageChanged && patch.stage) {
		await db.insert(activityEvent).values({
			id: crypto.randomUUID(),
			applicationId: id,
			kind: 'stage_changed',
			occurredAt: now,
			fromStage: existing.stage,
			toStage: patch.stage,
			note: null
		});
	}
	if (statusChanged && patch.status) {
		await db.insert(activityEvent).values({
			id: crypto.randomUUID(),
			applicationId: id,
			kind: 'status_changed',
			occurredAt: now,
			fromStage: null,
			toStage: null,
			note: `Status changed from ${existing.status} to ${patch.status}`
		});
	}
	return updated;
}

/** Soft-delete: stamps deletedAt. Idempotent — re-soft-deleting is a no-op. */
export async function softDeleteApplication(
	db: Db,
	userId: string,
	id: string
): Promise<Application | null> {
	const existingRow = await db.select().from(application).where(eq(application.id, id)).get();
	const existing = existingRow ? rowToApplication(existingRow) : undefined;
	if (!visible(existing, userId)) return null;
	if (existing.deletedAt !== null) return existing;

	const [row] = await db
		.update(application)
		.set({ deletedAt: new Date(), updatedAt: new Date() })
		.where(and(eq(application.id, id), eq(application.userId, userId)))
		.returning()
		.all();
	return rowToApplication(row!);
}

/** Restore a soft-deleted row (trash → active). */
export async function restoreApplication(
	db: Db,
	userId: string,
	id: string
): Promise<Application | null> {
	const existingRow = await db.select().from(application).where(eq(application.id, id)).get();
	const existing = existingRow ? rowToApplication(existingRow) : undefined;
	if (!visible(existing, userId)) return null;
	if (existing.deletedAt === null) return existing;

	const [row] = await db
		.update(application)
		.set({ deletedAt: null, updatedAt: new Date() })
		.where(and(eq(application.id, id), eq(application.userId, userId)))
		.returning()
		.all();
	return rowToApplication(row!);
}

/**
 * Hard-delete: removes the row; cascades take the side tables. Irreversible.
 * D1 supports FK cascade (deferred by default in migrations), so one delete
 * statement suffices.
 */
export async function permanentlyDeleteApplication(
	db: Db,
	userId: string,
	id: string
): Promise<boolean> {
	const result = await db
		.delete(application)
		.where(and(eq(application.id, id), eq(application.userId, userId)))
		.run();
	return result.success;
}

// ---- Interview / Contact CRUD ----

export type CreateInterviewInput = Omit<Interview, 'id' | 'applicationId' | 'createdAt'>;

export async function addInterview(
	db: Db,
	userId: string,
	applicationId: string,
	input: CreateInterviewInput
): Promise<Interview | null> {
	const appRow = await db.select().from(application).where(eq(application.id, applicationId)).get();
	if (!appRow || appRow.userId !== userId) return null;

	const [row] = await db
		.insert(interview)
		.values({
			id: crypto.randomUUID(),
			applicationId,
			kind: input.kind,
			scheduledAt: new Date(input.scheduledAt),
			durationMinutes: input.durationMinutes,
			withName: input.withName,
			withRole: input.withRole,
			notes: input.notes,
			outcome: input.outcome ?? null,
			createdAt: new Date()
		})
		.returning()
		.all();

	// Mirror to the activity timeline.
	await db.insert(activityEvent).values({
		id: crypto.randomUUID(),
		applicationId,
		kind: 'interview_scheduled',
		occurredAt: new Date(),
		fromStage: null,
		toStage: null,
		note: `${input.kind} on ${input.scheduledAt}`
	});
	return rowToInterview(row!);
}

export type CreateContactInput = Omit<Contact, 'id' | 'applicationId' | 'createdAt'>;

export async function addContact(
	db: Db,
	userId: string,
	applicationId: string,
	input: CreateContactInput
): Promise<Contact | null> {
	const appRow = await db.select().from(application).where(eq(application.id, applicationId)).get();
	if (!appRow || appRow.userId !== userId) return null;

	const [row] = await db
		.insert(contact)
		.values({
			id: crypto.randomUUID(),
			applicationId,
			name: input.name,
			role: input.role,
			company: input.company,
			email: input.email,
			phone: input.phone,
			notes: input.notes,
			createdAt: new Date()
		})
		.returning()
		.all();

	await db.insert(activityEvent).values({
		id: crypto.randomUUID(),
		applicationId,
		kind: 'contact_added',
		occurredAt: new Date(),
		fromStage: null,
		toStage: null,
		note: `${input.name}${input.role ? ` (${input.role})` : ''}`
	});
	return rowToContact(row!);
}

/** Stage-change counts per day for the velocity chart (server-computed). */
export interface StageMoveEvent {
	occurredAt: string;
}

// ---- Batched dashboard aggregate ----

/**
 * One D1 round-trip for the dashboard rollups (list, trash count,
 * upcoming interviews, stage moves). D1's batched statements share a
 * single HTTP session — 4 sequential queries become 1 round-trip
 * (drizzle-research.md "D1's prepared-statement batching").
 */
export async function getDashboardData(
	db: Db,
	userId: string,
	windowDays: number
): Promise<{
	active: Application[];
	trashedCount: number;
	upcomingInterviews: Interview[];
	stageMoves: StageMoveEvent[];
}> {
	const now = Date.now();
	const since = new Date(now - 24 * 60 * 60 * 1000);
	const until = new Date(now + windowDays * 24 * 60 * 60 * 1000);

	const scope = eq(application.userId, userId);
	const [activeRows, trashCountRows, interviewRows, moveRows] = await Promise.all([
		db
			.select()
			.from(application)
			.where(and(scope, isNull(application.deletedAt)))
			.all(),
		db
			.select({ id: application.id })
			.from(application)
			.where(and(scope, isNotNull(application.deletedAt)))
			.all(),
		db
			.select({ iv: interview })
			.from(interview)
			.innerJoin(application, eq(interview.applicationId, application.id))
			.where(
				and(
					scope,
					isNull(application.deletedAt),
					eq(interview.outcome, 'pending'),
					gte(interview.scheduledAt, since),
					lte(interview.scheduledAt, until)
				)
			)
			.all(),
		db
			.select({ occurredAt: activityEvent.occurredAt })
			.from(activityEvent)
			.innerJoin(application, eq(activityEvent.applicationId, application.id))
			.where(and(scope, isNull(application.deletedAt), eq(activityEvent.kind, 'stage_changed')))
			.all()
	]);

	return {
		active: activeRows
			.map(rowToApplication)
			.sort((a, b) => new Date(b.stageChangedAt).getTime() - new Date(a.stageChangedAt).getTime()),
		trashedCount: trashCountRows.length,
		upcomingInterviews: interviewRows.map((r) => rowToInterview(r.iv)),
		stageMoves: moveRows.map((r) => ({ occurredAt: r.occurredAt.toISOString() }))
	};
}
