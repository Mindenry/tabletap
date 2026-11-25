# Implementation log

Chronological record of what was actually done, including commands and outcomes.

## 2026-11-25 — Session 1

### Environment inspection

- Empty repository at `E:\Code\tabletap`.
- Node 26.13.0, pnpm 10.34.9, Docker 29.9.3, Compose v5.7.0.
- Ports 3000/4000/5433/6380 were already used by unrelated local projects, so TableTap uses
  3100 (web), 4100 (API), 5440 (Postgres), 6390 (Redis), 1125/8125 (Mailpit).
- `minio/minio` could not be pulled from this host’s registry; MinIO is an optional compose
  profile and no upload feature depends on it.

### Phase 0 — foundation

- Created pnpm workspace + Turborepo, strict TypeScript base, Prettier.
- `docker compose up -d postgres redis mailpit` → healthy.
- Prisma schema (70+ models) and `0001_init` migration generated with `migrate diff` because
  `migrate dev` hung on shadow-database creation in this environment. Hand-added partial unique
  indexes for one live session per table and active QR lookup.
- `pnpm install` (875 packages), Prisma client generated.
- Shared package compiled to CommonJS for Nest + Next consumption.

### Phase 1 — identity

- Argon2id, JWT access cookie + opaque rotating refresh token with family revocation on reuse.
- CSRF double-submit guard, throttler, account lockout, request IDs, uniform error envelope.
- Tenant registration creates tenant, roles, permissions, branch, stations, trial subscription.
- Invitations, password reset, session management.
- Verified with live HTTP: register → me → login → refresh.

### Phase 2–3 — restaurant and ordering

- Catalog with variants, modifier groups, per-branch availability, price history, station routing.
- Floor with zones, tables, encrypted QR tokens, sessions with row locks, move/merge.
- Server pricing engine with discount/service/VAT allocation; 11 unit tests.
- Order creation with idempotency, kitchen ticket creation, outbox events.
- First smoke run found two real bugs:
  1. Menu items were routed to another branch’s station (fixed by selecting the station belonging
     to the order’s branch).
  2. Order numbering collided across branches because the counter was per branch but the printed
     number was not (fixed by adding the branch code to document numbers).

### Phase 4 — kitchen and realtime

- Kitchen tickets, accept/start/ready/reject, per-item ready/served, derived order status.
- Socket.IO gateway with cookie auth and server-computed rooms; outbox dispatcher with
  `SKIP LOCKED` and per-tenant sequences; REST resync endpoint.
- Inventory deduction moved to per-order-item movements so ticket rejection reverses only its own
  stock.

### Phase 5 — billing and payments

- Bills aggregate order snapshots; equal/amount/item splits; cancellation; receipt snapshot.
- Payments with row locks, overpay/duplicate protection, PromptPay EMVCo payload and CRC tests,
  refunds recorded with caps.
- Smoke run verified: order → kitchen → bill → split → PromptPay → confirm → receipt → close.

### Phase 6 — inventory, analytics, platform

- Ingredients, receive/adjust/waste/count, movements, low stock, versioned recipes with cost.
- Analytics as SQL aggregates (overview, series, payment mix, menu margin, kitchen timings).
- Platform dashboard, tenant suspension with session revocation, health, plans, usage.

### Phase 7 — web application

- Design tokens (paper/ink/terracotta/olive), UI primitives, app shell with branch switcher.
- Pages: landing, login, forgot/reset/accept, dashboard, floor, guest requests, orders + detail,
  kitchen + full-screen display, POS, bills + detail, menu, inventory, staff, analytics, audit,
  settings, platform dashboard, guest menu, offline, 404.
- Build caught a client/server boundary bug (`next/headers` imported into a client module); split
  `lib/api.ts` and `lib/api-server.ts`.
- Web smoke caught a real authorization gap: cashiers could open `/app/settings` by URL. Added
  page-level permission checks across all admin routes.

### Phase 8 — verification

- `pnpm --filter @tabletap/api test` → 30/30 pass.
- `pnpm --filter @tabletap/web build` → pass.
- `pnpm --filter @tabletap/api test:integration` → all checks pass (including requests workflow).
- `node apps/web/scripts/web-smoke.mjs` → 24/24 pass.
- Seed produced 607 orders with consistent bills/payments.

### Commands of record

