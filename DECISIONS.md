# Decision log

Format: decision → context → consequence. Newest first.

## D-014 — Page-level authorization in the web app

**Context:** hiding a nav link is not authorization; a cashier could open `/app/settings` and see
read-only configuration.
**Decision:** every protected page checks `hasPermission` server-side and renders a denial screen.
The API remains the real enforcement point.
**Consequence:** defence in depth; a missed nav rule cannot expose a screen.

## D-013 — Bills aggregate order snapshots

**Context:** recomputing tax/service from bill items risks disagreeing with the total the guest saw,
and double-taxation when orders already include VAT.
**Decision:** bill totals are sums of the linked orders’ snapshotted totals; bill items copy line
snapshots for display and receipts.
**Consequence:** a bill can never contradict the order; menu edits cannot rewrite history.

## D-012 — Stock deduction on kitchen acceptance, per order item

**Context:** deducting at order creation would reserve stock for orders the kitchen may reject;
deducting per order makes partial rejection impossible to reverse.
**Decision:** deduct when the kitchen first accepts anything for the order, writing movements keyed
by `(order, orderItem, ingredient)`.
**Consequence:** idempotent retries, partial reversal on ticket rejection, full reversal on cancel.

## D-011 — Outbox instead of direct socket emits inside transactions

**Context:** emitting during a transaction can publish an event for a write that later rolls back,
and a committed write can lose its event if the process dies.
**Decision:** append `OutboxEvent` in the same transaction; a dispatcher publishes with a per-tenant
sequence.
**Consequence:** at-least-once delivery, gap detection, REST resync. Extra latency under 1s.

## D-010 — Opaque customer session tokens, not JWTs

**Context:** a customer session must be revocable instantly when staff close a table.
**Decision:** random token in an HttpOnly cookie, SHA-256 hash stored in `CustomerSession`; the guard
looks it up and re-checks the table session on every call.
**Consequence:** no stateless validation, but immediate revocation and no signing-key coupling.

## D-009 — Access tokens carry identity, not permissions

**Context:** embedding permissions in a JWT means role changes are not immediate.
**Decision:** the JWT carries `sub`, `sid`, `tid`; the guard loads the membership, role and
permissions from PostgreSQL per request.
**Consequence:** one extra indexed query per request, immediate revocation and role changes.

## D-008 — Server-side pricing with no price fields in client payloads

**Context:** trusting client prices is the classic restaurant/POS exploit.
**Decision:** order payloads contain only item ids, variant ids, option ids, quantities and notes;
unknown fields are rejected by the validation whitelist.
**Consequence:** price tampering is structurally impossible; the API revalidates availability too.

## D-007 — Prisma.Decimal end to end

**Context:** floating point breaks VAT and split arithmetic.
**Decision:** `NUMERIC(12,2)` in PostgreSQL, `Prisma.Decimal` in TypeScript, one rounding helper,
integer satang for equal splits.
**Consequence:** consistent totals; serialized as strings over HTTP.

## D-006 — Application-level tenant isolation, not RLS (for now)

**Context:** RLS with connection pooling and Prisma interactive transactions needs careful session
variable handling and would be easy to claim without proving.
**Decision:** every tenant-scoped query goes through services that filter by the authenticated
membership; branch access is centralised; isolation is covered by integration tests.
**Consequence:** no false RLS claim. RLS remains a future hardening step.

## D-005 — Deterministic demo QR tokens

**Context:** printed demo links and the smoke suites need stable tokens.
**Decision:** the seed uses `demo-<branch>-t<number>-4f8c2a91` and documents it as development-only;
production tokens are 24 random bytes.
**Consequence:** reproducible demos; a documented, deliberate exception.

## D-004 — Split totals in integer satang

**Context:** dividing `100.00` by 3 with decimals produces drift.
**Decision:** `splitEqually` converts to satang, distributes the remainder one satang at a time.
**Consequence:** shares always sum exactly to the bill total.

## D-003 — In-process outbox dispatcher, no worker app yet

**Context:** a separate worker adds deployment complexity before there are heavy jobs.
**Decision:** the dispatcher runs in the API process with `SKIP LOCKED`, safe for multiple
dispatchers; heavy jobs are deferred.
**Consequence:** simpler local setup; horizontal realtime scaling still needs the Redis adapter.

## D-002 — Single API image, modules by domain

**Context:** the spec suggested many top-level folders; NestJS modules map more directly to domain
boundaries.
**Decision:** `src/modules/<domain>` with controller + service + DTOs; shared primitives in
`src/common`; cross-domain calls through exported services.
**Consequence:** clear boundaries without over-abstracting.

## D-001 — Next.js rewrites instead of cross-origin API calls

**Context:** cookies across ports are same-site on localhost but cross-origin in production.
**Decision:** the browser always calls same-origin `/api/*`, rewritten to the API; server components
call the API internally and forward cookies.
**Consequence:** no CORS in the browser path, CSRF cookies behave normally, and production can put
both behind one origin.
