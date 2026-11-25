# Order lifecycle

The path from a guest scanning a QR to revenue appearing in analytics, with the transaction
boundary at each step.

## 1. QR resolution (read-only)

`GET /public/qr/:token`

- Hash the token, look up an `ACTIVE` `TableQrToken`.
- Load table → branch → tenant; reject inactive branch/tenant.
- Return restaurant identity, table, live session (if any) and the public menu for that branch.

## 2. Customer session

`POST /public/qr/:token/session`

- Re-resolve the token.
- Lock the table row (`SELECT … FOR UPDATE`).
- Join the live session if one exists; otherwise create it and set the table `OCCUPIED`.
- Create `CustomerSession` with a hashed opaque token, 6-hour expiry; set `tt_customer` and `tt_csrf`.
- Append `table.updated` to the outbox.

## 3. Order submission

`POST /public/customer-session/orders` (or staff `POST /orders`)

Single PostgreSQL transaction:

1. Return an existing order if `Idempotency-Key` matches.
2. Validate the customer session and the live table session (status, branch, tenant).
3. Load menu items with variants, branch availability, modifier groups and stations.
4. For each line: item active, not sold out, variant valid and available, modifier selection obeys
   required/min/max, options belong to the item, note length.
5. Price with the pure pricing engine (subtotal, discount, service, VAT, total).
6. Validate and reserve the promotion (atomic redemption counter).
7. Allocate the document number (`ORD-<branch>-<yyyymmdd>-<seq>`).
8. Insert `Order`, `OrderItem`, `OrderItemModifier` snapshots.
9. Group items by station and insert `KitchenTicket` + `KitchenTicketItem` rows.
10. Insert `OrderEvent` and outbox events (`order.created`, one `kitchen.ticket.created` per station).
11. Set the table to `ORDERING`.
12. Commit.

Any failure rolls the whole thing back. A duplicate key returns the original order.

## 4. Kitchen acceptance

`POST /kitchen/tickets/:id/accept`

1. Lock the ticket row; validate `PENDING → ACCEPTED`.
2. Call `acceptOrderInTransaction`: lock the order, deduct inventory once
   (`UPDATE Ingredient SET currentStock = currentStock - required WHERE currentStock >= required`
   per order item/ingredient, writing idempotent `StockMovement` rows), set the order `ACCEPTED`.
3. Mark the ticket and its items `ACCEPTED`.
4. Append `order.accepted` and `kitchen.ticket.updated`.

Insufficient stock aborts the acceptance; the ticket stays `PENDING` and the API returns the shortage
details so staff can receive stock or reject.

## 5. Preparation and serving

- `start` → ticket/items `PREPARING`, order `PREPARING`.
- `ready` (ticket or individual item) → items `READY`; order becomes `READY` when every non-cancelled
  item is ready.
- `served` → items `SERVED`; order becomes `SERVED` when all are served.
- `reject` → ticket `REJECTED`, its items `CANCELLED`, **that ticket’s** stock reversed, order
  recalculated; if nothing remains the order is cancelled.

## 6. Bill

`POST /bills { tableSessionId }`

- Select unbilled, non-cancelled orders in the session.
- Sum their snapshotted totals into the bill.
- Copy item snapshots into `BillItem`, link orders through `BillOrder`.
- Move session/table to `BILL_REQUESTED`; emit `bill.created`.

## 7. Payment

`POST /payments` → `POST /payments/:id/promptpay` (optional) → `POST /payments/:id/confirm`

- Creation checks `availableToPay` (total − paid − pending) and rejects overpayment.
- PromptPay generation builds an EMVCo payload for the exact amount and sets
  `AWAITING_CONFIRMATION`.
- Confirmation locks the payment, validates the transition and the received amount, credits the bill
  with a conditional update, recomputes the bill status, and moves the session/table to
  `PAYMENT_PENDING` when fully paid.
- Receipt snapshot is generated idempotently.
- Audit and outbox events are written.

## 8. Closing

`POST /tables/:id/close-session`

- Refuse if any bill is `OPEN`/`PARTIALLY_PAID`.
- Refuse if any order is `PENDING/ACCEPTED/PREPARING/READY`.
- Close the session, revoke customer sessions, set the table `CLEANING`.
- Staff mark it `AVAILABLE` after cleaning.

## 9. Analytics

The paid bill, its payments, its orders and items are now visible to the analytics SQL. No separate
event or counter is required for revenue to appear.
