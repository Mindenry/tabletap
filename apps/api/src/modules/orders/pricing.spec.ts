import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { priceOrder, splitEqually } from './pricing';

const D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

describe('priceOrder', () => {
  it('prices a simple VAT-inclusive order without service charge', () => {
    const result = priceOrder([{ unitPrice: 100, modifiersPerUnit: 0, quantity: 2 }], {
      vatRate: 7,
      vatInclusive: true,
      serviceChargeType: 'PERCENT',
      serviceChargeValue: 0,
    });
    expect(result.subtotal.toFixed(2)).toBe('200.00');
    expect(result.total.toFixed(2)).toBe('200.00');
    expect(result.taxTotal.toFixed(2)).toBe('13.08'); // 200 * 7/107
    expect(result.serviceCharge.toFixed(2)).toBe('0.00');
  });

  it('adds VAT on top when prices are exclusive', () => {
    const result = priceOrder([{ unitPrice: 100, modifiersPerUnit: 20, quantity: 1 }], {
      vatRate: 7,
      vatInclusive: false,
      serviceChargeType: 'PERCENT',
      serviceChargeValue: 0,
    });
    expect(result.subtotal.toFixed(2)).toBe('120.00');
    expect(result.taxTotal.toFixed(2)).toBe('8.40');
    expect(result.total.toFixed(2)).toBe('128.40');
  });

  it('applies a percentage service charge before tax', () => {
    const result = priceOrder([{ unitPrice: 1000, modifiersPerUnit: 0, quantity: 1 }], {
      vatRate: 7,
      vatInclusive: false,
      serviceChargeType: 'PERCENT',
      serviceChargeValue: 10,
    });
    expect(result.serviceCharge.toFixed(2)).toBe('100.00');
    expect(result.taxTotal.toFixed(2)).toBe('77.00'); // 1100 * 7%
    expect(result.total.toFixed(2)).toBe('1177.00');
  });

  it('caps a fixed service charge at the net subtotal', () => {
    const result = priceOrder([{ unitPrice: 50, modifiersPerUnit: 0, quantity: 1 }], {
      vatRate: 7,
      vatInclusive: true,
      serviceChargeType: 'FIXED',
      serviceChargeValue: 500,
    });
    // A pathological fixed charge can never exceed the food value, so the
    // invoice tops out at twice the net subtotal rather than inventing money.
    expect(result.serviceCharge.toFixed(2)).toBe('50.00');
    expect(result.total.toFixed(2)).toBe('100.00');
  });

  it('allocates an order discount across lines so the parts sum exactly', () => {
    const result = priceOrder(
      [
        { unitPrice: 100, modifiersPerUnit: 0, quantity: 1 },
        { unitPrice: 100, modifiersPerUnit: 0, quantity: 1 },
        { unitPrice: 100, modifiersPerUnit: 0, quantity: 1 },
      ],
      { vatRate: 7, vatInclusive: false, serviceChargeType: 'PERCENT', serviceChargeValue: 0 },
      100,
    );
    const allocated = result.lines.reduce((acc, line) => acc.plus(line.lineDiscount), D(0));
    expect(allocated.toFixed(2)).toBe('100.00');
    expect(result.total.toFixed(2)).toBe('214.00'); // (300 - 100) * 1.07
  });

  it('never discounts more than the subtotal', () => {
    const result = priceOrder(
      [{ unitPrice: 100, modifiersPerUnit: 0, quantity: 1 }],
      { vatRate: 7, vatInclusive: false, serviceChargeType: 'PERCENT', serviceChargeValue: 0 },
      500,
    );
    expect(result.discountTotal.toFixed(2)).toBe('100.00');
    expect(result.total.toFixed(2)).toBe('0.00');
  });

  it('rounds half up at two decimals', () => {
    const result = priceOrder([{ unitPrice: '0.125', modifiersPerUnit: 0, quantity: 1 }], {
      vatRate: 0,
      vatInclusive: true,
      serviceChargeType: 'PERCENT',
      serviceChargeValue: 0,
    });
    expect(result.total.toFixed(2)).toBe('0.13');
  });

  it('handles modifier deltas per unit, not per line', () => {
    const result = priceOrder([{ unitPrice: 100, modifiersPerUnit: 15, quantity: 3 }], {
      vatRate: 0,
      vatInclusive: true,
      serviceChargeType: 'PERCENT',
      serviceChargeValue: 0,
    });
    expect(result.subtotal.toFixed(2)).toBe('345.00');
  });

  it('keeps totals consistent across a 1000-order random sweep', () => {
    for (let index = 0; index < 1000; index += 1) {
      const lineCount = 1 + (index % 5);
      const lines = Array.from({ length: lineCount }, (_, lineIndex) => ({
        unitPrice: (10 + ((index * 7 + lineIndex * 13) % 900)) / 1,
        modifiersPerUnit: (lineIndex * 5) % 40,
        quantity: 1 + ((index + lineIndex) % 4),
      }));
      const inclusive = index % 2 === 0;
      const service =
        index % 3 === 0 ? { type: 'PERCENT' as const, value: 10 } : { type: 'FIXED' as const, value: 25 };
      const discount = index % 4 === 0 ? 50 : 0;
      const result = priceOrder(
        lines,
        {
          vatRate: 7,
          vatInclusive: inclusive,
          serviceChargeType: service.type,
          serviceChargeValue: service.value,
        },
        discount,
      );

      const lineSum = result.lines.reduce((acc, line) => acc.plus(line.lineTotal), D(0));
      expect(lineSum.toFixed(2)).toBe(result.total.toFixed(2));
      expect(result.total.greaterThanOrEqualTo(0)).toBe(true);
      expect(result.discountTotal.lessThanOrEqualTo(result.subtotal)).toBe(true);
    }
  });
});

describe('splitEqually', () => {
  it('distributes the remainder without losing a satang', () => {
    const parts = splitEqually('100.00', 3);
    expect(parts.map((part) => part.toFixed(2))).toEqual(['33.34', '33.33', '33.33']);
    expect(parts.reduce((acc, part) => acc.plus(part), D(0)).toFixed(2)).toBe('100.00');
  });

  it('handles a total smaller than the number of parts', () => {
    const parts = splitEqually('0.02', 3);
    expect(parts.reduce((acc, part) => acc.plus(part), D(0)).toFixed(2)).toBe('0.02');
  });
});
