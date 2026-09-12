/**
 * Pure filter + sort helpers for applications.
 *
 * Kept here (not in the page) so the dashboard's URL → visible-rows
 * logic is testable and reusable. The dashboard `+page.svelte` will
 * derive its data through these functions from `data.applications` +
 * `data.filters`.
 */

import type {
	Application,
	ApplicationFilters,
	ApplicationSort,
	SortKey,
	WorkArrangement
} from '$lib/types';
import { ARRANGEMENT_BY_VALUE, STAGES, STATUSES } from '$lib/constants/stages';

/**
 * Apply the current filter set to a list of applications.
 *
 * Empty arrays in `filters` mean "no filter" (everything passes for that
 * dimension). Free-text `q` is case-insensitive substring match against
 * company, role, posting description, and notes.
 */
export function applyFilters(
	apps: readonly Application[],
	filters: ApplicationFilters
): Application[] {
	const q = filters.q.trim().toLowerCase();
	return apps.filter((a) => {
		// Stage filter: empty array means "all stages pass"
		if (filters.stages.length > 0 && !filters.stages.includes(a.stage)) return false;

		// Status filter
		if (filters.statuses.length > 0 && !filters.statuses.includes(a.status)) return false;

		// Work arrangement filter
		if (filters.arrangements.length > 0 && !filters.arrangements.includes(a.workArrangement))
			return false;

		// Tag filter: empty array means "all tags pass". Non-empty is
		// OR-within-group (any matching tag is a pass) — same as the other
		// multi-select chips. Future round could switch to AND for narrower
		// queries; not needed for Round B.
		if (filters.tags.length > 0) {
			const hasAny = filters.tags.some((t) => a.tags.includes(t));
			if (!hasAny) return false;
		}

		// Free-text search across company, role, posting, notes
		if (q) {
			const haystack = [a.company, a.role, a.postingDescription ?? '', a.notes ?? '']
				.join(' ')
				.toLowerCase();
			if (!haystack.includes(q)) return false;
		}

		return true;
	});
}

/**
 * Sort a list of applications by the chosen key + direction.
 *
 * Stable: the underlying order is preserved when keys tie (no need for
 * a JS stable-sort polyfill — modern engines guarantee Array.prototype.sort
 * is stable as of ES2019).
 *
 * Null/undefined values always sort to the bottom regardless of direction,
 * so "no next action" doesn't appear at the top of the next-action column.
 */
export function applySort(apps: readonly Application[], sort: ApplicationSort): Application[] {
	const { key, dir } = sort;
	const sign = dir === 'asc' ? 1 : -1;

	return [...apps].sort((a, b) => {
		const av = a[key];
		const bv = b[key];

		// Null/undefined sort to the bottom (end of list) regardless of direction.
		if (!av && !bv) return 0;
		if (!av) return 1;
		if (!bv) return -1;

		if (typeof av === 'string' && typeof bv === 'string') {
			// Stage/status are strings that should sort by their declared order,
			// not alphabetically. Detect via known keys.
			if (key === 'stage') {
				const order = STAGE_ORDER;
				return ((order[av] ?? 0) - (order[bv] ?? 0)) * sign;
			}
			if (key === 'status') {
				const order = STATUS_ORDER;
				return ((order[av] ?? 0) - (order[bv] ?? 0)) * sign;
			}
			return av.localeCompare(bv) * sign;
		}

		// Both are ISO date strings (appliedAt, stageChangedAt, nextActionAt)
		const aMs = new Date(av).getTime();
		const bMs = new Date(bv).getTime();
		return (aMs - bMs) * sign;
	});
}

// Sort indices for funnel / status ordering (earlier in funnel = lower
// index = sorts first in asc). Derived from the single source of truth in
// stages.ts (STAGES / STATUSES arrays) so a reorder there can't silently
// diverge sort from funnel/validation.
const STAGE_ORDER: Record<string, number> = Object.fromEntries(STAGES.map((s, i) => [s.value, i]));
const STATUS_ORDER: Record<string, number> = Object.fromEntries(
	STATUSES.map((s, i) => [s.value, i])
);

/**
 * Parse URL search params into typed filter + sort state.
 *
 * Accepts:
 *   ?q=stripe&stage=applied,onsite&status=active,stalled&arr=remote&sort=stage&dir=asc
 *
 * Unknown or malformed values are silently dropped (we don't fail the page
 * load over a bad query string). Empty `q` is the default.
 */
