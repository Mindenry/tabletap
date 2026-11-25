import { Prisma } from '@prisma/client';
import { D, roundMoney } from '../../common/money';

export interface PricingLineInput {
  /** Unit price after variant adjustment. */
  unitPrice: Prisma.Decimal.Value;
  /** Sum of modifier deltas for one unit. */
  modifiersPerUnit: Prisma.Decimal.Value;
  quantity: number;
}

export interface PricingRules {
  vatRate: Prisma.Decimal.Value;
  vatInclusive: boolean;
  serviceChargeType: 'PERCENT' | 'FIXED';
  serviceChargeValue: Prisma.Decimal.Value;
}

export interface PricedLine {
  lineSubtotal: Prisma.Decimal;
  lineDiscount: Prisma.Decimal;
  lineServiceCharge: Prisma.Decimal;
  lineTax: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
}

export interface PricingResult {
  subtotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  serviceCharge: Prisma.Decimal;
  taxTotal: Prisma.Decimal;
  total: Prisma.Decimal;
  lines: PricedLine[];
}

/**
 * Authoritative order/bill pricing.
 *
 * Rules (documented in docs/architecture/financial-rules.md):
 *  1. lineSubtotal = round2((unitPrice + modifiersPerUnit) * quantity)
 *  2. An order-level discount is allocated across lines proportionally to
 *     lineSubtotal; the remainder goes to the last line so allocations sum
 *     exactly.
 *  3. Service charge = percentage of (subtotal - discount), or a fixed amount
 *     capped at the net subtotal. Allocated proportionally for tax purposes.
 *  4. VAT-inclusive: total = net + service; tax is extracted as
 *     base * rate / (100 + rate) and is informational.
 *     VAT-exclusive: tax = base * rate / 100; total = base + tax.
 *  5. Every rounding step is half-up to 2dp, and the final total is the sum of
 *     the rounded line totals.
 */
export function priceOrder(
  lines: PricingLineInput[],
  rules: PricingRules,
  orderDiscount: Prisma.Decimal.Value = 0,
): PricingResult {
  const vatRate = D(rules.vatRate);
  const serviceValue = D(rules.serviceChargeValue);

  const priced: PricedLine[] = lines.map((line) => {
    const lineSubtotal = roundMoney(D(line.unitPrice).plus(D(line.modifiersPerUnit)).times(line.quantity));
    return {
      lineSubtotal,
      lineDiscount: D(0),
      lineServiceCharge: D(0),
      lineTax: D(0),
      lineTotal: lineSubtotal,
    };
  });

  const subtotal = priced.reduce((acc, line) => acc.plus(line.lineSubtotal), D(0));
  const requestedDiscount = D(orderDiscount).isNegative() ? D(0) : D(orderDiscount);
  const discountTotal = Prisma.Decimal.min(roundMoney(requestedDiscount), roundMoney(subtotal));

  // Allocate discount proportionally, remainder to the last non-zero line.
  if (discountTotal.greaterThan(0) && subtotal.greaterThan(0)) {
    let allocated = D(0);
    priced.forEach((line, index) => {
      if (index === priced.length - 1) {
        line.lineDiscount = discountTotal.minus(allocated);
      } else {
        const share = roundMoney(discountTotal.times(line.lineSubtotal).dividedBy(subtotal));
        line.lineDiscount = share;
        allocated = allocated.plus(share);
      }
    });
  }

  const netTotal = roundMoney(subtotal.minus(discountTotal));

  let serviceCharge = D(0);
  if (rules.serviceChargeType === 'PERCENT') {
    serviceCharge = roundMoney(netTotal.times(serviceValue).dividedBy(100));
  } else if (rules.serviceChargeType === 'FIXED') {
    serviceCharge = Prisma.Decimal.min(roundMoney(serviceValue), netTotal);
  }

  // Allocate the service charge so tax per line is proportional.
  if (serviceCharge.greaterThan(0) && netTotal.greaterThan(0)) {
    let allocated = D(0);
    priced.forEach((line, index) => {
      const net = line.lineSubtotal.minus(line.lineDiscount);
      if (index === priced.length - 1) {
        line.lineServiceCharge = serviceCharge.minus(allocated);
      } else {
        const share = roundMoney(serviceCharge.times(net).dividedBy(netTotal));
        line.lineServiceCharge = share;
        allocated = allocated.plus(share);
      }
    });
  }

  priced.forEach((line) => {
    const base = line.lineSubtotal.minus(line.lineDiscount).plus(line.lineServiceCharge);
    line.lineTax = D(0);
    line.lineTotal = base;
  });

  // Tax is computed once on the taxable base and then allocated to lines, so
  // the receipt always satisfies: sum(line tax) = tax on the bill total.
  const taxableBase = roundMoney(netTotal.plus(serviceCharge));
  const taxTotal = rules.vatInclusive
    ? roundMoney(taxableBase.times(vatRate).dividedBy(vatRate.plus(100)))
    : roundMoney(taxableBase.times(vatRate).dividedBy(100));
  const total = rules.vatInclusive ? taxableBase : roundMoney(taxableBase.plus(taxTotal));

  if (taxTotal.greaterThan(0) && taxableBase.greaterThan(0)) {
    let allocated = D(0);
    priced.forEach((line, index) => {
      const base = line.lineSubtotal.minus(line.lineDiscount).plus(line.lineServiceCharge);
      if (index === priced.length - 1) {
        line.lineTax = taxTotal.minus(allocated);
      } else {
        const share = roundMoney(taxTotal.times(base).dividedBy(taxableBase));
        line.lineTax = share;
        allocated = allocated.plus(share);
      }
    });
  }

  priced.forEach((line) => {
    const base = line.lineSubtotal.minus(line.lineDiscount).plus(line.lineServiceCharge);
    line.lineTotal = roundMoney(rules.vatInclusive ? base : base.plus(line.lineTax));
  });

  return {
    subtotal: roundMoney(subtotal),
    discountTotal,
    serviceCharge: roundMoney(serviceCharge),
    taxTotal,
    total,
    lines: priced,
  };
}

/**
 * Splits a total into equal shares that add up exactly. Used by "split equally"
 * at the POS; the remainder is distributed one satang at a time.
 */
export function splitEqually(total: Prisma.Decimal.Value, ways: number): Prisma.Decimal[] {
  if (ways <= 0) throw new Error('ways must be positive');
  const cents = roundMoney(total).times(100).toNumber();
  const base = Math.floor(cents / ways);
  const remainder = cents - base * ways;
  return Array.from({ length: ways }, (_, index) => D((base + (index < remainder ? 1 : 0)) / 100));
}
