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

import type { CurrencyCode, Salary } from '$lib/types';
import { CURRENCIES, CURRENCY_BY_CODE } from '$lib/constants/currencies';

export const SALARY_SHAPES = [
	{ value: 'none', label: 'Not specified' },
	{ value: 'exact', label: 'Exact amount' },
	{ value: 'range', label: 'Range' },
	{ value: 'min_only', label: 'Minimum only' },
	{ value: 'max_only', label: 'Maximum only' }
] as const;

export type SalaryShapeValue = (typeof SALARY_SHAPES)[number]['value'];

/** The raw shape of the compensation fields in the application form. */
export interface SalaryFormValues {
	shape: SalaryShapeValue;
	currency: CurrencyCode;
	/** Major units, as typed (e.g. "185000"). */
	exact: string;
	min: string;
	max: string;
}

export function defaultSalaryFormValues(
	salary: Salary | null,
	fallbackCurrency: CurrencyCode = 'USD'
): SalaryFormValues {
	if (!salary) return { shape: 'none', currency: fallbackCurrency, exact: '', min: '', max: '' };
	switch (salary.shape) {
		case 'exact':
			return {
				shape: 'exact',
				currency: salary.currency,
				exact: majorUnitsToInput(salary.minorUnits, salary.currency),
				min: '',
				max: ''
			};
		case 'range':
			return {
				shape: 'range',
				currency: salary.currency,
				exact: '',
				min: majorUnitsToInput(salary.minMinorUnits, salary.currency),
				max: majorUnitsToInput(salary.maxMinorUnits, salary.currency)
			};
		case 'min_only':
			return {
				shape: 'min_only',
				currency: salary.currency,
				exact: '',
				min: majorUnitsToInput(salary.minMinorUnits, salary.currency),
				max: ''
			};
		case 'max_only':
			return {
				shape: 'max_only',
				currency: salary.currency,
				exact: '',
				min: '',
				max: majorUnitsToInput(salary.maxMinorUnits, salary.currency)
			};
	}
}

/** Convert a stored minor-unit integer to the decimal string the form shows
 * (e.g. 18500000 → "185000"); 0-decimal currencies return whole units. */
function majorUnitsToInput(minorUnits: number, currencyCode: CurrencyCode): string {
	const decimals = CURRENCY_BY_CODE[currencyCode].minorUnits;
	if (decimals === 0) return String(minorUnits);
	return String(minorUnits / Math.pow(10, decimals));
}

/**
 * Parse the salary fields posted by the application form.
 *
 * Returns the validated `Salary` (or null when "none"), plus the field
 * values for echo-back and a per-field error map. The form accepts major
 * units as a plain decimal string; we round to the currency's minor-unit
 * precision before storing.
 */
export function parseSalaryFromForm(
	shapeRaw: string,
	currencyRaw: string,
	exactRaw: string | null,
	minRaw: string | null,
	maxRaw: string | null
): { salary: Salary | null; values: SalaryFormValues; errors: Partial<Record<'salary', string>> } {
	const shape = (SALARY_SHAPES as readonly { value: string; label: string }[]).some(
		(s) => s.value === shapeRaw
	)
		? (shapeRaw as SalaryShapeValue)
		: 'none';
	const currency = CURRENCY_BY_CODE[currencyRaw as CurrencyCode]
		? (currencyRaw as CurrencyCode)
		: 'USD';

	const values: SalaryFormValues = {
		shape,
		currency,
		exact: exactRaw ?? '',
		min: minRaw ?? '',
		max: maxRaw ?? ''
	};
	const errors: Partial<Record<'salary', string>> = {};

	if (shape === 'none') return { salary: null, values, errors };

	const toNonNegInt = (raw: string): number | null => {
		const t = raw.trim();
		if (t === '') return null;
		const n = Number(t);
		if (!Number.isFinite(n) || n < 0) return null;
		return n;
	};

	const decimals = CURRENCY_BY_CODE[currency].minorUnits;
	const toMinor = (major: number) => Math.round(major * Math.pow(10, decimals));

	switch (shape) {
		case 'exact': {
			const exact = toNonNegInt(exactRaw ?? '');
			if (exact === null || exact <= 0) {
				errors.salary = 'Enter an amount greater than 0.';
			} else {
				return { salary: { shape, minorUnits: toMinor(exact), currency }, values, errors };
			}
			break;
		}
		case 'range': {
			const min = toNonNegInt(minRaw ?? '');
			const max = toNonNegInt(maxRaw ?? '');
			if (min === null || max === null || min <= 0 || max <= 0) {
				errors.salary = 'Enter a minimum and maximum greater than 0.';
			} else if (min > max) {
				errors.salary = 'Minimum must not exceed maximum.';
			} else {
				return {
					salary: { shape, minMinorUnits: toMinor(min), maxMinorUnits: toMinor(max), currency },
					values,
					errors
				};
			}
			break;
		}
		case 'min_only': {
			const min = toNonNegInt(minRaw ?? '');
			if (min === null || min <= 0) {
				errors.salary = 'Enter an amount greater than 0.';
			} else {
				return { salary: { shape, minMinorUnits: toMinor(min), currency }, values, errors };
			}
			break;
		}
		case 'max_only': {
			const max = toNonNegInt(maxRaw ?? '');
			if (max === null || max <= 0) {
				errors.salary = 'Enter an amount greater than 0.';
			} else {
				return { salary: { shape, maxMinorUnits: toMinor(max), currency }, values, errors };
			}
			break;
		}
	}
	return { salary: null, values, errors };
}

/** The options a salary currency `<select>` renders. */
export function currencyOptions(): { code: CurrencyCode; label: string }[] {
	return CURRENCIES.map((c) => ({ code: c.code, label: `${c.code} — ${c.label}` }));
}

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
 * chips. Returns middle-dot when the salary is null.
 */
export function formatSalary(salary: Salary | null): string {
	if (!salary) return '·';
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
