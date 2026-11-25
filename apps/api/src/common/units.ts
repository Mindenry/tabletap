import { Prisma } from '@prisma/client';
import { D } from './money';

export const ALLOWED_UNITS = ['g', 'kg', 'ml', 'l', 'pcs', 'pack'] as const;
export type Unit = (typeof ALLOWED_UNITS)[number];

export const UNIT_FAMILY: Record<Unit, 'MASS' | 'VOLUME' | 'COUNT'> = {
  g: 'MASS',
  kg: 'MASS',
  ml: 'VOLUME',
  l: 'VOLUME',
  pcs: 'COUNT',
  pack: 'COUNT',
};

const TO_BASE: Record<Unit, string> = {
  g: '1',
  kg: '1000',
  ml: '1',
  l: '1000',
  pcs: '1',
  pack: '1',
};

export function isUnit(value: string): value is Unit {
  return (ALLOWED_UNITS as readonly string[]).includes(value);
}

/**
 * Convert a quantity between compatible units. Returns null when conversion is
 * not defined (e.g. grams to pieces) instead of guessing.
 */
export function convertQuantity(
  quantity: Prisma.Decimal.Value,
  from: string,
  to: string,
): Prisma.Decimal | null {
  if (!isUnit(from) || !isUnit(to)) return null;
  if (from === to) return D(quantity);
  if (UNIT_FAMILY[from] !== UNIT_FAMILY[to]) return null;
  if (UNIT_FAMILY[from] === 'COUNT') return null; // pcs <-> pack needs a pack size
  const base = D(quantity).times(D(TO_BASE[from]));
  return base.dividedBy(D(TO_BASE[to])).toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
}