export function parseFiltersFromUrl(searchParams: URLSearchParams): {
	filters: ApplicationFilters;
	sort: ApplicationSort;
} {
	const q = searchParams.get('q') ?? '';

	const stagesCsv = searchParams.get('stage') ?? '';
	const stages = stagesCsv
		? (stagesCsv
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean)
				.filter(
					(s): s is keyof typeof STAGE_ORDER => s in STAGE_ORDER
				) as ApplicationFilters['stages'])
		: [];

	const statusesCsv = searchParams.get('status') ?? '';
	const statuses = statusesCsv
		? (statusesCsv
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean)
				.filter(
					(s): s is keyof typeof STATUS_ORDER => s in STATUS_ORDER
				) as ApplicationFilters['statuses'])
		: [];

	const arrCsv = searchParams.get('arr') ?? '';
	const arrangements = arrCsv
		? (arrCsv
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean)
				.filter(
					(a): a is WorkArrangement => a in ARRANGEMENT_BY_VALUE
				) as ApplicationFilters['arrangements'])
		: [];

	const tagsCsv = searchParams.get('tag') ?? '';
	// Tag values are free-form (lowercase hyphenated) so we don't validate
	// against a closed set; we just non-empty-filter.
	const tags = tagsCsv
		? tagsCsv
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean)
		: [];

	const rawSortKey = searchParams.get('sort') ?? 'stageChangedAt';
	const ALLOWED_SORT_KEYS: readonly SortKey[] = [
		'company',
		'role',
		'stage',
		'status',
		'appliedAt',
		'stageChangedAt',
		'nextActionAt'
	];
	const sortKey: SortKey = (ALLOWED_SORT_KEYS as readonly string[]).includes(rawSortKey)
		? (rawSortKey as SortKey)
		: 'stageChangedAt';
	const sortDirRaw = searchParams.get('dir') ?? 'desc';
	const sortDir: 'asc' | 'desc' = sortDirRaw === 'asc' ? 'asc' : 'desc';

	return {
		filters: { q, stages, statuses, arrangements, tags },
		sort: { key: sortKey, dir: sortDir }
	};
}

/**
 * Serialize current filter/sort state back into a URLSearchParams for
 * navigation. We round-trip through this when the user changes a filter
 * chip or sort column.
 */
export function serializeFiltersToUrl(
	filters: ApplicationFilters,
	sort: ApplicationSort
): URLSearchParams {
	const sp = new URLSearchParams();
	if (filters.q) sp.set('q', filters.q);
	if (filters.stages.length > 0) sp.set('stage', filters.stages.join(','));
	if (filters.statuses.length > 0) sp.set('status', filters.statuses.join(','));
	if (filters.arrangements.length > 0) sp.set('arr', filters.arrangements.join(','));
	if (filters.tags.length > 0) sp.set('tag', filters.tags.join(','));
	if (sort.key !== 'stageChangedAt' || sort.dir !== 'desc') {
		sp.set('sort', sort.key);
		sp.set('dir', sort.dir);
	}
	return sp;
}

/**
 * Returns true when the filters differ from a "no filter" default. The
 * empty-state copy uses this to decide between "Add your first application"
 * (zero apps in the database) and "No matches" (zero apps matching the
 * current filters).
 */
export function hasActiveFilters(filters: ApplicationFilters): boolean {
	return (
		filters.q.length > 0 ||
		filters.stages.length > 0 ||
		filters.statuses.length > 0 ||
		filters.arrangements.length > 0 ||
		filters.tags.length > 0
	);
}

/**
 * Aggregated tag info for the filter chip group. Sorts tags by frequency
 * (most-used first) and includes the count for the chip label.
 */
export interface TagFacet {
	tag: string;
	count: number;
}

export function tagFacetsFor(apps: readonly Application[]): TagFacet[] {
	const freq = new Map<string, number>();
	for (const a of apps) {
		for (const t of a.tags) {
			freq.set(t, (freq.get(t) ?? 0) + 1);
		}
	}
	return Array.from(freq.entries())
		.map(([tag, count]) => ({ tag, count }))
		.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
