/**
 * In-memory application data store.
 *
 * Stub for the eventual D1 / Drizzle backend. The shape of every function
 * here matches what the eventual Drizzle-backed implementation will
 * return, so swapping in real persistence is mechanical.
 *
 * Behavior:
 *   - Module-scoped Map keyed by application id.
 *   - Seeded on first import with 18 rich fixtures (covers every funnel
 *     stage, every status, mixed currencies and salary shapes, plus
 *     resume references) so the dashboard renders meaningfully even
 *     before any backend work.
 *   - Survives HMR via `globalThis` so dev-server reloads keep state.
 *
 * Production swap-in (illustrative, not implemented):
 *   - getApplicationsForUser(userId) → db.select().from(application).where(eq(application.userId, userId))
 *   - createApplication(userId, input) → db.insert(application).values(...).returning()
 *   - updateApplication(userId, id, patch) → db.update(application).set(patch).where(...).returning()
 *   - deleteApplication(userId, id) → db.delete(application).where(...).returning()
 */

import type {
	Application,
	ApplicationStage,
	ApplicationStatus,
	CurrencyCode,
	Salary,
	WorkArrangement
} from '$lib/types';

const STORE_KEY = Symbol.for('job-tracker.applications.store.v1');

interface StubApp {
	company: string;
	role: string;
	stage: ApplicationStage;
	status: ApplicationStatus;
	workArrangement: WorkArrangement;
	salary: Salary | null;
	postingUrl: string | null;
	postingDescription: string | null;
	notes: string | null;
	resumeId: string | null;
	appliedDaysAgo: number | null;
	stageDays: number;
	nextActionDays: number | null;
	tags?: string[];
}

function daysAgoIso(days: number): string {
	const d = new Date();
	d.setDate(d.getDate() - days);
	return d.toISOString();
}

function daysAheadIso(days: number): string {
	const d = new Date();
	d.setDate(d.getDate() + days);
	return d.toISOString();
}

