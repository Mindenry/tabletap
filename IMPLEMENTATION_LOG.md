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

## 2026-11-26 — Session 3 (redesign)

### Direction

The brief was a full visual replacement, not a restyle. The previous system was a “warm SaaS”
palette (cream + terracotta) with soft cards, KPI tiles, glass category bars and gradient dish
placeholders. It was replaced with a **service ledger**: the artefacts a restaurant already trusts
— the printed check, the ticket on the pass, the reservation book, the brass rail — rebuilt as a
screen system.

- Porcelain paper `#f3ede2`, ink `#16130e`, oxblood `#7a3030`, brass `#9a7733`, sage `#56674e`,
  near-black `#12100b` staff chrome.
- One surface declaration per element: a hairline border **or** a shadow, never both. Radii 3–18px.
- Serif display (Fraunces) carries hierarchy; colour is reserved for state and money.
- Removed: eyebrows/kickers, section numbers, glass blur, grain overlays, gradient dish art,
  decorative halos, pill-shaped controls, KPI cards, card hover lifts with shadows.

### What was rebuilt

- **Tokens + utilities** (`app/globals.css`) — new palette, display and tabular money faces, metric
  band, floor canvas grid, reveal/enter motion, reduced-motion guards, print rules.
- **Primitives** — `Card` (border-only), `Button` (ink/oxblood, square action shapes), `Input`
  (hairline fields), `PageHeader` (display title, eyebrow prop accepted but deliberately not
  rendered), status stamps instead of pills.
- **App shell** — near-black sidebar with brass marks, grouped navigation, branch switcher, and a
  new **service rail** showing tenant · branch · section · live Bangkok clock.
- **Overview** — a horizontal metric band (30-day gross, orders, average bill, tables seated) and an
  asymmetric layout: chart, “Service now”, “Needs attention”, recent orders, best sellers.
- **Floor** — replaced the table-card grid with a real positioned canvas drawn from persisted
  `posX/posY/width/height`, zone labels per band, status dots, outstanding totals, and a plan/list
  toggle. Zone filters became a segmented control.
- **Guest menu** — typographic menu: category tabs ruled underneath, dish rows separated by
  hairlines, no invented dish images, dark header, sticky search within the paper surface.
- **Kitchen** — squared station filter, divided stat band, border-only tickets, squared live chip.
- **POS / analytics / platform** — metric bands instead of stat cards, aligned chart card tops,
  receipt-like line items, clearer tenant rows (single status stamp, no stretched card).
- **Marketing and sign-in** — poster/ledger landing page (dark “pass” panel, timing section,
  capability index, receipt panel) and a split editorial sign-in with underline fields and
  click-to-fill demo roles.

### Bugs found by looking at the rendered result

1. **Seed floor layout stacked zones.** `createTables` added only `zoneIndex * 30` to `posY` while
   rows are 150px apart, so Indoor, Terrace, VIP and Private Room tables overprinted each other.
   Fixed by laying each zone out in its own row band (`rowOffset += ceil(count / 5)`), reseeded, and
   re-captured. The canvas now shows every zone.
2. **`TableRow` had no `width`/`height`.** The type only carried positions; the new canvas needs the
   stored rectangle. Added to `lib/types.ts` and caught by `tsc --noEmit`.
3. **Platform tenant table showed two identical ACTIVE stamps** (tenant status and subscription
   status) and the card stretched to the height of the right-hand column. Now one stamp, a second
   only when the subscription differs from ACTIVE, and `items-start` on the grid.
4. **Money glyph.** `.money` used a mono stack without the Thai subset, so `฿` fell back. Switched to
   tabular Plex figures.

### Docs and capture

- `scripts/capture.mjs` now also captures the platform dashboard and publishes the curated set into
  `docs/screenshots/`, so the README gallery cannot drift from the build that was measured.
- README design-system section rewritten to match the shipped system.

### Verification

- `pnpm --filter @tabletap/web exec tsc --noEmit` → clean.
- `pnpm --filter @tabletap/web build` → pass; `next start` serves the redesign.
- Playwright captured **12 screenshots** at 1440×900 and 390×844 with **no console errors**.
- Database reset + reseed → 2 tenants, 4 branches, 60 tables, 34 items, 607 orders.
- `pnpm --filter @tabletap/api test` → 30/30.
- API integration smoke → all checks pass; web smoke → 24/24.
- `pnpm --filter @tabletap/web test:realtime` → staff, kitchen and guest rooms all receive events.

