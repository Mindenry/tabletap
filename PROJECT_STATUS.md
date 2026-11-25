# Project status

_Last verified: 2026-11-25_

This file distinguishes what was built and executed from what remains. Nothing here is marked
complete because a route exists.

## Verification performed in this environment

| Check                            | Command                                         | Result                                                        |
| -------------------------------- | ----------------------------------------------- | ------------------------------------------------------------- |
| API typecheck                    | `pnpm --filter @tabletap/api exec tsc --noEmit` | Pass                                                          |
| Web typecheck + production build | `pnpm --filter @tabletap/web build`             | Pass                                                          |
| Unit tests                       | `pnpm --filter @tabletap/api test`              | **30 passed**                                                 |
| Database migration               | `prisma migrate reset --force --skip-seed`      | Pass                                                          |
| Demo seed                        | `pnpm db:seed`                                  | Pass — 2 tenants, 4 branches, 60 tables, 34 items, 607 orders |
| API integration smoke            | `pnpm --filter @tabletap/api test:integration`  | **All checks passed** (50+)                                   |
| Web integration smoke            | `node apps/web/scripts/web-smoke.mjs`           | **All checks passed** (24)                                    |

The load tests in `tests/load/` are provided but **were not executed**; no performance numbers are
claimed.

## Implemented and exercised end to end

- **Auth** — login, logout, refresh rotation, reuse detection, session listing/revocation, change
  password, forgot/reset password, invitation acceptance, restaurant self-registration, tenant
  switch, account lockout, rate limiting.
- **Authorization** — permission matrix, branch scoping, tenant isolation, platform separation,
  page-level denial in the web app, CSRF.
- **Tenancy** — tenant profile, branch creation/update/archival guards, staff list/invite/update/
  deactivate, entitlement summary and plan limits.
- **Menu** — categories, items, variants, modifier groups/options, per-branch availability, price
  history, station routing, public menu projection.
- **Floor** — zones, tables, positions, archive, QR generate/rotate/revoke/download, session
  open/close/move/merge, cleaning, guest request list/acknowledge/resolve.
- **Guest** — QR landing, session issue, cart, server-priced order with idempotency, tracking,
  cancel-before-accept, waiter/water/utensils/bill requests with duplicate suppression.
- **Orders** — creation, state machine, per-item states, append-only events, cancellation with stock
  reversal, staff POS orders.
- **Kitchen** — tickets by station, accept/start/ready/reject, per-item ready/served, live board,
  elapsed timers, optional sound, full-screen display.
- **Billing** — bill snapshot, equal/amount/item splits, cancellation, receipt snapshot.
- **Payments** — cash/card recording, PromptPay payload + QR, confirmation with locking, duplicate
  and overpayment rejection, expiry, refunds recorded with audit.
- **Inventory** — ingredients, receive/adjust/waste/count, movements, low stock, versioned recipes
  with plate cost, atomic idempotent deduction and reversal.
- **Analytics** — overview, sales series, payment mix, menu performance with margin, kitchen
  timings, guest request resolution.
- **Platform** — dashboard, tenant list, suspend/activate with session revocation, plans,
  subscription update, usage, system health, platform audit.
- **Audit** — searchable, paginated log with actor, action, resource, reason and request id.
- **PWA** — manifest, icon, offline fallback page, service worker (shell only), offline banner.
- **Demo data** — internally consistent: bills reference orders, payments reference bills, items
  reference menu rows, analytics derive from them.

## Partially implemented

| Feature           | What exists                                                                                       | What is missing                                         |
| ----------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Promotions        | Model, seed data, server-side validation, discount allocation, redemption counter with atomic cap | Management API and UI                                   |
| Split bills       | Equal / amount / item splits stored and displayed                                                 | Splits are not individually settled or auto-marked paid |
| Realtime          | Socket.IO gateway, room authorization, outbox, resync endpoint                                    | Redis adapter for multiple API instances                |
| Menu availability | Manual sold-out per branch                                                                        | Scheduled/time-window availability                      |
| Notifications     | Table + seeded rows                                                                               | Inbox UI, delivery channels, worker                     |
| Staff             | Membership roles, branch scopes, invitations                                                      | Station-level assignment, shift scheduling API/UI       |
| Receipts          | Snapshot, printable HTML from browser                                                             | PDF generation service                                  |
| Refunds           | Recorded with audit and caps                                                                      | Actual money movement / PSP call                        |

## Not implemented

- Loyalty programme API/UI (schema only).
- Shifts and attendance API/UI (schema and seed only).
- Background worker app, BullMQ queues, scheduled jobs (outbox runs in-process).
- File uploads and object storage (menu images are URLs).
- Report exports (CSV/XLSX/PDF) and export jobs.
- AI business assistant.
- Email verification.
- Verified payment-provider integration and webhook reconciliation.
- PostgreSQL Row-Level Security (isolation is application-level and tested).
- Offline order queuing (intentionally refused; the app shows an offline state).

## Known bugs / limitations

See [KNOWN_ISSUES.md](./KNOWN_ISSUES.md). The most material:

1. Split rows remain `OPEN` after the bill is paid.
2. Payment creation is not idempotent; a double tap can create two PENDING payments (overpayment is
   still prevented at confirmation).
3. “Today” on the dashboard uses the API host’s local midnight; analytics buckets use Bangkok time.
4. The kitchen board is single-instance without the Redis adapter.

## Exact next task

Implement promotion management (API + `/app/promotions`) on top of the existing validation and
redemption engine, then add the BullMQ worker with Redis adapter so realtime and scheduled jobs
survive horizontal scaling.
