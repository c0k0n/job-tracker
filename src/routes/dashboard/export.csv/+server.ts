import type { RequestHandler } from './$types';
import { getApplicationsForUser } from '$lib/server/applications-data';
import { getDb } from '$lib/server/db';
import { CURRENCY_BY_CODE } from '$lib/constants/currencies';

/**
 * CSV export of the current user's applications.
 *
 * Returns text/csv with the columns needed for an "import into Sheets"
 * round-trip. Stage / status / arrangement / salary use the canonical
 * display labels so the CSV is human-readable, not a machine-coded dump.
 *
 * Auth: requires a logged-in user. Unauthenticated requests get a 401
 * plain-text body (no HTML redirect) so a curl caller sees the error.
 */
export const GET: RequestHandler = async ({ locals, platform }) => {
	if (!locals.user) {
		return new Response('Authentication required.\n', {
			status: 401,
			headers: { 'Content-Type': 'text/plain; charset=utf-8' }
		});
	}
	const db = getDb(platform!.env.DB);
	const apps = await getApplicationsForUser(db, locals.user.id);

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

	// Build CSV using string concat + csvEscape. No CSV library needed —
	// RFC-4180 quoting is tiny and round-trips through Sheets.
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

/**
 * RFC-4180 cell escape + formula-injection neutralizer.
 *
 * Quoting alone doesn't stop Excel/Sheets from *evaluating* a cell whose
 * first char is =, +, -, @, or tab (stored user text like company names or
 * notes can carry `=SUM(...)` or `=HYPERLINK(...)` payloads). Prefixing a
 * leading zero-format danger char with a single quote (or an apostrophe-
 * free approach: prepend a tab-free zero char) defuses evaluation while
 * keeping the visible text intact. We prefix with a single quote — the
 * standard, lossless-in-CSV mitigation (OWASP CSV injection guidance).
 */
function csvEscape(value: string): string {
	let cell = value;
	if (/^[=+\-@\t\r]/.test(cell)) {
		cell = `'${cell}`;
	}
	const needsQuote = /[",\r\n]/.test(cell);
	const escaped = cell.replace(/"/g, '""');
	return needsQuote ? `"${escaped}"` : escaped;
}
