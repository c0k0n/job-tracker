/**
 * Salary formatter.
 *
 * Input: a Salary object (one of four shapes). Output: a compact
 * human-readable string using the currency's locale and symbol, with
 * abbreviated thousand/million suffixes for large values.
 *
 * Examples:
 *   { shape: 'exact', minorUnits: 18500000, currency: 'USD' } → "$185k"
 *   { shape: 'range', minMinorUnits: 14000000, maxMinorUnits: 17000000, currency: 'USD' }
 *     → "$140k–$170k"
 *   { shape: 'min_only', minMinorUnits: 7500000, currency: 'GBP' } → "£75k+"
 *   { shape: 'max_only', maxMinorUnits: 450000000, currency: 'INR' } → "≤₹45L"
 *   { shape: 'exact', minorUnits: 11500000, currency: 'JPY' } → "¥11.5M"
 *     (yen has no minor units; minorUnits is already in whole yen)
 */

import type { Salary } from '$lib/types';
import { CURRENCY_BY_CODE } from '$lib/constants/currencies';

/**
 * Convert minor units to a major-unit number, then format compactly.
 * For 0-decimal currencies (JPY, KRW, VND) the stored minor units are
 * already whole units, so we divide by 1.
 */
function toMajorNumber(minorUnits: number, currencyDecimals: number): number {
	const factor = Math.pow(10, currencyDecimals);
	return minorUnits / factor;
}

/**
 * Compact currency formatter: $1.2M, $45k, ¥11.5M, ₹45L.
 * Uses Intl.NumberFormat with `notation: 'compact'` so we get
 * locale-correct grouping + rounding.
 */
function formatCompactAmount(amount: number, currencyCode: keyof typeof CURRENCY_BY_CODE): string {
	const meta = CURRENCY_BY_CODE[currencyCode];
	try {
		return new Intl.NumberFormat(meta.locale, {
			style: 'currency',
			currency: currencyCode,
			notation: 'compact',
			maximumFractionDigits: 1
		}).format(amount);
	} catch {
		// Fallback if the runtime doesn't have this locale's data.
		const formatted = new Intl.NumberFormat('en-US', {
			maximumFractionDigits: 1
		}).format(amount);
		return meta.position === 'prefix' ? `${meta.symbol}${formatted}` : `${formatted}${meta.symbol}`;
	}
}

/**
 * Public API. Returns a short string suitable for table cells and
 * chips. Returns "—" when the salary is null.
 */
export function formatSalary(salary: Salary | null): string {
	if (!salary) return '—';
	const meta = CURRENCY_BY_CODE[salary.currency];

	switch (salary.shape) {
		case 'exact': {
			const major = toMajorNumber(salary.minorUnits, meta.minorUnits);
			return formatCompactAmount(major, salary.currency);
		}
		case 'range': {
			const minMajor = toMajorNumber(salary.minMinorUnits, meta.minorUnits);
			const maxMajor = toMajorNumber(salary.maxMinorUnits, meta.minorUnits);
			const minStr = formatCompactAmount(minMajor, salary.currency);
			const maxStr = formatCompactAmount(maxMajor, salary.currency);
			return `${minStr}–${maxStr}`;
		}
		case 'min_only': {
			const major = toMajorNumber(salary.minMinorUnits, meta.minorUnits);
			return `${formatCompactAmount(major, salary.currency)}+`;
		}
		case 'max_only': {
			const major = toMajorNumber(salary.maxMinorUnits, meta.minorUnits);
			return `≤${formatCompactAmount(major, salary.currency)}`;
		}
	}
}
