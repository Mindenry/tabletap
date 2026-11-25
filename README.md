# TableTap

**Restaurant ordering, kitchen, POS and operations — one connected system.**

TableTap is a multi-tenant restaurant platform built for Thai restaurants: QR ordering at the
table, a station-routed kitchen display, a cashier POS with PromptPay, bill snapshots, inventory
that deducts from recipes, and analytics computed from real transactions.

It is a working product, not a UI prototype. Every screen calls a real API; every number is a SQL
aggregate over persisted rows. The demo dataset is generated from actual orders, bills and
payments.

```
Guest scans QR ──► Menu & cart ──► Order (server priced, idempotent)
                                        │
                                        ▼
                              Kitchen tickets by station
                                        │
                    accept → start → item ready → served
                                        │
                                        ▼
                       Bill snapshot ──► Payment (cash / PromptPay)
                                        │
                                        ▼
                    Receipt · inventory movements · analytics · audit log
```

---

## Screenshots

| Staff overview                               | Floor plan                                     |
| -------------------------------------------- | ---------------------------------------------- |
| ![Dashboard](docs/screenshots/dashboard.png) | ![Floor plan](docs/screenshots/floor-plan.png) |

| Kitchen display                          | POS                              |
| ---------------------------------------- | -------------------------------- |
| ![Kitchen](docs/screenshots/kitchen.png) | ![POS](docs/screenshots/pos.png) |

| Analytics                                    | Guest menu (mobile)                                   |
| -------------------------------------------- | ----------------------------------------------------- |
| ![Analytics](docs/screenshots/analytics.png) | ![Guest menu](docs/screenshots/guest-menu-mobile.png) |

| Landing                                  | Sign in                                |
| ---------------------------------------- | -------------------------------------- |
| ![Landing](docs/screenshots/landing.png) | ![Sign in](docs/screenshots/login.png) |

Screenshots are captured from the production build with Playwright
(`pnpm screenshots`) against the seeded demo, not mocked up.

---

## Design system

- **Type** — Fraunces (display) and IBM Plex Sans Thai (UI, Latin + Thai subsets), both
  **self-hosted** in `apps/web/app/fonts` so builds never depend on a network fetch.
- **Palette** — warm paper `#f7f3ec`, ink `#17150f`, terracotta `#b4512c`, olive, gold. No purple,
  no gradient text, no glow.
- **Motion** — scroll reveals via IntersectionObserver, count-up KPIs, page fade transitions,
  pointer-following card highlights, hover lifts, bottom-sheet and dialog entrances. All motion is
  disabled under `prefers-reduced-motion`.
- **Components** — buttons, inputs, dialogs, tabs, tables, badges, stat cards, empty/skeleton/error
  states, toast notifications, command-free navigation with permission-aware items.

---

## What is implemented

| Area                                      | Status              | Notes                                                                                                        |
| ----------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------ |
| Multi-tenant identity, roles, permissions | **Implemented**     | Permission checks on every request, branch scoping, tenant isolation tested                                  |
| Authentication & sessions                 | **Implemented**     | Argon2id, HttpOnly cookies, refresh rotation with reuse detection, CSRF, lockout, rate limiting              |
| Branches, staff, invitations              | **Implemented**     | Invitation tokens hashed, 7-day expiry, role/branch assignment, immediate revocation                         |
| Tables, zones, floor plan                 | **Implemented**     | Positions persisted, QR tokens encrypted + hashed, rotate/revoke, PNG/SVG labels                             |
| Menu, variants, modifier groups           | **Implemented**     | Per-branch availability, price history, station routing                                                      |
| Guest QR ordering                         | **Implemented**     | Table-scoped session cookie, server-side pricing, idempotent submission, availability re-checked             |
| Kitchen display                           | **Implemented**     | Station tickets, per-item states, reject with reason, live updates + polling fallback                        |
| Billing & split bills                     | **Implemented**     | Snapshotted bills, split equally / by amount / by item, receipts                                             |
| Payments                                  | **Implemented**     | Cash/card recording, PromptPay EMVCo QR, locked confirmation, overpay/duplicate protection, refunds recorded |
| Inventory & recipes                       | **Implemented**     | Atomic once-only deduction on kitchen accept, partial reversal on rejection, full reversal on cancel         |
| Analytics                                 | **Implemented**     | Gross/net sales, payment mix, menu margin, kitchen timings, all from source tables                           |
| Audit log                                 | **Implemented**     | Security and money actions, request IDs, before/after where safe                                             |
| Platform administration                   | **Implemented**     | Tenant lifecycle, suspension revokes sessions, plans, usage, health                                          |
| PWA                                       | **Partial**         | Manifest, icons, offline page, connection banner. No offline ordering (by design)                            |
| Promotions                                | **Partial**         | Server-side validation + redemption at order time; no management UI/API                                      |
| Loyalty, shifts, notifications            | **Schema only**     | Tables and seed rows exist; no endpoints or screens                                                          |
| Background worker / BullMQ                | **Not implemented** | Outbox dispatcher runs in-process; Redis is health-checked only                                              |
| File uploads                              | **Not implemented** | Menu images are URL fields; no storage adapter yet                                                           |
| AI assistant, report exports              | **Not implemented** | Deliberately deferred; see roadmap                                                                           |