const FIXTURES: StubApp[] = [
	{
		company: 'Acme Robotics',
		role: 'Senior Frontend Engineer',
		stage: 'onsite',
		status: 'active',
		workArrangement: 'remote',
		salary: { shape: 'range', minMinorUnits: 14000000, maxMinorUnits: 17000000, currency: 'USD' },
		postingUrl: 'https://acme.example/jobs/sfe',
		postingDescription:
			'Own the design-system and accessibility layers across our robotics dashboard.',
		notes: null,
		resumeId: 'resume-acme',
		appliedDaysAgo: 21,
		stageDays: 4,
		nextActionDays: 2,
		tags: ['robotics', 'design-systems', 'remote']
	},
	{
		company: 'Stripe',
		role: 'Staff Engineer, Developer Experience',
		stage: 'final',
		status: 'active',
		workArrangement: 'hybrid',
		salary: { shape: 'range', minMinorUnits: 21000000, maxMinorUnits: 26000000, currency: 'USD' },
		postingUrl: 'https://stripe.com/jobs/staff-dx',
		postingDescription: "Lead the SDK surface area and improve DX across Stripe's APIs.",
		notes: 'Final round scheduled with the platform team.',
		resumeId: 'resume-stripe',
		appliedDaysAgo: 38,
		stageDays: 6,
		nextActionDays: 1,
		tags: ['payments', 'developer-tools', 'high-priority', 'dream-company']
	},
	{
		company: 'Figma',
		role: 'Design Engineer',
		stage: 'offer',
		status: 'active',
		workArrangement: 'remote',
		salary: { shape: 'exact', minorUnits: 18500000, currency: 'USD' },
		postingUrl: 'https://figma.com/careers/design-engineer',
		postingDescription: 'Build the next-generation canvas surface for collaborative design.',
		notes: 'Verbal offer received.',
		resumeId: 'resume-figma',
		appliedDaysAgo: 52,
		stageDays: 3,
		nextActionDays: 0,
		tags: ['design-tools', 'remote', 'high-priority', 'dream-company']
	},
	{
		company: 'Linear',
		role: 'Senior Software Engineer',
		stage: 'phone_screen',
		status: 'active',
		workArrangement: 'remote',
		salary: { shape: 'range', minMinorUnits: 16000000, maxMinorUnits: 19500000, currency: 'USD' },
		postingUrl: 'https://linear.app/careers/sse',
		postingDescription: 'Help build the fastest issue tracker in the world.',
		notes: null,
		resumeId: 'resume-linear',
		appliedDaysAgo: 6,
		stageDays: 1,
		nextActionDays: 3,
		tags: ['productivity', 'remote', 'dream-company', 'startup']
	},
	{
		company: 'Vercel',
		role: 'Frontend Platform Engineer',
		stage: 'technical',
		status: 'active',
		workArrangement: 'remote',
		salary: { shape: 'range', minMinorUnits: 15000000, maxMinorUnits: 18000000, currency: 'USD' },
		postingUrl: 'https://vercel.com/careers/frontend-platform',
		postingDescription: 'Build the next-generation Next.js dev experience.',
		notes: 'Take-home assigned.',
		resumeId: null,
		appliedDaysAgo: 12,
		stageDays: 2,
		nextActionDays: 4,
		tags: ['developer-tools', 'remote', 'startup', 'high-priority']
	},
	{
		company: 'GitLab',
		role: 'Senior Frontend Engineer (EMEA)',
		stage: 'applied',
		status: 'active',
		workArrangement: 'remote',
		salary: { shape: 'range', minMinorUnits: 8500000, maxMinorUnits: 10500000, currency: 'EUR' },
		postingUrl: 'https://about.gitlab.com/jobs',
		postingDescription: 'Frontend engineer for the GitLab DevSecOps platform.',
		notes: null,
		resumeId: null,
		appliedDaysAgo: 3,
		stageDays: 3,
		nextActionDays: 7,
		tags: ['devsecops', 'remote', 'big-tech']
	},
	{
		company: 'SmartBank',
		role: 'Frontend Engineer (Tokyo)',
		stage: 'phone_screen',
		status: 'active',
		workArrangement: 'onsite',
		salary: { shape: 'exact', minorUnits: 11500000, currency: 'JPY' },
		postingUrl: 'https://smartbank.example/jobs',
		postingDescription: 'Build the consumer banking UI used by 3M+ customers.',
		notes: 'Recruiter from Tokyo office.',
		resumeId: null,
		appliedDaysAgo: 9,
		stageDays: 1,
		nextActionDays: 5,
		tags: ['fintech', 'onsite', 'japan']
	},
	{
		company: 'Wise',
		role: 'Product Engineer',
		stage: 'applied',
		status: 'active',
		workArrangement: 'hybrid',
		salary: { shape: 'min_only', minMinorUnits: 7500000, currency: 'GBP' },
		postingUrl: 'https://wise.com/careers',
		postingDescription: 'Build features across the Wise money-transfer product.',
		notes: null,
		resumeId: null,
		appliedDaysAgo: 5,
		stageDays: 5,
		nextActionDays: 10,
		tags: ['fintech', 'high-priority', 'referral']
	},
	{
		company: 'Razorpay',
		role: 'Senior Frontend Engineer',
		stage: 'applied',
		status: 'active',
		workArrangement: 'remote',
		salary: { shape: 'max_only', maxMinorUnits: 45000000, currency: 'INR' },
		postingUrl: 'https://razorpay.com/jobs',
		postingDescription: "Frontend engineer for Razorpay's payment-gateway dashboard.",
		notes: null,
		resumeId: null,
		appliedDaysAgo: 2,
		stageDays: 2,
		nextActionDays: 7,
		tags: ['fintech', 'remote', 'india']
	},
	{
		company: 'Cloudflare',
		role: 'Senior Engineer, Workers',
		stage: 'applied',
		status: 'stalled',
		workArrangement: 'remote',
		salary: { shape: 'range', minMinorUnits: 15500000, maxMinorUnits: 18500000, currency: 'USD' },
		postingUrl: 'https://cloudflare.com/careers',
		postingDescription: 'Work on the Cloudflare Workers runtime.',
		notes: 'No reply after 34 days.',
		resumeId: null,
		appliedDaysAgo: 34,
		stageDays: 34,
		nextActionDays: null,
		tags: ['developer-tools', 'remote', 'big-tech']
	},
	{
		company: 'Notion',
		role: 'Senior Frontend Engineer',
		stage: 'phone_screen',
		status: 'ghosted',
		workArrangement: 'hybrid',
		salary: { shape: 'range', minMinorUnits: 17000000, maxMinorUnits: 20000000, currency: 'USD' },
		postingUrl: 'https://notion.so/careers',
		postingDescription: "Build Notion's editor and collaboration surfaces.",
		notes: 'Recruiter went silent after first call.',
		resumeId: null,
		appliedDaysAgo: 41,
		stageDays: 28,
		nextActionDays: null,
		tags: ['productivity', 'big-tech', 'dream-company']
	},
	{
		company: 'Datadog',
		role: 'Senior Product Engineer',
		stage: 'final',
		status: 'paused',
		workArrangement: 'hybrid',
		salary: { shape: 'range', minMinorUnits: 19000000, maxMinorUnits: 22000000, currency: 'USD' },
		postingUrl: 'https://datadoghq.com/careers',
		postingDescription: "Build dashboards and analytics for Datadog's platform.",
		notes: 'Paused while I decide between this and Stripe.',
		resumeId: 'resume-datadog',
		appliedDaysAgo: 60,
		stageDays: 18,
		nextActionDays: 14,
		tags: ['observability', 'big-tech', 'high-priority', 'dream-company']
	},
	{
		company: 'Anthropic',
		role: 'Frontend Engineer',
		stage: 'saved',
		status: 'active',
		workArrangement: 'remote',
		salary: null,
		postingUrl: 'https://anthropic.com/careers',
		postingDescription: 'Build interfaces for AI safety research tooling.',
		notes: 'Bookmark. Will apply when resume is updated.',
		resumeId: null,
		appliedDaysAgo: null,
		stageDays: 2,
		nextActionDays: null,
		tags: ['ai', 'remote', 'dream-company']
	},
	{
		company: 'Shopee',
		role: 'Senior Frontend Engineer',
		stage: 'applied',
		status: 'active',
		workArrangement: 'hybrid',
		salary: { shape: 'range', minMinorUnits: 14000000, maxMinorUnits: 18000000, currency: 'SGD' },
		postingUrl: 'https://shopee.sg/jobs',
		postingDescription: "Frontend engineer for Shopee's seller dashboard.",
		notes: null,
		resumeId: null,
		appliedDaysAgo: 1,
		stageDays: 1,
		nextActionDays: 7,
		tags: ['marketplace', 'apac']
	},
	{
		company: 'Robinhood',
		role: 'Senior Frontend Engineer',
		stage: 'rejected',
		status: 'closed',
		workArrangement: 'onsite',
		salary: { shape: 'range', minMinorUnits: 16000000, maxMinorUnits: 19000000, currency: 'USD' },
		postingUrl: 'https://robinhood.com/careers',
		postingDescription: "Frontend engineer for Robinhood's trading platform.",
		notes: 'Did not meet the L5 bar.',
		resumeId: null,
		appliedDaysAgo: 48,
		stageDays: 48,
		nextActionDays: null,
		tags: ['fintech', 'onsite']
	},
	{
		company: 'Coinbase',
		role: 'Senior Engineer',
		stage: 'rejected',
		status: 'closed',
		workArrangement: 'remote',
		salary: { shape: 'range', minMinorUnits: 17000000, maxMinorUnits: 21000000, currency: 'USD' },
		postingUrl: 'https://coinbase.com/careers',
		postingDescription: "Senior engineer for Coinbase's retail product.",
		notes: null,
		resumeId: null,
		appliedDaysAgo: 72,
		stageDays: 72,
		nextActionDays: null,
		tags: ['fintech', 'remote', 'big-tech']
	},
	{
		company: 'OpenAI',
		role: 'Senior Frontend Engineer',
		stage: 'accepted',
		status: 'closed',
		workArrangement: 'hybrid',
		salary: { shape: 'exact', minorUnits: 19500000, currency: 'USD' },
		postingUrl: 'https://openai.com/careers',
		postingDescription: 'Frontend engineer for ChatGPT and the API platform.',
		notes: 'Accepted offer.',
		resumeId: 'resume-openai',
		appliedDaysAgo: 85,
		stageDays: 12,
		nextActionDays: null,
		tags: ['ai', 'high-priority', 'dream-company', 'big-tech']
	},
	{
		company: 'Anthropic',
		role: 'Senior Member of Technical Staff',
		stage: 'withdrawn',
		status: 'closed',
		workArrangement: 'hybrid',
		salary: { shape: 'range', minMinorUnits: 25000000, maxMinorUnits: 33000000, currency: 'USD' },
		postingUrl: 'https://anthropic.com/careers',
		postingDescription: 'Senior Member of Technical Staff for AI safety research.',
		notes: 'Took another offer.',
		resumeId: null,
		appliedDaysAgo: 68,
		stageDays: 40,
		nextActionDays: null,
		tags: ['ai', 'dream-company', 'high-priority']
	}
];