```bash
docker compose up -d postgres redis mailpit
pnpm install
pnpm --filter @tabletap/api db:generate
pnpm --filter @tabletap/api db:deploy
pnpm --filter @tabletap/api db:seed
pnpm --filter @tabletap/api test
pnpm --filter @tabletap/api test:integration
pnpm --filter @tabletap/web build
node apps/web/scripts/web-smoke.mjs
```

### Not done in this session

Worker/BullMQ, Redis socket adapter, uploads, promotion UI, loyalty, shifts, notification inbox,
report exports, AI, PSP integration, k6 execution. See PROJECT_STATUS.md.

## 2026-11-25 — Session 2 (UI completion)

### Root cause of the missing CSS

The user reported an unstyled site. Diagnosis: the dev server returned
`/_next/static/css/app/layout.css` with **404**. Cause: `next build` had been run while `next dev`
was live; both use `apps/web/.next`, so the production build replaced the dev artifacts while the dev
server kept serving HTML that referenced them.
Fix: stop dev, delete `.next`, restart. Documented in README and the local-development guide.

### Typography

- Vendored Fraunces (variable) and IBM Plex Sans Thai (400–700, Latin + Thai subsets) into
  `apps/web/app/fonts` (~183 KB) and switched from `next/font/google` to `next/font/local`, after a
  Google Fonts fetch failed once during a build.
- Latin and Thai subsets are separate local families, composed in the `--font-sans` stack so each
  glyph resolves to the right file.

### Motion and UI system

- Added `Reveal`, `NumberTicker`, `PageTransition`, `SpotlightCard`, `ScrollProgress`.
- Rewrote the landing page with an editorial hero, ambient gradients, product mock, honest demo
  facts, a four-step service loop, spotlight capability grid, financial-integrity panel and a dark
  CTA.
- Rebuilt sign-in as a split experience with click-to-fill demo accounts.
- Refined sidebar active state, user popover, KPI cards, floor plan ordering/labels, kitchen station
  labels, POS unbilled order list, analytics payment bars and chart ticks.
- Guest menu: sticky glass category bar with edge fade, responsive header actions, animated dish
  cards and sheets, mobile layout fixed.

### Functional fixes found by screenshots

- `NumberTicker` received a function prop from a Server Component (RSC serialization error) —
  replaced with serializable `format` props.
- Kitchen “Mark served” called a non-existent route — added `POST /kitchen/tickets/:id/served`.
- Per-item “Ready” could mark items ready before the ticket was accepted — blocked in API and UI.
- Item serve now requires `READY`.
- Floor tables now order by zone display order; QR indicator labelled.
- Seed now creates historical kitchen tickets so operations analytics are meaningful (501 tickets
  measured, station timings).
- Analytics Y-axis no longer shows misleading rounded ticks; day labels are `MM/DD`.
- POS shows the unbilled orders for a selected session and no longer labels them “OPEN”.

### Verification

- `pnpm --filter @tabletap/api test` → 30/30.
- `pnpm --filter @tabletap/web build` → pass; production server returns CSS 200 and self-hosted font
  files 200.
- API smoke → all pass; web smoke → 24/24.
- Playwright captured 11 screenshots with **no console errors** at 1440×900 and 390×844.

### Session 2 addendum — realtime proof and LAN

- Added `apps/web/scripts/realtime-smoke.mjs`: logs in, opens a guest session, connects a staff socket
  and a guest socket, submits an order, and asserts the outbox-published events arrive in the staff,
  kitchen and customer rooms. This exposed a real bug: `order.accepted` had no `customerSessionId`,
  so the guest room never received it. Fixed by carrying the table/customer session ids in every
  order and kitchen event payload.
- Socket URL is now derived from `window.location.hostname` (`lib/socket.ts`), so a phone on the LAN
  does not try to reach its own `localhost:4100`.
- `.env` now points `WEB_URL`, `CORS_ORIGINS` and `NEXT_PUBLIC_API_URL` at `192.168.1.107`; Windows
  firewall rules were added for TCP 3100/4100 on the Private profile.
- Verified over LAN: web 200, API 200, CORS allow-origin correct, QR links point at the LAN URL, QR PNG
  downloadable, realtime smoke passes against `http://192.168.1.107:4100`, and a Playwright browser at
  `http://192.168.1.107:3100` shows the kitchen socket as **Live** with zero console errors.