Full detail: [PROJECT_STATUS.md](./PROJECT_STATUS.md) · [KNOWN_ISSUES.md](./KNOWN_ISSUES.md).

---

## Technology

- **Frontend** — Next.js 15 (App Router), React 19, TypeScript strict, Tailwind CSS v4, Radix UI
  primitives, TanStack Query available, Recharts, Socket.IO client, Zod.
- **Backend** — NestJS 11, Prisma 6, PostgreSQL 16, Socket.IO, Argon2id, class-validator,
  Swagger/OpenAPI, Pino-style structured request logs.
- **Infrastructure** — pnpm workspaces + Turborepo, Docker Compose (Postgres, Redis, Mailpit,
  optional MinIO), GitHub Actions.
- **Testing** — Vitest unit suite, HTTP integration smoke suites for the API and the web app.

---

## Repository layout

```
apps/
  api/          NestJS API + Prisma schema, migration, seed
    src/modules auth, tenancy, catalog, floor, orders, kitchen,
                billing, inventory, analytics, platform, realtime, audit
  web/          Next.js app (staff app, kitchen display, POS, guest menu)
packages/
  shared/       money, permissions, state machines, PromptPay, realtime contract
docs/           architecture, database, api, workflows, security, deployment, operations
tests/load/     k6 scripts (provided, not executed here)
```

---

## Quick start

**Requirements:** Node 20+, pnpm 9+, Docker.

```bash
cp .env.example .env          # then adjust if needed
pnpm install
docker compose up -d postgres redis mailpit
pnpm db:migrate               # applies prisma/migrations
pnpm db:seed                  # two restaurants + 30 days of trading history
pnpm dev                      # API :4100, web :3100
```

Open:

- Staff app — <http://localhost:3100/login>
- Guest menu — <http://localhost:3100/menu/demo-sathorn-t03-4f8c2a91>
- API docs — <http://localhost:4100/api/docs>
- Mailpit — <http://localhost:8125>

> The demo seed uses deterministic QR tokens and one shared demo password. Both are development
> only and must never be used in production.

### Demo accounts

Password for every account: `TableTap!2026`

| Email                       | Role                  | Scope                                   |
| --------------------------- | --------------------- | --------------------------------------- |
| `owner@spicegarden.local`   | Owner                 | All three branches, full access         |
| `manager@spicegarden.local` | Manager               | Sathorn + Ari only                      |
| `cashier@spicegarden.local` | Cashier               | Bills, payments, refunds                |
| `kitchen@spicegarden.local` | Kitchen               | Kitchen board only                      |
| `waiter@spicegarden.local`  | Waiter                | Floor, serving, requests                |
| `viewer@spicegarden.local`  | Viewer                | Read-only                               |
| `owner@baanthai.local`      | Owner (second tenant) | Proves isolation                        |
| `platform@tabletap.local`   | Platform admin        | No restaurant data without a membership |

### Try the full flow

1. Sign in as **owner**, open **Floor**, pick a free table, open a session (or scan its QR).
2. Open the guest menu on a phone (or the seeded link), add dishes with modifiers, submit.
3. Open **Kitchen** (or `/kitchen/display` on a tablet) — accept, start, mark ready.
4. In the guest tab, watch the progress; call a waiter or request the bill.
5. Staff see the request in **Guest requests**; acknowledge and resolve it.
6. In **POS**, create the bill, split it, take a PromptPay payment, confirm it, print the receipt,
   close the table.
7. **Overview** and **Analytics** now include that bill.

---

## Verification

Commands below were executed against this repository and the seeded database.

```bash
pnpm --filter @tabletap/api test        # 30 unit tests
pnpm --filter @tabletap/api typecheck
pnpm --filter @tabletap/web build
pnpm --filter @tabletap/api test:integration   # requires API + seed (50+ checks)
pnpm --filter @tabletap/web test:integration   # requires web + seed (24 checks)
pnpm screenshots                               # captures docs/screenshots/*
```

> **Do not run `next build` while `next dev` is running.** Both use `apps/web/.next`; the build
> replaces dev artifacts and the dev server then serves stale HTML whose CSS 404s. Stop dev first,
> or use `pnpm build` then `pnpm --filter @tabletap/web start`.

