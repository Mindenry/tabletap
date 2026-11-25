import { Prisma } from '@prisma/client';

/**
 * Money on the server is always Prisma.Decimal (decimal.js) backed by
 * PostgreSQL NUMERIC. This module centralises rounding so that every caller
 * rounds the same way.
 */

export type Decimal = Prisma.Decimal;
export const DecimalCtor = Prisma.Decimal;

export const MONEY_SCALE = 2;
export const QTY_SCALE = 3;

export function D(value: Prisma.Decimal.Value): Decimal {
  return new Prisma.Decimal(value);
}

export const ZERO = D(0);

export function roundMoney(value: Prisma.Decimal.Value): Decimal {
  return D(value).toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP);
}

export function roundQty(value: Prisma.Decimal.Value): Decimal {
  return D(value).toDecimalPlaces(QTY_SCALE, Prisma.Decimal.ROUND_HALF_UP);
}

/** Canonical JSON-friendly money string with exactly two decimals. */
export function moneyString(value: Prisma.Decimal.Value): string {
  return roundMoney(value).toFixed(MONEY_SCALE);
}

export function qtyString(value: Prisma.Decimal.Value): string {
  return roundQty(value).toFixed(QTY_SCALE);
}

/** Multiply and round to money precision. */
export function multiplyMoney(amount: Prisma.Decimal.Value, factor: Prisma.Decimal.Value): Decimal {
  return roundMoney(D(amount).times(D(factor)));
}

export function sumMoney(values: Prisma.Decimal.Value[]): Decimal {
  return roundMoney(values.reduce<Decimal>((acc, v) => acc.plus(D(v)), D(0)));
}

export function isNegative(value: Prisma.Decimal.Value): boolean {
  return D(value).isNegative() && !D(value).isZero();
}

export function isZero(value: Prisma.Decimal.Value): boolean {
  return D(value).isZero();
}
