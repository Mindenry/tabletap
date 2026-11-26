# Known issues

Ordered by impact. Each entry states the behaviour, why it exists, and the intended fix.

## 1. Split rows are not marked paid

**Symptom:** after splitting a bill and settling it, `BillSplit.status` stays `OPEN`.
**Cause:** payments settle the bill, not individual allocations; `Payment` has no split reference.
**Impact:** the POS shows shares as informational; the bill itself is correctly `PAID`.
**Fix:** add `Payment.splitId` (or a `BillSplitPayment` join) and update the split atomically inside
the confirmation transaction.

## 2. Payment creation is not idempotent

**Status: fixed 2026-11-26.** `POST /payments` accepts an `Idempotency-Key`; the record is written in
the same transaction as the payment, so a duplicate key returns the original payment instead of
creating a second `PENDING` row, and reusing a key with a different body is rejected with
`IDEMPOTENCY_KEY_REUSED`. The POS sends a key per action.

## 3. Dashboard “today” depends on host timezone

**Status: fixed 2026-11-26.** `AnalyticsService.defaultPeriod` and the new day-close report derive
the day boundary from `Asia/Bangkok` (UTC+7), independent of the API host's timezone. Explicit
`from`/`to` ranges are still honoured.

## 4. Single-instance realtime

**Symptom:** with more than one API instance, sockets connected to instance A do not receive events
published by instance B.
**Cause:** the Redis Socket.IO adapter is not wired (dependency present).
**Fix:** attach `@socket.io/redis-adapter` in `RealtimeGateway.afterInit` when `REDIS_URL` is set,
and run the dispatcher in one designated process.

## 5. Outbox writes serialise per tenant

**Symptom:** burst order creation for one tenant serialises on an advisory lock while allocating the
event sequence.
**Why acceptable:** per-tenant throughput is low (a restaurant, not a marketplace).
**Fix if needed:** allocate sequences from a per-tenant Postgres sequence, or batch appends.

## 6. Demo credentials and QR tokens are predictable

**Symptom:** the seed creates deterministic QR tokens and one shared password.
**Scope:** development only. `SEED_DEMO_DATA` is false by default in production guidance, and
`validateEnv` refuses production secrets that match the development defaults.
**Fix:** never run the demo seed against production; rotate QR tokens from the floor screen.

## 7. MinIO image could not be pulled in this environment

**Symptom:** `docker compose --profile storage up` fails here with a registry error.
**Impact:** none for the current build, because no upload feature is implemented; menu images are
URLs.
**Fix:** use any S3-compatible endpoint when the storage adapter is added.

## 8. Kitchen sound requires a user gesture

**Symptom:** the first beep may be blocked until the operator interacts with the page.
**Cause:** browser autoplay policy.
**Fix:** the sound toggle is an explicit gesture; keep it on by default for dedicated displays.

## 9. Receipt is not a fiscal tax invoice

**Symptom:** the receipt includes VAT lines but is not a Thai e-Tax invoice.
**Cause:** fiscal certification, sequence registration and provider integration are out of scope.
**Fix:** integrate a certified e-tax provider before any legal claim.

## 10. Refunds do not move money

**Symptom:** recording a refund updates records but does not transfer funds.
**Cause:** no PSP integration.
**Fix:** provider adapter with signed webhooks and reconciliation; the UI already states this.

## 11. `pnpm lint` cannot run

**Symptom:** `pnpm lint` fails with `'eslint' is not recognized`; every package declares an ESLint
script but the dependency and a config file are absent.
**Impact:** types are checked (`tsc --noEmit`) and builds are gated, but style/lint regressions are
not caught in CI.
**Fix:** add `eslint`, `typescript-eslint` and the Next.js plugin with a flat config at the root,
then make `lint` part of the CI job.

## 12. Orders and bills lists are capped at 100 rows

**Status: fixed 2026-11-26.** `GET /orders` and `GET /bills` accept `offset` plus `from`/`to` date
filters; the web lists page 50 rows at a time with newer/older links, and `GET /orders/export` /
`GET /bills/export` stream CSV through `/app/exports/*` for reconciliation.