function materializeFixture(f: StubApp, index: number): Application {
	const createdAt = daysAgoIso(90);
	const stageChangedAt = daysAgoIso(f.stageDays);
	const appliedAt = f.appliedDaysAgo === null ? null : daysAgoIso(f.appliedDaysAgo);
	const nextActionAt = f.nextActionDays === null ? null : daysAheadIso(f.nextActionDays);

	return {
		id: `app-stub-${index + 1}`,
		userId: 'stub-user-id',
		company: f.company,
		role: f.role,
		stage: f.stage,
		status: f.status,
		workArrangement: f.workArrangement,
		salary: f.salary,
		postingUrl: f.postingUrl,
		postingDescription: f.postingDescription,
		notes: f.notes,
		resumeId: f.resumeId,
		appliedAt,
		stageChangedAt,
		nextActionAt,
		createdAt,
		updatedAt: createdAt,
		tags: f.tags ?? []
	};
}

interface Store {
	apps: Map<string, Application>;
}

function getStore(): Store {
	const g = globalThis as unknown as Record<symbol, Store | undefined>;
	let store = g[STORE_KEY];
	if (!store) {
		store = { apps: new Map() };
		for (let i = 0; i < FIXTURES.length; i++) {
			const f = FIXTURES[i];
			if (!f) continue;
			const app = materializeFixture(f, i);
			store.apps.set(app.id, app);
		}
		g[STORE_KEY] = store;
	}
	return store;
}

