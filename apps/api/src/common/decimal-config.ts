import { Prisma } from '@prisma/client';

/**
 * Call once per process (API, worker, seed) before any money is calculated.
 * Guarantees decimal.js uses exactly the rounding policy TableTap documents:
 * 28 significant digits, half-up rounding at the point of rounding.
 */
Prisma.Decimal.set({
  precision: 28,
  rounding: Prisma.Decimal.ROUND_HALF_UP,
  toExpNeg: -9,
  toExpPos: 30,
});

export const decimalConfigured = true;
