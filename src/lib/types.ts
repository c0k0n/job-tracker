/**
 * Domain types for the job tracker.
 *
 * These are the shapes that flow through the dashboard, the data layer,
 * and (eventually) the database. ApplicationStage, ApplicationStatus,
 * and WorkArrangement are *exhaustive* unions — TypeScript narrows on
 * them, so all switch statements get exhaustiveness checks.
 */

export type ApplicationStage =
	| 'saved'
	| 'applied'
	| 'phone_screen'
	| 'technical'
	| 'onsite'
	| 'final'
	| 'offer'
	| 'accepted'
	| 'rejected'
	| 'withdrawn';

export type ApplicationStatus = 'active' | 'stalled' | 'ghosted' | 'paused' | 'closed';

export type WorkArrangement = 'remote' | 'hybrid' | 'onsite' | 'unspecified';

export type CurrencyCode =
	| 'USD'
	| 'EUR'
	| 'GBP'
	| 'JPY'
	| 'INR'
	| 'AUD'
	| 'CAD'
	| 'CHF'
	| 'CNY'
	| 'SGD'
	| 'HKD'
	| 'KRW'
	| 'SEK'
	| 'NOK'
	| 'DKK'
	| 'NZD'
	| 'MXN'
	| 'BRL'
	| 'ZAR'
	| 'AED'
	| 'SAR'
	| 'THB'
	| 'IDR'
	| 'MYR'
	| 'PHP'
	| 'VND'
	| 'PLN'
	| 'CZK'
	| 'HUF'
	| 'TRY'
	| 'ILS'
	| 'TWD';

export type Salary =
	| { shape: 'exact'; minorUnits: number; currency: CurrencyCode }
	| { shape: 'range'; minMinorUnits: number; maxMinorUnits: number; currency: CurrencyCode }
	| { shape: 'min_only'; minMinorUnits: number; currency: CurrencyCode }
	| { shape: 'max_only'; maxMinorUnits: number; currency: CurrencyCode };

/**
 * The application record as it exists today. Backend-backed rows will gain
 * `id`, `createdAt`, `updatedAt` once D1 lands; for Round A these are
 * stubbed by the in-memory data layer.
 */
export interface Application {
	id: string;
	userId: string;
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
	appliedAt: string | null; // ISO date
	stageChangedAt: string; // ISO date
	nextActionAt: string | null; // ISO date
	createdAt: string;
	updatedAt: string;
	/** Tag names (lowercase, hyphen-separated). Round B. */
	tags: string[];
}

/**
 * Aggregates for the KPI strip. Computed server-side from the
 * application's row set, not derived client-side (so the dashboard can
 * show counts without re-deriving on every render).
 */
export interface KpiCounts {
	active: number;
	interviewsNext30Days: number;
	offersPending: number;
	appliedThisMonth: number;
	needsAttention: number; // stalled + ghosted
}

/**
 * Filter state for the applications table. URL-driven via query string.
 * Empty arrays mean "no filter applied" (not "no rows").
 */
export interface ApplicationFilters {
	q: string; // free-text search
	stages: ApplicationStage[]; // multi-select
	statuses: ApplicationStatus[]; // multi-select
	arrangements: WorkArrangement[]; // multi-select
	tags: string[]; // multi-select, OR-within-group semantics
}

export type SortKey =
	'company' | 'role' | 'stage' | 'status' | 'appliedAt' | 'stageChangedAt' | 'nextActionAt';

export type SortDir = 'asc' | 'desc';

export interface ApplicationSort {
	key: SortKey;
	dir: SortDir;
}