## 2026-11-26 — Session 4 (guest ordering surface)

The guest menu was rebuilt again, this time as an ordering product rather than a printed menu held
on screen. The previous version was honest but flat: one narrow column, no add affordance in the
list, a cart bar that only appeared after the first dish, and a desktop layout that left most of the
screen empty.

### New structure

- **Two panes on desktop**: the menu column plus a sticky 340px **table rail** carrying the running
  order, subtotal, review action, floor requests and the latest order's progress. Mobile keeps one
  column and a solid bottom cart bar with the count and total.
- **Fast add in the list**: a bordered `+` per dish adds directly when there are no variants or
  modifiers, and turns into a green check for 1.2s. Dishes with options open the sheet. A quantity
  badge on the button shows how many of that dish are already in the order.
- **Dish sheet**: price, description, allergens, prep time, variant and modifier groups with a
  brand-coloured “Required” until satisfied, kitchen note, and a sticky footer with the stepper and
  the live line total.
- **Order sheet**: line items with options and notes, a stepper per line, subtotal with the server
  computing service charge and VAT, and one send action. Identical configurations merge into a
  single line instead of duplicating rows.
- **Orders view**: one ticket per order with number, time, elapsed, status stamp, a five-step
  progress rule, per-item status, order total, bill panel and running total. Copy pluralises
  correctly and reads “just now” under a minute.
- **Category behaviour**: counts in the tabs, scroll-spy keeps the active tab honest, search
  replaces the tabs and has a real empty state.
- **Requests**: call waiter, water, utensils and bill are reachable from the rail and the footer,
  each creating the session on first use.

### Details worth noting

- The session probe no longer runs on first visit: a localStorage hint records that a customer
  session exists, so a brand-new guest does not trigger a 401 in the console. The capture script
  went back to reporting **no console errors**.
- Dialogs close on Escape and lock background scroll; the stepper, add and quantity controls all
  expose labels.
- The header no longer truncates the restaurant name on a 390px screen: controls stack under the
  name instead of competing with it.

### Verification

- `tsc --noEmit` clean; `next build` pass.
- Playwright exercised the real flow at 1440×900 and 390×844: quick add, quantity badge, order
  sheet, dish sheet with a required option, send to kitchen, and the orders timeline.
- `node apps/web/scripts/web-smoke.mjs` → 24/24.
- Capture script: **13 screenshots**, no console errors, published to `docs/screenshots/`
  (including a new dish-sheet image).

## 2026-11-26 — Session 5 (readiness audit)

Every route was opened in a real browser at 1440×900 and 390×844 as the owner, with the console
watched. The audit found presentation bugs rather than broken flows; the fixes below are committed.

### Fixed

- **Service rail named the wrong section** on `/app/orders/<id>` and `/app/bills/<id>` (it read the
  last path segment, found no label, and fell back to “Overview”). It now uses the last segment that
  names a section.
- **Guest-request `OPEN` was green.** An unresolved request read as success; it is now gold, and
  `OPEN_REQUEST` follows the same tone.
- **Dates mixed languages.** Staff screens printed Thai month names inside English tables; staff
  dates now use `en-GB` in Asia/Bangkok, while the guest menu keeps its own Thai formatting.
- **Pluralisation.** `1 order(s)` is gone: a `plural()` helper is used on the dashboard, orders,
  bills, order detail, POS and the guest menu.
- **Mobile tables.** Orders, bills, inventory, menu, staff, audit and the floor list now set a
  minimum table width so they scroll horizontally instead of collapsing into four-line cells.
  Order and bill numbers no longer wrap.
- **Floor on a phone** defaults to the list view; a 1300px canvas is not usable at 390px.
- **Filter controls** on orders and bills are the same hairline segmented control used on the floor
  and kitchen, and the bordered groups no longer stretch a blank cell across the row.
- **Inventory** now uses the metric band, matching the overview and analytics.
- **Shared tabs** (`TabsList`/`TabsTrigger`) are squared and ink-filled instead of a floating pill.
- **Added `app/loading.tsx` and `app/error.tsx`**: navigations show a skeleton, and an API failure
  shows a retry surface with the digest instead of Next's default error page.
- **Long lists** state that they show the latest 100 rows, so the cap is no longer silent.

### Found but not changed (documented in KNOWN_ISSUES.md)

