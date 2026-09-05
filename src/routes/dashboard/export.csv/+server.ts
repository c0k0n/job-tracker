import type { RequestHandler } from './$types';
import { getApplicationsForUser } from '$lib/server/applications-data';
import { CURRENCY_BY_CODE } from '$lib/constants/currencies';

/**
 * CSV export of the current user's applications.
 *
 * Returns text/csv with the columns Round C needs for an "import into
 * Sheets" round-trip. Stage / status / arrangement / salary use the
 * canonical display labels so the CSV is human-readable, not a
 * machine-coded dump.
 *
 * Auth: requires a logged-in user. Unauthenticated requests are
 * redirected to / (same as the dashboard guard).
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		// Plain-text body + 401 — a CSV download gets an auth check
		// instead of an HTML redirect so a curl caller sees the error.
		return new Response('Authentication required.\n', {
			status: 401,
			headers: { 'Content-Type': 'text/plain; charset=utf-8' }
		});
	}

	const apps = getApplicationsForUser(locals.user.id);

	const COLUMNS = [
		'company',
		'role',
		'stage',
		'status',
		'workArrangement',
		'minorUnits',
		'currency',
		'salaryShape',
		'minMinorUnits',
		'maxMinorUnits',
		'postingUrl',
		'postingDescription',
		'notes',
		'appliedAt',
		'stageChangedAt',
		'nextActionAt',
		'createdAt',
		'updatedAt',
		'tags',
		'deletedAt'
	] as const;

	// Build CSV using string concat + csvEscape. We intentionally don't
	// depend on a CSV library — round-trip via Sheets works fine with
	// RFC-4180 quoting and it's tiny.
	const rows: string[] = [COLUMNS.join(',')];
	for (const a of apps) {
		const currency = a.salary?.currency;
		const currencyMeta = currency ? CURRENCY_BY_CODE[currency] : null;
		const shape = a.salary?.shape ?? '';
		const minor = a.salary
			? 'shape' in a.salary && a.salary.shape === 'exact'
				? String(a.salary.minorUnits)
				: ''
			: '';
		const minMinor =
			a.salary && (a.salary.shape === 'range' || a.salary.shape === 'min_only')
				? String(a.salary.minMinorUnits)
				: '';
		const maxMinor =
			a.salary && (a.salary.shape === 'range' || a.salary.shape === 'max_only')
				? String(a.salary.maxMinorUnits)
				: '';
		const cells = [
			a.company,
			a.role,
			a.stage,
			a.status,
			a.workArrangement,
			minor,
			currencyMeta?.code ?? '',
			shape,
			minMinor,
			maxMinor,
			a.postingUrl ?? '',
			a.postingDescription ?? '',
			a.notes ?? '',
			a.appliedAt ?? '',
			a.stageChangedAt,
			a.nextActionAt ?? '',
			a.createdAt,
			a.updatedAt,
			a.tags.join('|'),
			a.deletedAt ?? ''
		];
		rows.push(cells.map(csvEscape).join(','));
	}

	// RFC-4180 line endings + BOM so Excel picks up UTF-8 correctly.
	const body = '\uFEFF' + rows.join('\r\n') + '\r\n';
	const filename = `job-tracker-export-${new Date().toISOString().slice(0, 10)}.csv`;

	return new Response(body, {
		status: 200,
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${filename}"`,
			'Cache-Control': 'no-store'
		}
	});
};

/** RFC-4180 cell escape: wrap in double-quotes if the cell contains
 *  a quote, comma, or newline; double up internal quotes. */
function csvEscape(value: string): string {
	if (value === '') return '';
	const needsQuote = /[",\r\n]/.test(value);
	const escaped = value.replace(/"/g, '""');
	return needsQuote ? `"${escaped}"` : escaped;
}