The integration suites assert behaviour, not just status codes: idempotent duplicate orders,
cross-tenant rejection, CSRF rejection, duplicate payment confirmation, stock deduction, PromptPay
payload CRC, split totals, permission denials.

---

## Architecture at a glance

```
Browser ──► Next.js (server components) ──┐
   │                                      ├──► REST /api/v1 ──► NestJS ──► PostgreSQL
   └────────► Socket.IO /realtime ────────┘                      │            (source of truth)
                                                                 ├──► Outbox dispatcher
                                                                 └──► Audit log
```

- **PostgreSQL is authoritative.** Realtime events are notifications, never state.
- **Transactional outbox:** business writes and their events commit together; a dispatcher publishes
  them with a per-tenant sequence so clients can detect gaps and resync over REST.
- **Money is `NUMERIC(12,2)` / `Prisma.Decimal`.** No floating point in any authoritative path.
- **Pricing is server-side.** Client payloads carry item ids and quantities, never prices.
- **Every tenant-scoped query is filtered by the authenticated membership.** Client-supplied tenant
  or branch ids are validated, never trusted.

Deeper: [ARCHITECTURE.md](./ARCHITECTURE.md) · [DECISIONS.md](./DECISIONS.md).

---

## Financial rules (summary)

1. `lineSubtotal = round2((unitPrice + modifiersPerUnit) × quantity)`.
2. Order discounts are allocated across lines proportionally; the remainder goes to the last line so
   allocations sum exactly.
3. Service charge is a percentage of net subtotal or a fixed amount capped at net subtotal.
4. VAT-inclusive: `total = net + service`, tax extracted as `base × rate / (100 + rate)`.
   VAT-exclusive: `tax = base × rate / 100`, added to the total.
5. Tax is computed once on the taxable base and allocated to lines, so
   `sum(line tax) = tax on the bill total`.
6. A bill's totals are the sum of its linked orders' snapshotted totals — a later menu edit cannot
   rewrite history.

Full detail: [docs/architecture/financial-rules.md](./docs/architecture/financial-rules.md).

---

## Payment limitations (important)

- PromptPay QR generation is a **real EMVCo payload** validated with CRC-16/CCITT and known check
  values. It requests money; it does **not** prove money arrived.
- Without a verified PSP integration, a payment stays `AWAITING_CONFIRMATION` until an authorised
  cashier confirms it. Confirmation records the staff member, timestamp and amount.
- Recording a refund **does not move money**. Staff must complete the transfer with their bank/PSP.
- Receipts are sales receipts, not Thai e-Tax invoices. Fiscal certification is out of scope.

---

## API

REST under `/api/v1`, documented with Swagger at `/api/docs`. Highlights:

```
POST /auth/login | /auth/refresh | /auth/logout | /auth/register
GET  /auth/me | /auth/sessions
GET  /public/qr/:token            POST /public/qr/:token/session
POST /public/customer-session/orders | /requests
GET  /branches/:branchId/tables   POST /tables/:id/open-session | close-session | move | merge
POST /tables/:id/qr | /qr/rotate  GET /tables/:id/qr/download?format=png|svg
GET  /menu/items                  POST /menu/items | /menu/items/:id/availability
GET  /orders                      POST /orders/:id/accept | preparing | ready | served | cancel
GET  /kitchen/tickets             POST /kitchen/tickets/:id/accept | start | ready | reject
POST /bills                       POST /bills/:id/split
POST /payments                    POST /payments/:id/promptpay | confirm | refund
GET  /inventory/ingredients       POST /inventory/receive | adjust | waste | count
GET  /analytics/overview | /sales | /menu-performance | /operations
GET  /platform/dashboard | /tenants | /system-health
```

See [docs/api/endpoints.md](./docs/api/endpoints.md).

---

## Roadmap

1. Promotion management UI + API (engine already applies codes).
2. BullMQ worker for email, payment expiry, exports and alerting; Redis Socket.IO adapter.
3. File storage adapter (S3/MinIO) with signed URLs and image processing.
4. Notifications inbox and delivery channels (email/Telegram/Discord).
5. Shift scheduling, clock-in/out and staff attribution reporting.
6. Report exports (CSV/XLSX/PDF) via background jobs with authorised download URLs.
7. Loyalty programme with consented customer identity.
8. Optional AI summaries over tenant-scoped metrics.
9. Verified PSP integration with webhook signature checks and reconciliation.

---

## License / use

Portfolio and evaluation project. No license is granted for commercial deployment. The demo
credentials and deterministic QR tokens are intentionally public and must be replaced before any
real use.
