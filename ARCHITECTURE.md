# TableTap architecture

## 1. Shape of the system

```
                    ┌──────────────────────────────────────────────┐
  Guest phone ──────►  Next.js /menu/[qrToken]  (public)            │
  Staff browser ────►  Next.js /app, /kitchen, /pos, /platform      │
                    └───────────────┬──────────────────────────────┘
                                    │  same-origin /api/* rewrite
                                    ▼
                    ┌──────────────────────────────────────────────┐
                    │  NestJS API  /api/v1                         │
                    │  guards: throttler → CSRF → auth → perms     │
                    │  modules: auth, tenancy, catalog, floor,     │
                    │           orders, kitchen, billing,          │
                    │           inventory, analytics, platform,    │
                    │           realtime, audit                    │
                    └───────┬───────────────────────┬──────────────┘
                            │ Prisma                │ outbox dispatcher
                            ▼                       ▼
                    ┌───────────────┐       ┌──────────────────────┐
                    │ PostgreSQL 16 │       │ Socket.IO /realtime  │
                    │ source of     │       │ rooms by tenant,     │
                    │ truth         │       │ branch, station,     │
                    └───────────────┘       │ customer session     │
                                            └──────────────────────┘
```

There is no separate worker process in this build. The outbox dispatcher and the payment-expiry
sweep are in-process; see “Deferred” below.

## 2. Multi-tenancy and authorization

- `Tenant` is the restaurant business. `Branch` belongs to a tenant. Every business row carries
  `tenantId`, and branch-scoped rows carry `branchId` as well.
- Staff authenticate with email + password. The access token is a short-lived JWT stored in an
  HttpOnly cookie (`tt_at`); the refresh token is an opaque random value stored **hashed** in
  `UserSession`, rotated on every refresh. Reuse of a rotated token revokes the whole family.
- On **every request**, `StaffAuthGuard` loads the session and the active membership from
  PostgreSQL. It does not cache permissions in the token, so a role change or deactivation takes
  effect immediately.
- `PermissionsGuard` checks the permission codes declared with `@RequirePermissions` (all-of) or
  `@RequireAnyPermission` (any-of). Permissions come from `RolePermission` rows, not from the token.
- `BranchAccessService` is the only way a branch-scoped operation resolves a branch. It verifies the
  branch belongs to the caller’s tenant and is inside the caller’s branch scope (an empty scope
  means “all branches”).
- Platform administrators have `User.platformAdmin = true` and usually no membership. They get a
  `platform` principal that is denied restaurant data endpoints. Their actions are audited with
  `actorType = PLATFORM`.
- Customer access uses a separate opaque token (`tt_customer`), stored hashed in `CustomerSession`
  and scoped to one table session. The guard re-checks expiry, revocation and the live table
  session on every call.

Cross-tenant, cross-branch, viewer-write, platform-without-membership and CSRF rejections are
asserted by the integration smoke suite.

## 3. Money

- All money columns are `NUMERIC(12,2)`; Prisma exposes `Prisma.Decimal` (decimal.js).
- `apps/api/src/common/money.ts` centralises rounding (half-up, 2dp).
- `apps/api/src/modules/orders/pricing.ts` is the single pricing engine used by orders, bills and
  tests. It is pure and unit-tested, including a 1,000-case consistency sweep.
- The client never sends prices. The server loads authoritative menu rows, validates variants and
  modifiers, then prices the order.
- Bills aggregate the **snapshotted totals of linked orders**, so a bill can never disagree with
  what the guest was shown, and menu edits cannot rewrite history.

See `docs/architecture/financial-rules.md`.

## 4. Ordering and kitchen

- `POST /public/customer-session/orders` runs one transaction:
  validate session → validate items/variants/modifiers/availability → price → create order, items,
  modifier snapshots → create one kitchen ticket per station → append outbox events → commit.
