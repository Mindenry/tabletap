# Project status

_Last verified: 2026-11-26_

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
| Production UI                    | `next build` + `next start`, Playwright         | **12 screenshots**, no console errors, CSS 200                |
| Realtime events                  | `pnpm --filter @tabletap/web test:realtime`     | **All checks passed** (2 sockets, staff + guest rooms)        |
| LAN browser                      | Playwright against `192.168.1.107:3100`         | Socket **Live**, 0 console errors, QR links use LAN           |

The load tests in `tests/load/` are provided but **were not executed**; no performance numbers are
claimed.

## UI / UX

The redesign replaced the previous “warm SaaS” look with a **service ledger** system drawn from the
artefacts of restaurant service: the printed check, the ticket on the pass, the reservation book,
the brass rail.

- **Tokens** — porcelain paper `#f3ede2`, ink `#16130e`, oxblood `#7a3030`, brass `#9a7733`, sage
  `#56674e`, near-black `#12100b` staff chrome. Radius scale 3–18px. One surface declaration per
  element: hairline border _or_ shadow, never both.
- **Type** — self-hosted Fraunces (display) and IBM Plex Sans Thai (Latin + Thai subsets); no
  build-time font fetch. Money uses tabular Plex figures, so the `฿` glyph is correct.
- **Structure** — fixed staff sidebar, live service rail (tenant · branch · section · Bangkok clock),
  a horizontal metric band in place of KPI cards, a positioned floor plan drawn from persisted
  `posX/posY/width/height` with zone labels and a list toggle, a typographic guest menu with
  underlined category tabs, and a receipt-style marketing page.
- **Motion** — scroll reveals, count-up metrics, page transitions, dialog/sheet entrances; all
  disabled under `prefers-reduced-motion`.
- **Screens** — landing, sign-in, dashboard, floor, guest requests, orders + detail, kitchen +
  full-screen, POS, bills + detail, menu, inventory, staff, analytics, audit, settings, platform,
  guest menu.
- **Responsive** — verified at 390px and 1440px; screenshots captured from the production build.
- **Accessibility** — labelled inputs, focus rings, aria-current and aria-pressed controls,
  keyboard-operable dialogs, contrast-checked palette, reduced-motion support.

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
- **Kitchen** - tickets by station, accept/start/ready/reject, per-item ready/served, live board,
  elapsed timers, optional sound, full-screen display.
- **Realtime** - authenticated Socket.IO rooms with server-computed membership, transactional outbox
  with per-tenant sequence, REST resync. Verified with two live sockets: staff/kitchen receive
  `order.created` and `kitchen.ticket.created`; the guest room receives `order.created` and
  `order.accepted`.
- **LAN** - both apps bind to all interfaces, the browser socket follows the page hostname, QR links
  use `WEB_URL`, CORS and Windows firewall are configured. Verified in a browser at
  `http://192.168.1.107:3100` with the socket reporting Live and zero console errors.
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
| Realtime          | Socket.IO gateway, room authorization, outbox, resync endpoint, guest-room routing verified       | Redis adapter for multiple API instances                |
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
