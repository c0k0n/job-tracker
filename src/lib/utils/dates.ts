/**
 * Date utilities.
 *
 * All helpers take an ISO date string and return either an ISO string
 * (for form inputs) or a string for display. None of them mutate Date
 * objects in place. Where we render relative time ("3 days ago"), we
 * use Intl.RelativeTimeFormat — the standard, no dependency.
 */

/**
 * Days since an ISO date. Floored to whole days.
 * Returns Infinity if the input is null/undefined or unparseable so the
 * caller can branch on "no date set".
 */
export function daysSince(iso: string | null | undefined): number {
	if (!iso) return Infinity;
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) return Infinity;
	const ms = Date.now() - then;
	return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

/**
 * Days between two ISO dates. Positive if `a` is earlier, negative if later.
 */
export function daysBetween(a: string, b: string): number {
	const aMs = new Date(a).getTime();
	const bMs = new Date(b).getTime();
	return Math.round((bMs - aMs) / (1000 * 60 * 60 * 24));
}

/**
 * Relative-time formatter: "today", "yesterday", "3 days ago", "2 weeks ago".
 * Caps at "~1 year ago" to avoid clutter.
 */
export function formatRelative(iso: string | null | undefined): string {
	if (!iso) return '—';
	const days = daysSince(iso);
	if (!Number.isFinite(days)) return '—';
	if (days === 0) return 'today';
	if (days === 1) return 'yesterday';
	if (days < 7) return `${days} days ago`;
	if (days < 30) {
		const weeks = Math.floor(days / 7);
		return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
	}
	if (days < 365) {
		const months = Math.floor(days / 30);
		return months === 1 ? '1 month ago' : `${months} months ago`;
	}
	const years = Math.floor(days / 365);
	return years === 1 ? '1 year ago' : `${years} years ago`;
}

/**
 * Short absolute date: "May 12, 2026". For primary date columns where
 * the user wants to see the exact date, not the relative position.
 */
const DATE_FMT = new Intl.DateTimeFormat('en-US', {
	year: 'numeric',
	month: 'short',
	day: 'numeric'
});

export function formatDateShort(iso: string | null | undefined): string {
	if (!iso) return '—';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '—';
	return DATE_FMT.format(d);
}

/**
 * Days-in-stage display: "3 days" (1-30), "2 months" (31-365), "1y+".
 * Returns "—" if `stageChangedAt` is missing.
 */
export function formatDurationInStage(stageChangedAt: string | null | undefined): string {
	const days = daysSince(stageChangedAt);
	if (!Number.isFinite(days)) return '—';
	if (days === 0) return 'today';
	if (days === 1) return '1 day';
	if (days < 30) return `${days} days`;
	if (days < 365) {
		const months = Math.floor(days / 30);
		return months === 1 ? '1 month' : `${months} months`;
	}
	const years = Math.floor(days / 365);
	return `${years}y+`;
}

/**
 * Returns true when an ISO date is within the next `windowDays` from
 * today (inclusive of today, exclusive of past dates).
 */
export function isUpcoming(iso: string | null | undefined, windowDays: number = 30): boolean {
	if (!iso) return false;
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) return false;
	const now = Date.now();
	if (then < now) return false;
	const diffMs = then - now;
	return diffMs <= windowDays * 24 * 60 * 60 * 1000;
}

/**
 * Quick check: was the application created in the current calendar month?
 */
export function isThisMonth(iso: string | null | undefined): boolean {
	if (!iso) return false;
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return false;
	const now = new Date();
	return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

/**
 * Format an ISO date as YYYY-MM-DD for `<input type="date">` defaults.
 */
export function toDateInputValue(iso: string | null | undefined): string {
	if (!iso) return '';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	const yyyy = d.getFullYear();
	const mm = String(d.getMonth() + 1).padStart(2, '0');
	const dd = String(d.getDate()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}`;
}
