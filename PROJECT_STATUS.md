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
| API integration smoke            | `pnpm --filter @tabletap/api test:integration`  | **All checks passed** (65+ incl. readiness, metrics, webhook) |
| Web integration smoke            | `node apps/web/scripts/web-smoke.mjs`           | **All checks passed** (24)                                    |
| Lint                             | `pnpm lint`                                     | Pass (ESLint 9 flat config, 4 packages)                       |
| Production UI                    | `next build` + `next start`, Playwright         | **17 screenshots**, no console errors, CSS 200                |
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
  `posX/posY/width/height` with zone labels and a list toggle, and a two-column guest ordering
  surface (menu + sticky table rail, sheets for the order and for dish options) with underlined
  category tabs and per-dish quantities visible in the list, and a receipt-style marketing page.
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
- **Payments** — cash/card recording, PromptPay payload + QR, idempotent creation via
  `Idempotency-Key`, confirmation with locking, duplicate and overpayment rejection, expiry, refunds
  recorded with audit, split-aware settlement (a payment can settle one share).
- **Provider webhook** — HMAC-SHA256 over the raw body, idempotent event ingest, automatic
  settlement of the matching payment when a provider reports `PAID`.
- **Realtime at scale** — Socket.IO Redis adapter when `REDIS_URL` is set; the outbox dispatcher
  already claims each event once.
- **Observability & operations** — `/health`, `/health/ready`, Prometheus `/metrics`, JSON request
  logs with request ids, `pnpm backup` / `pnpm restore`, and the ESC/POS print agent for 80 mm
  kitchen tickets and receipts.
- **Promotions** — management API and `/app/promotions` (percentage, fixed and coupon values, date
  window, minimum spend, discount cap, redemption limit, per-branch or tenant-wide), applied by the
  pricing engine and redeemable by guests from the cart.
- **Operations** — day-close settlement per Bangkok business day (gross, refunds, net, cash
  collected, payment mix, open bills), CSV export of orders and bills, offset pagination and date
  filters on both lists.
- **Guest requests** — open/resolved history with live socket refresh, claim and resolve.
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

| Feature           | What exists                                                                 | What is missing                                          |
| ----------------- | --------------------------------------------------------------------------- | -------------------------------------------------------- |
| Menu availability | Manual sold-out per branch                                                  | Scheduled/time-window availability                       |
| Notifications     | Table + seeded rows                                                         | Inbox UI, delivery channels, worker                      |
| Staff             | Membership roles, branch scopes, invitations                                | Station-level assignment, shift scheduling API/UI        |
| Receipts          | Snapshot with A4 check and 80 mm thermal layouts, issued once per paid bill | PDF delivery or e-mail receipt                           |
| Refunds           | Recorded with audit and caps                                                | Actual money movement / PSP call                         |
| Provider payments | Signed webhook settles the matching payment                                 | A provider contract, field mapping and production secret |

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

See [KNOWN_ISSUES.md](./KNOWN_ISSUES.md). What remains material:

1. Refunds and provider settlements record money but do not move it; a PSP contract is still needed.
2. Notifications have a table but no inbox or delivery worker.
3. Menu images are URLs; there is no upload/storage adapter.

## Exact next task

Connect a payment provider contract to the existing signed webhook (map their event fields, set
`PAYMENT_WEBHOOK_SECRET`), then add the BullMQ worker on Redis for email, receipt delivery and
scheduled jobs.
