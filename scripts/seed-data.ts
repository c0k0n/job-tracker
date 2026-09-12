/**
 * Pure SQL generation for the local seed. Kept separate from scripts/seed.ts
 * so the data is reviewable without the process plumbing.
 *
 * Shapes match src/lib/server/db/schema.ts exactly (snake_case columns,
 * unix-second timestamps, JSON-text salary/tags).
 */

interface SeedAdmin {
	email: string;
	name: string;
	passwordHash: string;
}

const DAY = 24 * 60 * 60;

function daysAgo(n: number): number {
	return Math.floor(Date.now() / 1000) - n * DAY;
}

function daysAhead(n: number): number {
	return Math.floor(Date.now() / 1000) + n * DAY;
}

type SeedApp = {
	id: string;
	company: string;
	role: string;
	stage: string;
	status: string;
	workArrangement: string;
	salary: string;
	postingUrl: string | null;
	postingDescription: string | null;
	notes: string | null;
	resumeId: string | null;
	appliedAt: number | null;
	stageChangedAt: number;
	nextActionAt: number | null;
	tags: string;
};

const APPS: SeedApp[] = [
	{
		id: 'seed-app-1',
		company: 'Acme Robotics',
		role: 'Senior Frontend Engineer',
		stage: 'onsite',
		status: 'active',
		workArrangement: 'remote',
		salary: JSON.stringify({
			shape: 'range',
			minMinorUnits: 14000000,
			maxMinorUnits: 17000000,
			currency: 'USD'
		}),
		postingUrl: 'https://acme.example/jobs/sfe',
		postingDescription:
			'Own the design-system and accessibility layers across our robotics dashboard.',
		notes: null,
		resumeId: 'resume-acme',
		appliedAt: daysAgo(21),
		stageChangedAt: daysAgo(4),
		nextActionAt: daysAhead(2),
		tags: JSON.stringify(['robotics', 'design-systems', 'remote'])
	},
	{
		id: 'seed-app-2',
		company: 'Stripe',
		role: 'Staff Engineer, Developer Experience',
		stage: 'final',
		status: 'active',
		workArrangement: 'hybrid',
		salary: JSON.stringify({
			shape: 'range',
			minMinorUnits: 21000000,
			maxMinorUnits: 26000000,
			currency: 'USD'
		}),
		postingUrl: 'https://stripe.com/jobs/staff-dx',
		postingDescription: "Lead the SDK surface area and improve DX across Stripe's APIs.",
		notes: 'Final round scheduled with the platform team.',
		resumeId: 'resume-stripe',
		appliedAt: daysAgo(38),
		stageChangedAt: daysAgo(6),
		nextActionAt: daysAhead(1),
		tags: JSON.stringify(['payments', 'developer-tools', 'high-priority'])
	},
	{
		id: 'seed-app-3',
		company: 'Figma',
		role: 'Design Engineer',
		stage: 'offer',
		status: 'active',
		workArrangement: 'remote',
		salary: JSON.stringify({ shape: 'exact', minorUnits: 18500000, currency: 'USD' }),
		postingUrl: 'https://figma.com/careers/design-engineer',
		postingDescription: 'Build the next-generation canvas surface for collaborative design.',
		notes: 'Verbal offer received.',
		resumeId: 'resume-figma',
		appliedAt: daysAgo(52),
		stageChangedAt: daysAgo(3),
		nextActionAt: daysAhead(5),
		tags: JSON.stringify(['design-tools', 'remote', 'dream-company'])
	},
	{
		id: 'seed-app-4',
		company: 'Linear',
		role: 'Senior Software Engineer',
		stage: 'phone_screen',
		status: 'active',
		workArrangement: 'remote',
		salary: JSON.stringify({
			shape: 'range',
			minMinorUnits: 16000000,
			maxMinorUnits: 19500000,
			currency: 'USD'
		}),
		postingUrl: 'https://linear.app/careers',
		postingDescription: 'Ship the fastest issue tracker on the planet.',
		notes: null,
		resumeId: 'resume-linear',
		appliedAt: daysAgo(11),
		stageChangedAt: daysAgo(2),
		nextActionAt: daysAhead(3),
		tags: JSON.stringify(['saas', 'remote'])
	},
	{
		id: 'seed-app-5',
		company: 'Datadog',
		role: 'Frontend Engineer, Observability',
		stage: 'applied',
		status: 'stalled',
		workArrangement: 'hybrid',
		salary: JSON.stringify({ shape: 'min_only', minMinorUnits: 15000000, currency: 'USD' }),
		postingUrl: 'https://www.datadoghq.com/careers/',
		postingDescription: 'Charts, dashboards, and the data density problem.',
		notes: 'Follow-up email sent last week; no reply yet.',
		resumeId: 'resume-datadog',
		appliedAt: daysAgo(30),
		stageChangedAt: daysAgo(29),
		nextActionAt: null,
		tags: JSON.stringify(['observability', 'hybrid'])
	},
	{
		id: 'seed-app-6',
		company: 'OpenAI',
		role: 'Member of Technical Staff, Web',
		stage: 'rejected',
		status: 'closed',
		workArrangement: 'onsite',
		salary: JSON.stringify({ shape: 'max_only', maxMinorUnits: 30000000, currency: 'USD' }),
		postingUrl: 'https://openai.com/careers',
		postingDescription: 'Frontend for research tooling.',
		notes: 'Rejected after technical; good experience overall.',
		resumeId: 'resume-openai',
		appliedAt: daysAgo(60),
		stageChangedAt: daysAgo(10),
		nextActionAt: null,
		tags: JSON.stringify(['ai', 'research'])
	}
];

