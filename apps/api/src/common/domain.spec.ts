import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { convertQuantity, isUnit } from './units';
import {
  canTransition,
  ORDER_TRANSITIONS,
  PAYMENT_TRANSITIONS,
  PAYMENT_STATUS_LABELS,
} from '@tabletap/shared';
import { addMoney, compareMoney, formatMoney, parseAmountToDecimalString } from '@tabletap/shared';

describe('unit conversion', () => {
  it('converts within a family', () => {
    expect(convertQuantity(1, 'kg', 'g')?.toFixed(0)).toBe('1000');
    expect(convertQuantity(2500, 'ml', 'l')?.toFixed(2)).toBe('2.50');
  });

  it('refuses cross-family conversion instead of guessing', () => {
    expect(convertQuantity(1, 'kg', 'pcs')).toBeNull();
    expect(convertQuantity(1, 'pcs', 'pack')).toBeNull();
  });

  it('recognises only supported units', () => {
    expect(isUnit('kg')).toBe(true);
    expect(isUnit('oz')).toBe(false);
  });
});

describe('state machines', () => {
  it('allows only declared order transitions', () => {
    expect(canTransition(ORDER_TRANSITIONS, 'PENDING', 'ACCEPTED')).toBe(true);
    expect(canTransition(ORDER_TRANSITIONS, 'PENDING', 'SERVED')).toBe(false);
    expect(canTransition(ORDER_TRANSITIONS, 'SERVED', 'CANCELLED')).toBe(false);
  });

  it('does not allow a paid payment to be confirmed again', () => {
    expect(canTransition(PAYMENT_TRANSITIONS, 'PAID', 'PAID')).toBe(false);
    expect(canTransition(PAYMENT_TRANSITIONS, 'AWAITING_CONFIRMATION', 'PAID')).toBe(true);
  });

  it('has Thai and English labels for every payment status', () => {
    for (const labels of Object.values(PAYMENT_STATUS_LABELS)) {
      expect(labels.th.length).toBeGreaterThan(0);
      expect(labels.en.length).toBeGreaterThan(0);
    }
  });
});

describe('money helpers', () => {
  it('parses user input to two decimals with half-up rounding', () => {
    expect(parseAmountToDecimalString('1,234.5')).toBe('1234.50');
    expect(parseAmountToDecimalString('0.125')).toBe('0.13');
    expect(parseAmountToDecimalString('-5')).toBeNull();
    expect(parseAmountToDecimalString('abc')).toBeNull();
  });

  it('adds without floating point drift', () => {
    expect(addMoney('0.1', '0.2')).toBe('0.30');
    expect(compareMoney('10.00', '9.99')).toBe(1);
  });

  it('formats THB for Thai readers', () => {
    expect(formatMoney('1234.5', { locale: 'th-TH' })).toContain('1,234.50');
  });
});
