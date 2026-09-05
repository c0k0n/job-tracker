/**
 * ISO 4217 currency whitelist.
 *
 * Covering the ~30 currencies that matter for a personal job tracker.
 * Not exhaustive — extend if a user needs a currency not listed here.
 *
 * The `minorUnits` count is used by the salary formatter to convert the
 * stored integer minor units into a human-readable major-unit display
 * (e.g. cents → dollars, yen → yen-with-no-decimals).
 *
 * `position: 'prefix' | 'suffix'` controls where the symbol renders
 * relative to the number. 'JPY' is suffix because ¥ reads better after
 * the digits in the Japanese convention; 'USD' is prefix because $ reads
 * better before. We default to prefix since the prefix convention
 * dominates international finance writing.
 */

import type { CurrencyCode } from '$lib/types';

export interface CurrencyMeta {
	code: CurrencyCode;
	label: string;
	symbol: string;
	minorUnits: number;
	position: 'prefix' | 'suffix';
	locale: string;
}

export const CURRENCIES: CurrencyMeta[] = [
	{
		code: 'USD',
		label: 'US Dollar',
		symbol: '$',
		minorUnits: 2,
		position: 'prefix',
		locale: 'en-US'
	},
	{ code: 'EUR', label: 'Euro', symbol: '€', minorUnits: 2, position: 'prefix', locale: 'en-IE' },
	{
		code: 'GBP',
		label: 'British Pound',
		symbol: '£',
		minorUnits: 2,
		position: 'prefix',
		locale: 'en-GB'
	},
	{
		code: 'JPY',
		label: 'Japanese Yen',
		symbol: '¥',
		minorUnits: 0,
		position: 'suffix',
		locale: 'ja-JP'
	},
	{
		code: 'INR',
		label: 'Indian Rupee',
		symbol: '₹',
		minorUnits: 2,
		position: 'prefix',
		locale: 'en-IN'
	},
	{
		code: 'AUD',
		label: 'Australian Dollar',
		symbol: 'A$',
		minorUnits: 2,
		position: 'prefix',
		locale: 'en-AU'
	},
	{
		code: 'CAD',
		label: 'Canadian Dollar',
		symbol: 'C$',
		minorUnits: 2,
		position: 'prefix',
		locale: 'en-CA'
	},
	{
		code: 'CHF',
		label: 'Swiss Franc',
		symbol: 'CHF',
		minorUnits: 2,
		position: 'prefix',
		locale: 'de-CH'
	},
	{
		code: 'CNY',
		label: 'Chinese Yuan',
		symbol: '¥',
		minorUnits: 2,
		position: 'prefix',
		locale: 'zh-CN'
	},
	{
		code: 'SGD',
		label: 'Singapore Dollar',
		symbol: 'S$',
		minorUnits: 2,
		position: 'prefix',
		locale: 'en-SG'
	},
	{
		code: 'HKD',
		label: 'Hong Kong Dollar',
		symbol: 'HK$',
		minorUnits: 2,
		position: 'prefix',
		locale: 'en-HK'
	},
	{
		code: 'KRW',
		label: 'South Korean Won',
		symbol: '₩',
		minorUnits: 0,
		position: 'prefix',
		locale: 'ko-KR'
	},
	{
		code: 'SEK',
		label: 'Swedish Krona',
		symbol: 'kr',
		minorUnits: 2,
		position: 'suffix',
		locale: 'sv-SE'
	},
	{
		code: 'NOK',
		label: 'Norwegian Krone',
		symbol: 'kr',
		minorUnits: 2,
		position: 'suffix',
		locale: 'nb-NO'
	},
	{
		code: 'DKK',
		label: 'Danish Krone',
		symbol: 'kr',
		minorUnits: 2,
		position: 'suffix',
		locale: 'da-DK'
	},
	{
		code: 'NZD',
		label: 'New Zealand Dollar',
		symbol: 'NZ$',
		minorUnits: 2,
		position: 'prefix',
		locale: 'en-NZ'
	},
	{
		code: 'MXN',
		label: 'Mexican Peso',
		symbol: 'MX$',
		minorUnits: 2,
		position: 'prefix',
		locale: 'es-MX'
	},
	{
		code: 'BRL',
		label: 'Brazilian Real',
		symbol: 'R$',
		minorUnits: 2,
		position: 'prefix',
		locale: 'pt-BR'
	},
	{
		code: 'ZAR',
		label: 'South African Rand',
		symbol: 'R',
		minorUnits: 2,
		position: 'prefix',
		locale: 'en-ZA'
	},
	{
		code: 'AED',
		label: 'UAE Dirham',
		symbol: 'د.إ',
		minorUnits: 2,
		position: 'prefix',
		locale: 'ar-AE'
	},
	{
		code: 'SAR',
		label: 'Saudi Riyal',
		symbol: '﷼',
		minorUnits: 2,
		position: 'prefix',
		locale: 'ar-SA'
	},
	{
		code: 'THB',
		label: 'Thai Baht',
		symbol: '฿',
		minorUnits: 2,
		position: 'prefix',
		locale: 'th-TH'
	},
	{
		code: 'IDR',
		label: 'Indonesian Rupiah',
		symbol: 'Rp',
		minorUnits: 2,
		position: 'prefix',
		locale: 'id-ID'
	},
	{
		code: 'MYR',
		label: 'Malaysian Ringgit',
		symbol: 'RM',
		minorUnits: 2,
		position: 'prefix',
		locale: 'ms-MY'
	},
	{
		code: 'PHP',
		label: 'Philippine Peso',
		symbol: '₱',
		minorUnits: 2,
		position: 'prefix',
		locale: 'en-PH'
	},
	{
		code: 'VND',
		label: 'Vietnamese Dong',
		symbol: '₫',
		minorUnits: 0,
		position: 'suffix',
		locale: 'vi-VN'
	},
	{
		code: 'PLN',
		label: 'Polish Złoty',
		symbol: 'zł',
		minorUnits: 2,
		position: 'suffix',
		locale: 'pl-PL'
	},
	{
		code: 'CZK',
		label: 'Czech Koruna',
		symbol: 'Kč',
		minorUnits: 2,
		position: 'suffix',
		locale: 'cs-CZ'
	},
	{
		code: 'HUF',
		label: 'Hungarian Forint',
		symbol: 'Ft',
		minorUnits: 2,
		position: 'suffix',
		locale: 'hu-HU'
	},
	{
		code: 'TRY',
		label: 'Turkish Lira',
		symbol: '₺',
		minorUnits: 2,
		position: 'prefix',
		locale: 'tr-TR'
	},
	{
		code: 'ILS',
		label: 'Israeli Shekel',
		symbol: '₪',
		minorUnits: 2,
		position: 'prefix',
		locale: 'he-IL'
	},
	{
		code: 'TWD',
		label: 'Taiwan Dollar',
		symbol: 'NT$',
		minorUnits: 2,
		position: 'prefix',
		locale: 'zh-TW'
	}
];

export const CURRENCY_BY_CODE: Record<CurrencyCode, CurrencyMeta> = CURRENCIES.reduce(
	(acc, c) => {
		acc[c.code] = c;
		return acc;
	},
	{} as Record<CurrencyCode, CurrencyMeta>
);