- Idempotency: `Order.(tenantId, idempotencyKey)` is unique. A retry returns the existing order.
- Tickets group items by the menu item’s station for that branch (falling back to HOT_KITCHEN).
- Kitchen actions are per ticket and per item. The order status is **derived** from item states by
  `recomputeOrderStatus`, never set arbitrarily by a client.
- Inventory deduction happens when the kitchen first accepts anything for the order. It is one
  transaction with conditional `UPDATE … WHERE currentStock >= required`, so concurrent accepts
  cannot oversell. Movements are keyed per order item and ingredient, which makes retries
  idempotent and lets a rejected ticket reverse only its own ingredients.
- Cancelling an order reverses all its remaining deductions and refuses if the order is already on a
  bill.

## 5. Billing and payments

- A bill is created from every unbilled, non-cancelled order in a live session. Items are copied
  into `BillItem`; totals are sums of order totals.
- Splits are calculated in integer satang (`splitEqually`) so shares always add up.
- Payment confirmation locks the payment row (`SELECT … FOR UPDATE`), checks the state machine,
  updates the bill with a conditional `paidTotal + amount <= total`, and writes an audit row.
  Duplicate confirmation returns `409 PAYMENT_ALREADY_CONFIRMED`.
- PromptPay payloads are generated with the shared EMVCo builder, which is CRC-verified and
  round-tripped in tests. A QR only moves the payment to `AWAITING_CONFIRMATION`.
- Refunds are recorded, capped at `amountPaid - refunded`, and explicitly do **not** move money.

## 6. Realtime

- `RealtimeGateway` authenticates Socket.IO connections from the `tt_at` or `tt_customer` cookie.
  Room membership is computed on the server from the membership record; clients cannot request
  rooms.
- `OutboxEvent` is written in the same transaction as the business change. A dispatcher claims
  batches with `FOR UPDATE SKIP LOCKED`, emits them, and marks them published. Sequence numbers are
  allocated per tenant under an advisory lock.
- Clients dedupe on `eventId` and can call `GET /realtime/events?since=<sequence>` to recover
  anything missed while disconnected.
- Realtime is an accelerator. Every screen also polls or refetches, and all state is readable from
  REST.

## 7. Inventory

- Ingredients are branch-scoped. Recipes are menu-item scoped with immutable versions; the current
  version is referenced by `Recipe.currentVersionId`.
- Deduction converts recipe units to the ingredient unit (`g↔kg`, `ml↔l`); incompatible units are
  rejected rather than guessed.
- An order only consumes ingredients belonging to its own branch, so branches with separate stock
  never draw from each other.

## 8. Analytics

- No fabricated metrics and no materialised aggregates in this build. Every number is a SQL
  aggregate over `Bill`, `Payment`, `Order`, `BillItem`, `KitchenTicket` and `TableRequest`.
- Day/hour buckets use `AT TIME ZONE 'Asia/Bangkok'`.
- Metric definitions live in `docs/architecture/metrics.md` and in the analytics service comments.

## 9. Security controls

- Argon2id (19 MiB, t=2), password policy, per-account lockout after 10 failures.
- HttpOnly + SameSite=Lax cookies; double-submit CSRF token required for cookie-authenticated
  mutations; bearer-token clients are exempt (browsers do not attach them automatically).
- Helmet, explicit CORS allow-list, validation whitelist with `forbidNonWhitelisted`, request IDs,
  structured error bodies that do not leak internals.
- QR tokens: 24 random bytes, SHA-256 hash for lookup, AES-256-GCM ciphertext so staff can
  re-download a label without invalidating it.
- Invitation and password-reset tokens: random, hashed, single-use, expiring.
- Audit log records actor, action, resource, before/after (safe fields only), reason and request id.

## 10. Deferred / not built

- BullMQ worker app and Redis-backed Socket.IO adapter (single-instance realtime today).
- Object storage adapter (menu images are URLs).
- Promotion management endpoints/UI; loyalty; shifts; notification inbox; report exports; AI.
- PostgreSQL RLS. Isolation is enforced in application code and tested; RLS is not enabled and must
  not be claimed.