/** Interview rows (upcoming, pending) so the KPI has real data. */
const INTERVIEWS = [
	{
		id: 'seed-int-1',
		applicationId: 'seed-app-1',
		kind: 'onsite',
		scheduledAt: daysAhead(2),
		withName: 'Priya N.',
		notes: 'Full loop, 4 sessions.'
	},
	{
		id: 'seed-int-2',
		applicationId: 'seed-app-2',
		kind: 'final',
		scheduledAt: daysAhead(1),
		withName: 'Marcus L.',
		notes: 'Platform team panel.'
	},
	{
		id: 'seed-int-3',
		applicationId: 'seed-app-4',
		kind: 'phone_screen',
		scheduledAt: daysAhead(3),
		withName: null,
		notes: null
	}
];

/** Stage-change activity events matching each app's history. */
function activitiesFor(): {
	id: string;
	applicationId: string;
	kind: string;
	occurredAt: number;
	fromStage: string | null;
	toStage: string;
	note: string | null;
}[] {
	const events: {
		id: string;
		applicationId: string;
		kind: string;
		occurredAt: number;
		fromStage: string | null;
		toStage: string;
		note: string | null;
	}[] = [];
	for (const app of APPS) {
		const createdAt = app.appliedAt ?? daysAgo(90);
		events.push({
			id: `${app.id}-evt-0`,
			applicationId: app.id,
			kind: 'created',
			occurredAt: createdAt,
			fromStage: null,
			toStage: 'saved',
			note: null
		});
		if (app.stage !== 'saved') {
			events.push({
				id: `${app.id}-evt-1`,
				applicationId: app.id,
				kind: 'stage_changed',
				occurredAt: app.appliedAt ?? app.stageChangedAt,
				fromStage: 'saved',
				toStage: app.appliedAt && app.stage !== 'applied' ? 'applied' : app.stage,
				note: null
			});
		}
		if (app.appliedAt && app.stage !== 'saved' && app.stage !== 'applied') {
			events.push({
				id: `${app.id}-evt-2`,
				applicationId: app.id,
				kind: 'stage_changed',
				occurredAt: app.stageChangedAt,
				fromStage: 'applied',
				toStage: app.stage,
				note: null
			});
		}
	}
	return events;
}

// SQL string escaping for text columns.
function q(value: string | null): string {
	if (value === null) return 'NULL';
	return `'${value.replaceAll("'", "''")}'`;
}

function qJson(value: string): string {
	return q(value);
}

function qNum(value: number | null): string {
	return value === null ? 'NULL' : String(value);
}

export function generateSeedSQL({ admin }: { admin: SeedAdmin }): string {
	const now = Math.floor(Date.now() / 1000);
	const userId = 'seed-user-admin';
	const username = admin.email.split('@')[0]!;

	const userRow = `INSERT OR REPLACE INTO user (id, name, email, email_verified, image, created_at, updated_at, role, banned, ban_reason, ban_expires, username, display_username, disabled)
VALUES (${q(userId)}, ${q(admin.name)}, ${q(admin.email)}, 1, NULL, ${now}, ${now}, 'admin', 0, NULL, NULL, ${q(username)}, ${q(admin.name)}, 0);`;

	const accountRow = `INSERT OR REPLACE INTO account (id, user_id, account_id, provider_id, access_token, refresh_token, id_token, access_token_expires_at, refresh_token_expires_at, scope, password, created_at, updated_at)
VALUES ('seed-account-admin', ${q(userId)}, ${q(userId)}, 'credential', NULL, NULL, NULL, NULL, NULL, NULL, ${q(admin.passwordHash)}, ${now}, ${now});`;

	const appRows = APPS.map(
		(
			app
		) => `INSERT OR REPLACE INTO application (id, user_id, company, role, stage, status, work_arrangement, salary, posting_url, posting_description, notes, resume_id, applied_at, stage_changed_at, next_action_at, created_at, updated_at, tags, deleted_at)
VALUES (${q(app.id)}, ${q(userId)}, ${q(app.company)}, ${q(app.role)}, ${q(app.stage)}, ${q(app.status)}, ${q(app.workArrangement)}, ${qJson(app.salary)}, ${q(app.postingUrl)}, ${q(app.postingDescription)}, ${q(app.notes)}, ${q(app.resumeId)}, ${qNum(app.appliedAt)}, ${qNum(app.stageChangedAt)}, ${qNum(app.nextActionAt)}, ${qNum(app.appliedAt ?? now)}, ${now}, ${qJson(app.tags)}, NULL);`
	);

	const interviewRows = INTERVIEWS.map(
		(
			iv
		) => `INSERT OR REPLACE INTO interview (id, application_id, kind, scheduled_at, duration_minutes, with_name, with_role, notes, outcome, created_at)
VALUES (${q(iv.id)}, ${q(iv.applicationId)}, ${q(iv.kind)}, ${qNum(iv.scheduledAt)}, 60, ${q(iv.withName)}, NULL, ${q(iv.notes)}, 'pending', ${now});`
	);

	const activityRows = activitiesFor().map(
		(
			ev
		) => `INSERT OR REPLACE INTO activity_event (id, application_id, kind, occurred_at, from_stage, to_stage, note)
VALUES (${q(ev.id)}, ${q(ev.applicationId)}, ${q(ev.kind)}, ${qNum(ev.occurredAt)}, ${q(ev.fromStage)}, ${q(ev.toStage)}, ${q(ev.note)});`
	);

	return [userRow, accountRow, ...appRows, ...interviewRows, ...activityRows].join('\n');
}
