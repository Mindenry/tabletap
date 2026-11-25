# Financial rules

Authoritative implementation: `apps/api/src/modules/orders/pricing.ts`
Tests: `apps/api/src/modules/orders/pricing.spec.ts`

## Representation

- Database: `NUMERIC(12,2)` for money, `NUMERIC(12,3)` for quantities, `NUMERIC(12,4)` for unit cost.
- TypeScript: `Prisma.Decimal` (decimal.js) with precision 28 and `ROUND_HALF_UP`.
- API: money is serialized as a decimal **string** (`"1234.50"`), never a JSON number.
- Splits: integer satang internally, so remainders are distributed exactly.

## Order pricing

Inputs: lines with `unitPrice` (base + variant delta), `modifiersPerUnit`, `quantity`; branch VAT
rate and mode; service-charge type/value; optional order-level discount.

1. `lineSubtotal = round2((unitPrice + modifiersPerUnit) × quantity)`
2. `subtotal = Σ lineSubtotal`
3. `discountTotal = min(round2(requestedDiscount), subtotal)`
4. Discount allocation: each line receives `round2(discountTotal × lineSubtotal / subtotal)`; the last
   line receives the remainder. **Allocated discounts always sum to `discountTotal`.**
5. `netTotal = subtotal − discountTotal`
6. Service charge:
   - `PERCENT`: `round2(netTotal × value / 100)`
   - `FIXED`: `min(round2(value), netTotal)`
7. Service allocation: proportional to each line’s net amount, remainder to the last line.
8. Taxable base: `round2(netTotal + serviceCharge)`.
9. VAT:
   - inclusive: `taxTotal = round2(base × rate / (100 + rate))`; `total = base`
   - exclusive: `taxTotal = round2(base × rate / 100)`; `total = round2(base + taxTotal)`
10. Tax allocation: proportional to each line’s base, remainder to the last line.
11. `lineTotal = base + lineTax` (exclusive) or `base` (inclusive).

Guarantees asserted by tests:

- `Σ lineTotal = total`
- `Σ lineTax = taxTotal`
- `Σ lineDiscount = discountTotal`
- `0 ≤ discountTotal ≤ subtotal`
- Half-up rounding at 2dp (e.g. `0.125 → 0.13`)

## Why tax is computed once and allocated

Computing tax per line and summing can drift from tax on the total (e.g. three lines of 66.67 at 7%
produce 14.01 instead of 14.00). TableTap computes the tax on the taxable base and allocates it, so
the receipt and the total always agree.

## Bills

A bill is a settlement document over one or more orders:

- `subtotal = Σ order.subtotal`
- `discountTotal = Σ order.discountTotal`
- `serviceCharge = Σ order.serviceCharge`
- `taxTotal = Σ order.taxTotal`
- `total = Σ order.total`

Bill items copy the order item snapshots for display and receipts. A later menu or price change
cannot alter a bill.

## Payments

- `due = total − paidTotal`
- `availableToPay = max(0, total − paidTotal − Σ pending payments)`
- A payment amount must be `> 0` and `≤ availableToPay`.
- Confirmation requires `amountPaid ≥ amount`; the bill is credited with the payment amount, not the
  cash tendered, so change is not revenue.
- Confirmation uses `UPDATE Bill SET paidTotal = paidTotal + amount WHERE paidTotal + amount <= total`
  inside a transaction that holds `FOR UPDATE` on the payment row.

## Refunds

- `refundable = amountPaid − Σ refunds`
- A refund may not exceed `refundable`.
- Full refund sets the payment and bill to `REFUNDED`; partial sets `PARTIALLY_REFUNDED`.
- Recording a refund does not transfer money. This is stated in the API response and the UI.

## Rounding policy

`ROUND_HALF_UP` at every rounding point. Intermediate values are not truncated. All authoritative
arithmetic happens on the server; the client only displays estimates.