/**
 * Return all applications for a given user, ordered by most-recent stage
 * change (default sort). Excludes other users' rows by construction — the
 * stub store only has one user, but the function signature already
 * supports per-user isolation.
 */
export function getApplicationsForUser(userId: string): Application[] {
	const store = getStore();
	return Array.from(store.apps.values())
		.filter((a) => a.userId === userId)
		.sort((a, b) => new Date(b.stageChangedAt).getTime() - new Date(a.stageChangedAt).getTime());
}

export function getApplicationById(userId: string, id: string): Application | null {
	const store = getStore();
	const app = store.apps.get(id);
	if (!app || app.userId !== userId) return null;
	return app;
}

export type CreateApplicationInput = Omit<
	Application,
	'id' | 'userId' | 'createdAt' | 'updatedAt' | 'stageChangedAt'
>;

export function createApplication(userId: string, input: CreateApplicationInput): Application {
	const store = getStore();
	const now = new Date().toISOString();
	const app: Application = {
		...input,
		id: `app-${crypto.randomUUID()}`,
		userId,
		createdAt: now,
		updatedAt: now,
		stageChangedAt: now
	};
	store.apps.set(app.id, app);
	return app;
}

export type UpdateApplicationInput = Partial<Omit<Application, 'id' | 'userId' | 'createdAt'>>;

export function updateApplication(
	userId: string,
	id: string,
	patch: UpdateApplicationInput
): Application | null {
	const store = getStore();
	const existing = store.apps.get(id);
	if (!existing || existing.userId !== userId) return null;
	const next: Application = {
		...existing,
		...patch,
		id: existing.id,
		userId: existing.userId,
		createdAt: existing.createdAt,
		updatedAt: new Date().toISOString(),
		// Bump stageChangedAt when stage moves so the duration-in-stage
		// counters reset correctly. The UI calls updateApplication with the
		// patched stage; this is the canonical place to detect the change.
		stageChangedAt:
			patch.stage && patch.stage !== existing.stage
				? new Date().toISOString()
				: existing.stageChangedAt
	};
	store.apps.set(id, next);
	return next;
}

export function deleteApplication(userId: string, id: string): boolean {
	const store = getStore();
	const existing = store.apps.get(id);
	if (!existing || existing.userId !== userId) return false;
	store.apps.delete(id);
	return true;
}

/**
 * Reset the in-memory store back to the fixture defaults.
 * Useful for dev-only "wipe and reseed" affordances; not exposed in the UI.
 */
export function resetStore(): void {
	const g = globalThis as unknown as Record<symbol, Store | undefined>;
	delete g[STORE_KEY];
}

// Re-export CurrencyCode so consumers of this module don't have to dig for it.
export type { CurrencyCode };
