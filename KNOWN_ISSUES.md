# Known issues

Ordered by impact. Each entry states the behaviour, why it exists, and the intended fix.

## 1. Split rows are not marked paid

**Status: fixed 2026-11-26.** `Payment` now carries a nullable `splitId`. A payment taken against a
share marks that `BillSplit` `PAID` inside the confirmation transaction; a full refund of that
payment reopens it. The POS shows each share with a “Take payment” action.

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

**Status: fixed 2026-11-26.** When `REDIS_URL` is set the Socket.IO gateway attaches
`@socket.io/redis-adapter`, so an event published by one API instance reaches sockets on all of
them. Without Redis it falls back to the in-memory adapter (single instance).

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

**Status: fixed 2026-11-26.** ESLint 9 and `typescript-eslint` are installed with a flat config at
the repository root (re-exported by each package). `pnpm lint` passes for all four packages.

## 12. Orders and bills lists are capped at 100 rows

**Status: fixed 2026-11-26.** `GET /orders` and `GET /bills` accept `offset` plus `from`/`to` date
filters; the web lists page 50 rows at a time with newer/older links, and `GET /orders/export` /
`GET /bills/export` stream CSV through `/app/exports/*` for reconciliation.

## 13. Payment provider integration is provider-agnostic

**Status: ready to connect.** `POST /api/v1/public/payments/provider/:provider/webhook` verifies an
HMAC-SHA256 signature over the raw body, stores every event idempotently, and confirms the payment
when the provider reports `PAID`. What remains is commercial, not technical: a contract with a
provider, their event field names mapped to the DTO, and their secret in `PAYMENT_WEBHOOK_SECRET`.
Receipts are not generated automatically on a provider confirmation; staff open them on first print.
