# State machines

Implementations: `packages/shared/src/state-machines.ts` (transition tables) and the services that
enforce them inside transactions.

## Table session

```
OPEN ──► BILL_REQUESTED ──► PAYMENT_PENDING ──► CLOSED
  │              │                 │
  └──────────────┴─────────────────┴──► CLOSED
OPEN / BILL_REQUESTED ──► ABANDONED (staff only, not exposed in this build)
```

- Opening requires no live session on the table; a partial unique index enforces it, plus
  `SELECT … FOR UPDATE` on the table row.
- A bill creation moves `OPEN → BILL_REQUESTED`. Full payment moves `BILL_REQUESTED →
PAYMENT_PENDING`.
- Closing requires every bill `PAID`/`CANCELLED` and no order in `PENDING/ACCEPTED/PREPARING/READY`.
  Closing revokes customer sessions and sets the table to `CLEANING`.
- Moving a session updates `tableId` on the session, orders and requests, then frees the source table.
- Merging moves orders/requests to the target session, closes the source session, and refuses if the
  source has an unpaid bill.

## Order

```
PENDING ──► ACCEPTED ──► PREPARING ──► READY ──► SERVED
   │            │            │
   └────────────┴────────────┴──► CANCELLED
```

- Accepting deducts inventory once (atomic, conditional).
- The status is derived from item states after item-level kitchen updates; direct jumps such as
  `PENDING → SERVED` are rejected.
- Cancellation is allowed in `PENDING`, `ACCEPTED`, `PREPARING`; it is refused once the order is on a
  bill. It reverses remaining stock deductions and writes `OrderCancellation`.
- Every transition appends an `OrderEvent` and an outbox event.

## Order item

```
PENDING → ACCEPTED → PREPARING → READY → SERVED
    └────────┴──────────┴────────► CANCELLED
```

Items are updated per station ticket. Rejecting a ticket cancels its items and reverses their stock.

## Kitchen ticket

```
PENDING ──► ACCEPTED ──► PREPARING ──► READY ──► SERVED
   │            │            │
   └────────────┴────────────┴──► REJECTED ──► PENDING (reopen, privileged)
```

- Accepting a ticket also accepts the order (once) and triggers deduction.
- Rejecting requires a reason; it cancels the ticket’s items, reverses their stock, and cancels the
  order if nothing remains.
- A served ticket cannot be rejected.

## Bill

```
OPEN ──► PARTIALLY_PAID ──► PAID
  │            │              │
  └────────────┴──► CANCELLED │
                              └──► PARTIALLY_REFUNDED ──► REFUNDED
```

- A bill with a confirmed payment cannot be cancelled; use a refund.
- Cancelling unlinks orders so they can be billed again.
- Totals never change after creation; only payment state does.

## Payment

```
PENDING ──► AWAITING_CONFIRMATION ──► PAID ──► PARTIALLY_REFUNDED ──► REFUNDED
   │                  │
   └──────────────────┴──► EXPIRED / FAILED
```

- Confirmation is only from `PENDING` or `AWAITING_CONFIRMATION`, under a row lock.
- Confirming an already-paid payment returns `409 PAYMENT_ALREADY_CONFIRMED`.
- Expiry requires the expiry timestamp to have passed.
- A QR being scanned does not change state; only a staff confirmation or a verified PSP webhook can.

## Table request

```
OPEN ──► ACKNOWLEDGED ──► IN_PROGRESS ──► RESOLVED
  │            │                │
  └────────────┴────────────────┴──► CANCELLED
```

- Customers may create one open request of the same type per five minutes.
- Acknowledging assigns the staff member and timestamp; resolving records the note and timestamp.
- A bill request also moves the session and table to `BILL_REQUESTED`.

## Subscription

```
TRIAL ──► ACTIVE ──► PAST_DUE ──► SUSPENDED ──► CANCELLED
   └────────┴──────────┴──────────────┴──────► EXPIRED
```

Stored and administered from the platform console. Entitlement checks are enforced when
`SUBSCRIPTION_MODE=enforced`; development mode grants every feature.
