/**
 * Drizzle schema for the job tracker (D1 / SQLite).
 *
 * Conventions (from docs/research/drizzle.md):
 * - Money as integer minor units (never floats).
 * - Dates as `integer('...', { mode: 'timestamp' })` (unix seconds) at the DB
 *   boundary; the data layer maps to ISO strings for the domain types.
 * - Snake_case column names, camelCase TS properties.
 * - Tables in dependency order (no forward references).
 *
 * Auth tables follow the Better Auth core schema (user/session/account/
 * verification) plus the `admin` plugin columns (role, banned, banReason,
 * banExpires) and the `username` plugin columns (username, displayUsername).
 * `disabled` is our approval-queue gate: sign-ups land disabled and an
 * admin flips them via /admin/approvals.
 */

import { relations, sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type {
	ActivityEvent,
	Application,
	ApplicationStage,
	ApplicationStatus,
	Contact,
	Interview,
	Resume,
	Salary,
	WorkArrangement
} from '$lib/types';

// ---------------------------------------------------------------------------
// Better Auth core tables
// ---------------------------------------------------------------------------

export const user = sqliteTable(
	'user',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		email: text('email').notNull().unique(),
		emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
		image: text('image'),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
		// admin plugin
		role: text('role').notNull().default('user'),
		banned: integer('banned', { mode: 'boolean' }).notNull().default(false),
		banReason: text('ban_reason'),
		banExpires: integer('ban_expires', { mode: 'timestamp' }),
		// username plugin
		username: text('username').unique(),
		displayUsername: text('display_username'),
		// approval queue: sign-ups start disabled until an admin approves.
		disabled: integer('disabled', { mode: 'boolean' }).notNull().default(true)
	},
	(t) => [uniqueIndex('user_username_unique').on(t.username)]
);

export const session = sqliteTable('session', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	token: text('token').notNull().unique(),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`),
	ipAddress: text('ip_address'),
	userAgent: text('user_agent'),
	// admin plugin
	impersonatedBy: text('impersonated_by')
});

export const account = sqliteTable(
	'account',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		accountId: text('account_id').notNull(),
		providerId: text('provider_id').notNull(),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		idToken: text('id_token'),
		accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
		refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
		scope: text('scope'),
		password: text('password'),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(t) => [uniqueIndex('account_provider_id_account_id_unique').on(t.providerId, t.accountId)]
);

export const verification = sqliteTable('verification', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
});

/**
 * Better Auth rate-limit counters (`rateLimit.storage: 'database'` —
 * required on Workers, where per-isolate memory resets between requests
 * and a memory-backed limiter is decorative). Shape per Better Auth's
 * schema validator: `id` on every model + key unique, count, lastRequest ms.
 */
export const rateLimit = sqliteTable('rate_limit', {
	id: text('id').primaryKey(),
	key: text('key').notNull().unique(),
	count: integer('count').notNull().default(0),
	lastRequest: integer('last_request', { mode: 'number' }).notNull()
});

// ---------------------------------------------------------------------------
// App tables
// ---------------------------------------------------------------------------

/**
 * Uploaded resume PDFs. The file body lives in the R2 `RESUMES` bucket under
 * `${userId}/${id}.pdf`; this table holds only metadata + ownership, so every
 * read can be scoped by userId.
 *
 * R2 objects are only ever removed by the caller that owns the row:
 * `/api/resumes/[id]` DELETE, and the upload rollback in `/api/resumes`
 * POST. Deleting a *user* cascades their resume rows out of D1 but does not
 * reach into the bucket — which is safe today only because the one path that
 * deletes a user (`reject` in /admin/approvals) can only target a disabled
 * account, and disabled accounts never hold a session, so they cannot have
 * uploaded anything. If a user delete is ever added for approved accounts,
 * it has to sweep `${userId}/` from R2 as well.
 *
 * Deliberately no FK on `application.resume_id`: in SQLite that would force
 * drizzle-kit to rebuild the `application` table (drop + recreate + copy), and
 * the detach behaviour we actually want is explicit in `deleteResume()`.
 */
export const resume = sqliteTable(
	'resume',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		/** Original filename — display only, never used to build a path. */
		name: text('name').notNull(),
		/** Object key inside the RESUMES bucket. */
		r2Key: text('r2_key').notNull(),
		sizeBytes: integer('size_bytes').notNull(),
		contentType: text('content_type').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(t) => [index('resume_user_idx').on(t.userId)]
);

/**
 * Applications. Salary is stored as a JSON text blob (minor units + shape)
 * because the domain `Salary` is a 4-way union; mapping it to flat columns
 * would require nullable min/max columns + a shape discriminator — the JSON
 * blob keeps one source of truth. Money inside is integer minor units.
 */
export const application = sqliteTable(
	'application',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		company: text('company').notNull(),
		role: text('role').notNull(),
		stage: text('stage', {
			enum: [
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
			] as const
		}).notNull(),
		status: text('status', {
			enum: ['active', 'stalled', 'ghosted', 'paused', 'closed'] as const
		}).notNull(),
		workArrangement: text('work_arrangement', {
			enum: ['remote', 'hybrid', 'onsite', 'unspecified'] as const
		}).notNull(),
		salary: text('salary', { mode: 'json' }).$type<Salary>(),
		postingUrl: text('posting_url'),
		postingDescription: text('posting_description'),
		notes: text('notes'),
		resumeId: text('resume_id'),
		appliedAt: integer('applied_at', { mode: 'timestamp' }),
		stageChangedAt: integer('stage_changed_at', { mode: 'timestamp' }).notNull(),
		nextActionAt: integer('next_action_at', { mode: 'timestamp' }),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`),
		tags: text('tags', { mode: 'json' })
			.$type<string[]>()
			.notNull()
			.default(sql`'[]'`),
		deletedAt: integer('deleted_at', { mode: 'timestamp' })
	},
	(t) => [
		index('application_user_idx').on(t.userId),
		index('application_user_deleted_idx').on(t.userId, t.deletedAt)
	]
);