- `pnpm lint` fails: ESLint is not installed and no config exists (#11).
- Orders and bills cap at 100 rows with no pagination (#12).
- Split rows still stay `OPEN` after payment (#1) and payment creation is not idempotent (#2).
- The dashboard day boundary still depends on the API host timezone (#3).
- The kitchen board is single-instance without the Redis adapter (#4).

### Verification

- `tsc --noEmit` clean, `next build` pass.
- `pnpm --filter @tabletap/api test` → 30/30.
- `node apps/web/scripts/web-smoke.mjs` → 24/24.
- Browser pass over 13 staff routes plus 5 phone routes: no unexpected console errors.

## 2026-11-26 — Session 6 (operations feature pack)

### Backend

- **Orders and bills** accept `offset`, `from` and `to`; both lists page 50 rows at a time.
- **CSV export** at `GET /orders/export` and `GET /bills/export`, gated by `report.export`, with a
  BOM so Excel keeps Thai text.
- **Day close** at `GET /analytics/day-close?branchId&date`: settled bills, VAT, service, discounts,
  refunds, net, average bill, order counts, payment mix, cash collected, unsettled bills and open
  sessions for one Bangkok business day. Available to `payment.read` as well as `analytics.read`.
- **Payment idempotency**: `POST /payments` writes an `IdempotencyRecord` in the payment
  transaction; a replay returns the original payment, a different body under the same key returns
  `IDEMPOTENCY_KEY_REUSED`.
- **Bangkok day boundary**: default analytics periods no longer depend on the API host timezone.

### Web

- Orders and bills: date range, offset pagination, CSV button, and a phone card layout instead of a
  squeezed table.
- New **Day close** page under Money: metric band, settlement and payment breakdown, still-open
  bills, print and bills CSV for the date.
- Guest requests: Active / Resolved / All tabs, live socket refresh with a Live chip, resolved
  history with note and timestamp, and a toast when a new request arrives.
- POS sends an idempotency key with each payment request.

### Verified

- API smoke now asserts day close, viewer export denial and paged bill lists → all pass.
- Payment idempotency exercised over HTTP: two identical calls returned the same payment id.
- Orders CSV returned 291 rows for the branch; day close returned the seeded day totals.
- 14 screenshots, no console errors.

## 2026-11-26 — Session 7 (the check and the receipt)

### The printed artefacts are now designed, not generated

- **Receipt page** at `/receipt/<billId>` with two layouts: an A4 folded check and an 80 mm
  thermal roll. Serif letterhead, double rules, dotted leaders, a brass “PAID” stamp, Thai
  thank-you, the fiscal notice, and the payment reference for every capture. Print CSS sets the
  paper size per layout; the POS “Print receipt” action opens it.
- **Bill detail** rebuilt as a check: quantity gutter, dish names in the display face, unit price and
  per-line VAT, totals with leaders, a settlement panel with balance due, payments, splits, orders
  and the receipt reference.
- **Kitchen tickets** print from the board (the chrome is hidden for print and cards avoid breaking
  across pages). Receipt printers are still driven by the browser; an ESC/POS agent remains.
- **Seed receipts** now carry the same payload shape as runtime receipts (items, totals, payments,
  branch/VAT, notice) instead of a three-field placeholder, so historical receipts print correctly.
- The receipt renderer accepts the payload as an object or a string and tolerates older snapshots.

### Verified

- Receipt and bill pages open from the production build with no console errors.
- 16 screenshots published; `receipt.png` and `bill.png` added to the README gallery.
- `pnpm --filter @tabletap/web build` passes; `tsc --noEmit` clean.

## 2026-11-26 — Session 8 (promotions, end to end)

- **API** — `promotions` module: list (tenant/branch), create, update, all behind
  `promotion.manage`, with class-level permission metadata, audit entries, code uniqueness
  (`PROMOTION_CODE_TAKEN`), percentage validation, date ordering and branch access checks.
- **UI** — `/app/promotions`: list with live state (active, scheduled, expired, fully redeemed),
  value, code, branch, dates, redemptions and minimum spend; a side form for create/edit with
  validation errors; pause/activate in one click.
- **Guest** — the cart sheet now carries a promotion code field; the code travels with the order and
  is priced server-side. Invalid or expired codes are refused before anything is written.
- **Seed** already ships three demo codes (Welcome 10%, Happy Hour ฿100 off, Songkran 15% inactive).
- Verified over HTTP: create 201 → patch value 200 → invalid code 400; an order with `OPEN10`
  produced subtotal 387.00, discount 46.44, total 374.62; an unknown code returned
  `PROMOTION_INVALID`; the test order was cancelled.
- 17 screenshots including the promotions screen; no console errors.
