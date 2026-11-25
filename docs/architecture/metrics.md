# Metric definitions

Every metric is computed from persisted rows. There are no seeded dashboard counters.

Timezone: day and hour buckets use `AT TIME ZONE 'Asia/Bangkok'`. Period filters use timestamps
(`paidAt`, `createdAt`) with an inclusive start and exclusive end.

## Sales

| Metric         | Definition                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------- |
| Gross sales    | `SUM(Bill.total)` where `Bill.status = 'PAID'` and `paidAt` in period                        |
| Refunds        | `SUM(Refund.amount)` where `Refund.createdAt` in period                                      |
| Net sales      | `grossSales − refunds`                                                                       |
| VAT            | `SUM(Bill.taxTotal)` over paid bills in period (informational when prices are VAT-inclusive) |
| Service charge | `SUM(Bill.serviceCharge)` over paid bills                                                    |
| Discounts      | `SUM(Bill.discountTotal)` over paid bills                                                    |
| Paid bills     | `COUNT(*)` of paid bills in period                                                           |
| Average bill   | `grossSales / paidBills` (0 when no bills)                                                   |
| Items sold     | `SUM(BillItem.quantity)` joined to paid bills in period                                      |

Cancelled orders never contribute to sales. A bill that is cancelled or refunded is excluded from
gross sales unless it remains `PAID` (partial refunds keep the bill paid and are subtracted through
the refunds metric).

## Orders

| Metric            | Definition                                           |
| ----------------- | ---------------------------------------------------- |
| Orders            | Orders created in period (all statuses)              |
| Cancelled orders  | Orders with `status = 'CANCELLED'` created in period |
| Cancellation rate | `cancelled / orders × 100`                           |

## Menu performance

Joined from paid `Bill` → `BillItem` → `OrderItem` → `MenuItem`:

- Quantity sold = `SUM(BillItem.quantity)`
- Revenue = `SUM(BillItem.lineTotal)`
- Estimated cost = `SUM(BillItem.quantity × MenuItem.costEstimate)` (recipe cost per serving)
- Gross margin = revenue − cost
- Margin % = `gross margin / revenue × 100`

`MenuItem.costEstimate` is refreshed when a recipe version is published. Items without a recipe
contribute zero cost, which inflates margin; the UI shows “—” only when revenue is zero.

## Operations

| Metric                    | Definition                                                 |
| ------------------------- | ---------------------------------------------------------- |
| Average ticket ready time | `AVG(readyAt − acceptedAt)` over kitchen tickets in period |
| Order to served           | `AVG(servedAt − createdAt)` over served orders in period   |
| Station timing            | Same as ticket ready time grouped by station               |
| Request resolution        | `AVG(resolvedAt − createdAt)` grouped by request type      |

## Payment mix

`SUM(Payment.amount)` and `COUNT(*)` grouped by method for payments with `status = 'PAID'` and
`confirmedAt` in period.

## Occupancy and tables

- Seated tables = tables with a live session (`OPEN`, `BILL_REQUESTED`, `PAYMENT_PENDING`).
- Open requests = requests in `OPEN`, `ACKNOWLEDGED` or `IN_PROGRESS`.
- Outstanding = unbilled order totals + unpaid bill balances for the session.