export const interview = sqliteTable(
	'interview',
	{
		id: text('id').primaryKey(),
		applicationId: text('application_id')
			.notNull()
			.references(() => application.id, { onDelete: 'cascade' }),
		kind: text('kind', {
			enum: ['phone_screen', 'technical', 'onsite', 'final', 'coffee_chat', 'other'] as const
		}).notNull(),
		scheduledAt: integer('scheduled_at', { mode: 'timestamp' }).notNull(),
		durationMinutes: integer('duration_minutes'),
		withName: text('with_name'),
		withRole: text('with_role'),
		notes: text('notes'),
		outcome: text('outcome', { enum: ['pending', 'passed', 'failed', 'cancelled'] as const }),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(t) => [index('interview_application_idx').on(t.applicationId)]
);

export const contact = sqliteTable(
	'contact',
	{
		id: text('id').primaryKey(),
		applicationId: text('application_id')
			.notNull()
			.references(() => application.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		role: text('role'),
		company: text('company'),
		email: text('email'),
		phone: text('phone'),
		notes: text('notes'),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(t) => [index('contact_application_idx').on(t.applicationId)]
);

export const activityEvent = sqliteTable(
	'activity_event',
	{
		id: text('id').primaryKey(),
		applicationId: text('application_id')
			.notNull()
			.references(() => application.id, { onDelete: 'cascade' }),
		kind: text('kind', {
			enum: [
				'created',
				'stage_changed',
				'interview_scheduled',
				'status_changed',
				'contact_added'
			] as const
		}).notNull(),
		occurredAt: integer('occurred_at', { mode: 'timestamp' }).notNull(),
		fromStage: text('from_stage', {
			enum: [
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
			] as const
		}),
		toStage: text('to_stage', {
			enum: [
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
			] as const
		}),
		note: text('note')
	},
	(t) => [index('activity_application_idx').on(t.applicationId, t.occurredAt)]
);

// ---------------------------------------------------------------------------
// Relations (v1 API — drizzle-orm 0.45.2, see docs/research/drizzle.md; the 1.0 RC
// defineRelations API is not published yet, research note updated accordingly)
// ---------------------------------------------------------------------------

export const userRelations = relations(user, ({ many }) => ({
	// Better Auth core: account + session rows hang off the user.
	accounts: many(account),
	sessions: many(session),
	applications: many(application),
	resumes: many(resume)
}));

export const resumeRelations = relations(resume, ({ one }) => ({
	user: one(user, { fields: [resume.userId], references: [user.id] })
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, { fields: [session.userId], references: [user.id] })
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, { fields: [account.userId], references: [user.id] })
}));

export const applicationRelations = relations(application, ({ one, many }) => ({
	user: one(user, { fields: [application.userId], references: [user.id] }),
	interviews: many(interview),
	contacts: many(contact),
	activities: many(activityEvent)
}));

export const interviewRelations = relations(interview, ({ one }) => ({
	application: one(application, {
		fields: [interview.applicationId],
		references: [application.id]
	})
}));

export const contactRelations = relations(contact, ({ one }) => ({
	application: one(application, {
		fields: [contact.applicationId],
		references: [application.id]
	})
}));

export const activityEventRelations = relations(activityEvent, ({ one }) => ({
	application: one(application, {
		fields: [activityEvent.applicationId],
		references: [application.id]
	})
}));

// ---------------------------------------------------------------------------
// Row <-> domain mappers. The domain types (src/lib/types.ts) use ISO strings;
// D1 stores unix seconds. These mappers are the ONLY conversion point.
// ---------------------------------------------------------------------------

type ApplicationRow = typeof application.$inferSelect;
type ResumeRow = typeof resume.$inferSelect;
type InterviewRow = typeof interview.$inferSelect;
type ContactRow = typeof contact.$inferSelect;
type ActivityRow = typeof activityEvent.$inferSelect;

function ts(d: Date | null | undefined): string | null {
	return d ? d.toISOString() : null;
}

function tsReq(d: Date): string {
	return d.toISOString();
}

export function rowToApplication(r: ApplicationRow): Application {
	return {
		id: r.id,
		userId: r.userId,
		company: r.company,
		role: r.role,
		stage: r.stage,
		status: r.status,
		workArrangement: r.workArrangement,
		salary: r.salary ?? null,
		postingUrl: r.postingUrl,
		postingDescription: r.postingDescription,
		notes: r.notes,
		resumeId: r.resumeId,
		appliedAt: ts(r.appliedAt),
		stageChangedAt: tsReq(r.stageChangedAt),
		nextActionAt: ts(r.nextActionAt),
		createdAt: tsReq(r.createdAt),
		updatedAt: tsReq(r.updatedAt),
		tags: r.tags ?? [],
		deletedAt: ts(r.deletedAt)
	};
}

/**
 * `usedBy` is not a column — it is the count of this user's applications
 * pointing at the row, supplied by the data layer's aggregate so the library
 * can warn before a delete detaches them.
 */
export function rowToResume(r: ResumeRow, usedBy: number): Resume {
	return {
		id: r.id,
		userId: r.userId,
		name: r.name,
		r2Key: r.r2Key,
		sizeBytes: r.sizeBytes,
		contentType: r.contentType,
		createdAt: tsReq(r.createdAt),
		usedBy
	};
}

export function rowToInterview(r: InterviewRow): Interview {
	return {
		id: r.id,
		applicationId: r.applicationId,
		kind: r.kind,
		scheduledAt: tsReq(r.scheduledAt),
		durationMinutes: r.durationMinutes,
		withName: r.withName,
		withRole: r.withRole,
		notes: r.notes,
		outcome: r.outcome ?? null,
		createdAt: tsReq(r.createdAt)
	};
}

export function rowToContact(r: ContactRow): Contact {
	return {
		id: r.id,
		applicationId: r.applicationId,
		name: r.name,
		role: r.role,
		company: r.company,
		email: r.email,
		phone: r.phone,
		notes: r.notes,
		createdAt: tsReq(r.createdAt)
	};
}

export function rowToActivity(r: ActivityRow): ActivityEvent {
	return {
		id: r.id,
		applicationId: r.applicationId,
		kind: r.kind,
		occurredAt: tsReq(r.occurredAt),
		fromStage: r.fromStage ?? null,
		toStage: r.toStage ?? null,
		note: r.note
	};
}

// Re-export domain unions for the data layer's insert typing.
export type { ApplicationStage, ApplicationStatus, WorkArrangement };
