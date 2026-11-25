/**
 * Money helpers.
 *
 * Authoritative arithmetic happens on the server with Prisma.Decimal against
 * PostgreSQL NUMERIC columns. These helpers exist for display, for parsing user
 * input into a canonical decimal string, and for test assertions. They never
 * introduce binary floating point into a financial result.
 */

export const MONEY_SCALE = 2;

export type CurrencyCode = 'THB' | 'USD' | string;

export interface MoneyFormatOptions {
  locale?: string;
  currency?: CurrencyCode;
  /** Show the currency symbol. Default true. */
  withSymbol?: boolean;
  /** Minimum fraction digits. Default 2. */
  minFractionDigits?: number;
}

/** Format a decimal string (never a float) for display. */
export function formatMoney(
  amount: string | number,
  { locale = 'th-TH', currency = 'THB', withSymbol = true, minFractionDigits = 2 }: MoneyFormatOptions = {},
): string {
  const value = typeof amount === 'number' ? amount.toFixed(MONEY_SCALE) : amount;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return withSymbol ? `฿0.00` : '0.00';
  return new Intl.NumberFormat(locale, {
    style: withSymbol ? 'currency' : 'decimal',
    currency,
    minimumFractionDigits: minFractionDigits,
    maximumFractionDigits: MONEY_SCALE,
  }).format(numeric);
}

/** Format without the currency symbol, e.g. for inputs. */
export function formatAmount(amount: string | number): string {
  return formatMoney(amount, { withSymbol: false, locale: 'en-US' });
}

/**
 * Parse user input into a canonical two-decimal string.
 * Returns null for input that is not a valid non-negative amount.
 */
export function parseAmountToDecimalString(input: string, allowNegative = false): string | null {
  const cleaned = input.replace(/[,\s฿]/g, '').trim();
  if (!/^-?\d+(\.\d{1,4})?$/.test(cleaned)) return null;
  if (!allowNegative && cleaned.startsWith('-')) return null;
  const negative = cleaned.startsWith('-');
  const [whole = '0', fraction = ''] = cleaned.replace('-', '').split('.');
  const cents = fraction.padEnd(MONEY_SCALE + 2, '0').slice(0, MONEY_SCALE + 2);
  // Round half-up at the third decimal.
  const base = BigInt(whole) * 100n + BigInt(cents.slice(0, MONEY_SCALE) || '0');
  const roundDigit = Number(cents[MONEY_SCALE] ?? '0');
  const rounded = roundDigit >= 5 ? base + 1n : base;
  const sign = negative ? '-' : '';
  return `${sign}${rounded / 100n}.${String(rounded % 100n).padStart(2, '0')}`;
}

/** Add two decimal strings without floating point. */
export function addMoney(a: string, b: string): string {
  return minorToDecimal(decimalToMinor(a) + decimalToMinor(b));
}

export function subMoney(a: string, b: string): string {
  return minorToDecimal(decimalToMinor(a) - decimalToMinor(b));
}

export function decimalToMinor(value: string): bigint {
  const negative = value.startsWith('-');
  const [whole = '0', fraction = ''] = value.replace('-', '').split('.');
  const minor = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
  return negative ? -minor : minor;
}

export function minorToDecimal(minor: bigint): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  return `${negative ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}

/** Compare two decimal strings. Returns -1, 0 or 1. */
export function compareMoney(a: string, b: string): number {
  const left = decimalToMinor(a);
  const right = decimalToMinor(b);
  return left === right ? 0 : left < right ? -1 : 1;
}

export function isZeroMoney(value: string): boolean {
  return decimalToMinor(value) === 0n;
}
