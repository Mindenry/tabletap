import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BellRing,
  Boxes,
  Check,
  ChefHat,
  CreditCard,
  QrCode,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Timer,
  UtensilsCrossed,
} from 'lucide-react';
import { Reveal } from '@/components/motion/reveal';
import { SpotlightCard } from '@/components/motion/spotlight-card';
import { ScrollProgress } from '@/components/motion/scroll-progress';

const FLOW = [
  {
    title: 'Guest scans the table',
    body: 'A single-use table token opens the live menu. No app, no account, no queue at the counter.',
    icon: QrCode,
    meta: 'Table session issued',
  },
  {
    title: 'Order reaches the station',
    body: 'Items route to hot kitchen, grill, cold kitchen, dessert or bar — each with its own ticket.',
    icon: ChefHat,
    meta: 'Server priced, idempotent',
  },
  {
    title: 'Kitchen works the board',
    body: 'Accept, start, mark each item ready. The guest watches progress from their phone.',
    icon: Timer,
    meta: 'Per-item states',
  },
  {
    title: 'Cashier settles the table',
    body: 'One bill across every round, split by guest, PromptPay or cash, receipt included.',
    icon: CreditCard,
    meta: 'Locked confirmation',
  },
];

const CAPABILITIES = [
  {
    icon: QrCode,
    title: 'QR ordering',
    body: 'Table-scoped sessions, modifier rules enforced server-side, duplicate submissions impossible.',
  },
  {
    icon: UtensilsCrossed,
    title: 'Kitchen display',
    body: 'Station routing, elapsed timers, per-item readiness, reject with a reason that reverses stock.',
  },
  {
    icon: CreditCard,
    title: 'POS & billing',
    body: 'Bill snapshots, equal or item splits, PromptPay QR, confirmation that records who took the money.',
  },
  {
    icon: ReceiptText,
    title: 'Receipts that hold',
    body: 'Totals are frozen at billing time. Editing the menu tomorrow cannot rewrite yesterday.',
  },
  {
    icon: Boxes,
    title: 'Inventory from recipes',
    body: 'Stock moves once when the kitchen accepts, reverses on rejection, with a full movement ledger.',
  },
  {
    icon: BarChart3,
    title: 'Analytics from facts',
    body: 'Every figure is a SQL aggregate over paid bills, payments and tickets. Nothing is invented.',
  },
  {
    icon: ShieldCheck,
    title: 'Tenant isolation',
    body: 'Permission per action, branch scoping per membership, cross-tenant attempts tested and rejected.',
  },
  {
    icon: BellRing,
    title: 'Guest requests',
    body: 'Waiter calls, water, utensils and the bill land on the floor screen with age and ownership.',
  },
];

const DEMO_FACTS = [
  { value: '2', label: 'restaurants' },
  { value: '4', label: 'branches' },
  { value: '60', label: 'tables' },
  { value: '607', label: 'settled orders' },
  { value: '30', label: 'days of history' },
];

export default function LandingPage() {
  return (
    <div className="relative min-h-dvh overflow-x-clip bg-paper">
      <ScrollProgress />

      {/* ambient background */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-[12%] top-[-18%] h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle_at_center,rgba(180,81,44,0.16),transparent_65%)] animate-drift" />
        <div className="absolute right-[-14%] top-[6%] h-[620px] w-[620px] rounded-full bg-[radial-gradient(circle_at_center,rgba(83,100,74,0.14),transparent_65%)] animate-drift [animation-delay:-8s]" />
        <div className="absolute inset-0 surface-grid opacity-[0.5] [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" />
      </div>

      <header className="sticky top-0 z-50">
        <div className="glass border-b border-line/70">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-3.5">
            <Link href="/" className="group flex items-center gap-2.5">
              <span className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-[11px] bg-ink text-paper transition-transform duration-500 group-hover:rotate-[-6deg]">
                <UtensilsCrossed className="h-4 w-4" />
                <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.24),transparent_60%)]" />
              </span>
              <span className="text-[15px] font-semibold tracking-tight">TableTap</span>
            </Link>
            <nav className="flex items-center gap-1.5">
              <Link
                href="/menu/demo-sathorn-t03-4f8c2a91"
                className="hidden rounded-full px-3 py-2 text-[13px] font-medium text-ink-soft transition-colors hover:bg-paper-deep sm:block"
              >
                Guest menu
              </Link>
              <Link
                href="/login"
                className="press group inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-[13px] font-medium text-paper transition-colors hover:bg-ink-soft"
              >
                Staff sign in
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <main>
        {/* ---------------------------------------------------------------- hero */}
        <section className="mx-auto grid w-full max-w-6xl gap-12 px-5 pb-16 pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pt-20">
          <div>
            <Reveal>
              <p className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand shadow-[var(--shadow-inset)]">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
                </span>
                Restaurant operations platform
              </p>
            </Reveal>

            <Reveal delay={80}>
              <h1 className="mt-5 font-display text-[46px] leading-[0.98] tracking-[-0.03em] text-ink sm:text-[62px] lg:text-[68px]">
                The order, the kitchen
                <br className="hidden sm:block" /> and the bill —{' '}
                <span className="relative inline-block">
                  <span className="relative z-10 text-brand">one system.</span>
                  <svg
                    aria-hidden
                    viewBox="0 0 240 18"
                    className="absolute -bottom-1 left-0 h-4 w-full text-brand/25"
                    preserveAspectRatio="none"
                  >
                    <path
                      d="M3 13C56 5 132 3 237 9"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="5"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </h1>
            </Reveal>

            <Reveal delay={150}>
              <p className="mt-6 max-w-xl text-pretty text-[15.5px] leading-[1.7] text-ink-soft">
                TableTap connects QR ordering to the kitchen display, the cashier&apos;s bill and the
                owner&apos;s dashboard. Built for Thai restaurants: Thai and English menus, 7% VAT, service
                charge, PromptPay, and baht-accurate totals.
              </p>
            </Reveal>

            <Reveal delay={220}>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/login"
                  className="press group inline-flex h-12 items-center gap-2 rounded-full bg-brand px-6 text-[14px] font-semibold text-white shadow-[0_18px_36px_-18px_rgba(180,81,44,0.8)] transition-all duration-300 hover:bg-brand-deep hover:shadow-[0_22px_44px_-18px_rgba(139,58,28,0.9)]"
                >
                  Open the demo
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </Link>
                <Link
                  href="/menu/demo-sathorn-t03-4f8c2a91"
                  className="press inline-flex h-12 items-center gap-2 rounded-full border border-line-strong bg-surface px-6 text-[14px] font-medium text-ink transition-colors hover:bg-paper-deep"
                >
                  <QrCode className="h-4 w-4" />
                  Scan as a guest
                </Link>
              </div>
            </Reveal>

            <Reveal delay={300}>
              <ul className="mt-9 grid gap-x-5 gap-y-2.5 text-[13px] text-ink-soft sm:grid-cols-2">
                {[
                  'Server-side pricing, never the client',
                  'Idempotent order submission',
                  'Atomic, once-only stock deduction',
                  'Tenant isolation tested',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="grid h-4 w-4 place-items-center rounded-full bg-success-soft text-success">
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>

          {/* product visual */}
          <Reveal delay={180} direction="scale" className="relative">
            <div
              className="absolute -inset-6 rounded-[38px] bg-[radial-gradient(circle_at_60%_20%,rgba(180,81,44,0.14),transparent_60%)]"
              aria-hidden
            />
            <div className="group relative">
              <div className="overflow-hidden rounded-[24px] border border-line bg-surface-raised shadow-[var(--shadow-pop)] transition-transform duration-700 ease-[var(--ease-out-expo)] group-hover:-translate-y-1">
                <div className="flex items-center justify-between border-b border-line bg-night px-4 py-3 text-[#e8e2d6]">
                  <div className="flex items-center gap-2">
                    <span className="flex gap-1">
                      <span className="h-2 w-2 rounded-full bg-[#4a443a]" />
                      <span className="h-2 w-2 rounded-full bg-[#4a443a]" />
                      <span className="h-2 w-2 rounded-full bg-brand" />
                    </span>
                    <span className="ml-1 text-[10px] font-medium uppercase tracking-[0.16em] text-[#a8a194]">
                      Kitchen · Hot station
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-semibold text-[#f0c9b6]">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />2 live
                  </span>
                </div>

                <div className="space-y-3 p-4">
                  {[
                    {
                      table: 'Table 07',
                      number: 'ORD-SATHORN-0912',
                      age: '06:12',
                      urgent: false,
                      items: ['ผัดไทยกุ้งสด ×2', 'ต้มยำกุ้ง ×1'],
                      note: 'ไม่ใส่ผักชี',
                      state: 'Preparing',
                    },
                    {
                      table: 'Table 12',
                      number: 'ORD-SATHORN-0913',
                      age: '02:48',
                      urgent: true,
                      items: ['แกงเขียวหวาน ×1', 'ข้าวสวย ×2'],
                      note: null,
                      state: 'New',
                    },
                  ].map((ticket) => (
                    <div
                      key={ticket.number}
                      className="rounded-xl border border-line bg-paper/60 p-3.5 transition-colors hover:border-line-strong"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-[13px] font-semibold text-ink">{ticket.table}</p>
                          <p className="font-mono text-[10px] text-muted">{ticket.number}</p>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold ${
                            ticket.urgent ? 'bg-danger-soft text-danger' : 'bg-paper-deep text-ink-soft'
                          }`}
                        >
                          {ticket.age}
                        </span>
                      </div>
                      <ul className="mt-2 space-y-1 text-[12px] text-ink-soft">
                        {ticket.items.map((item) => (
                          <li key={item} className="flex items-center gap-1.5">
                            <span className="h-1 w-1 rounded-full bg-brand/60" />
                            {item}
                          </li>
                        ))}
                      </ul>
                      {ticket.note ? (
                        <p className="mt-1.5 inline-flex rounded bg-gold-soft px-1.5 py-0.5 text-[10px] font-medium text-gold">
                          {ticket.note}
                        </p>
                      ) : null}
                      <div className="mt-3 flex items-center justify-between">
                        <span className="rounded-full bg-gold-soft px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-gold">
                          {ticket.state}
                        </span>
                        <span className="text-[10px] text-muted">HOT_KITCHEN</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between border-t border-line bg-paper px-4 py-2.5">
                  <span className="text-[10px] text-muted">Persisted before broadcast</span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-success">
                    <ShieldCheck className="h-3 w-3" /> PostgreSQL
                  </span>
                </div>
              </div>

              {/* floating metric card */}
              <div className="mt-5 ml-4 hidden w-[190px] animate-float rounded-2xl border border-line bg-surface-raised/95 p-3.5 shadow-[var(--shadow-lift)] backdrop-blur sm:block">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted">Today</p>
                <p className="mt-1 font-display text-[26px] leading-none text-ink">฿18,420</p>
                <p className="mt-1 text-[10px] text-muted">42 paid bills · VAT included</p>
                <div className="mt-2 flex h-7 items-end gap-1">
                  {[30, 46, 38, 62, 52, 78, 64, 88, 72, 96].map((height, index) => (
                    <span
                      key={index}
                      className="w-full rounded-sm bg-brand/25 transition-colors hover:bg-brand/60"
                      style={{ height: `${height}%` }}
                    />
                  ))}
                </div>
              </div>

              <div className="absolute -right-3 -top-4 hidden items-center gap-1.5 rounded-full border border-line bg-surface-raised/95 px-3 py-1.5 text-[10px] font-medium text-ink-soft shadow-[var(--shadow-card)] backdrop-blur md:flex">
                <Sparkles className="h-3 w-3 text-brand" />
                Realtime outbox
              </div>
            </div>
          </Reveal>
        </section>

        {/* --------------------------------------------------------- demo facts */}
        <section className="border-y border-line/80 bg-surface/50">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-6 px-5 py-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              Inside the demo
            </p>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
              {DEMO_FACTS.map((fact) => (
                <div key={fact.label} className="flex items-baseline gap-2">
                  <span className="font-display text-[24px] leading-none text-ink">{fact.value}</span>
                  <span className="text-[11px] text-muted">{fact.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------------- flow */}
        <section className="mx-auto w-full max-w-6xl px-5 py-20">
          <Reveal>
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">
                The service loop
              </p>
              <h2 className="mt-2 font-display text-[34px] leading-[1.05] tracking-[-0.02em] sm:text-[42px]">
                From the first scan to the last receipt.
              </h2>
              <p className="mt-3 text-[14px] leading-relaxed text-muted">
                Each step writes to PostgreSQL inside a transaction. A dropped socket or a closed tab never
                loses an order — the kitchen can always recover the true state.
              </p>
            </div>
          </Reveal>

          <div className="relative mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div
              aria-hidden
              className="absolute left-0 right-0 top-[46px] hidden h-px bg-gradient-to-r from-transparent via-line-strong to-transparent lg:block"
            />
            {FLOW.map((step, index) => {
              const Icon = step.icon;
              return (
                <Reveal key={step.title} delay={index * 90}>
                  <div className="relative h-full rounded-lg border border-line bg-surface-raised p-5 transition-colors hover:border-line-strong">
                    <div className="flex items-center justify-between">
                      <span className="relative z-10 grid h-10 w-10 place-items-center rounded-full border border-line bg-surface text-brand shadow-[var(--shadow-inset)]">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="font-mono text-[11px] text-muted-soft">0{index + 1}</span>
                    </div>
                    <h3 className="mt-4 text-[14px] font-semibold text-ink">{step.title}</h3>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{step.body}</p>
                    <p className="mt-4 inline-flex rounded-full bg-paper-deep px-2 py-0.5 text-[10px] font-medium text-ink-soft">
                      {step.meta}
                    </p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </section>

        {/* ------------------------------------------------------- capabilities */}
        <section className="relative border-y border-line/80 bg-surface/40">
          <div className="mx-auto w-full max-w-6xl px-5 py-20">
            <Reveal>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="max-w-2xl">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">
                    What is real
                  </p>
                  <h2 className="mt-2 font-display text-[34px] leading-[1.05] tracking-[-0.02em] sm:text-[42px]">
                    Every capability is wired to the database.
                  </h2>
                </div>
                <p className="max-w-xs text-[12.5px] leading-relaxed text-muted">
                  No decorative buttons. No invented metrics. The dashboard reads the same rows the kitchen
                  writes.
                </p>
              </div>
            </Reveal>

            <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {CAPABILITIES.map((capability, index) => {
                const Icon = capability.icon;
                return (
                  <Reveal key={capability.title} delay={(index % 4) * 70}>
                    <SpotlightCard className="h-full p-5">
                      <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-brand-soft text-brand-deep">
                        <Icon className="h-4 w-4" />
                      </span>
                      <h3 className="mt-3.5 text-[13.5px] font-semibold text-ink">{capability.title}</h3>
                      <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{capability.body}</p>
                    </SpotlightCard>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- split proof */}
        <section className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-20 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <Reveal>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">
              Financial integrity
            </p>
            <h2 className="mt-2 font-display text-[34px] leading-[1.05] tracking-[-0.02em] sm:text-[42px]">
              Baht-accurate, from cart to receipt.
            </h2>
            <p className="mt-4 text-[14px] leading-relaxed text-ink-soft">
              Prices come from the database, never the browser. VAT is computed once on the taxable base and
              allocated to lines, so the receipt and the total always agree. Discounts and service charges
              allocate with the remainder pinned to the last line.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                { title: 'NUMERIC, not float', body: 'PostgreSQL NUMERIC(12,2) with decimal.js end to end.' },
                { title: 'Server-only totals', body: 'Client payloads carry ids and quantities only.' },
                { title: 'Frozen bills', body: 'A bill snapshots every line and total it settles.' },
                { title: 'One confirmation', body: 'Row locks stop duplicate payment confirmation.' },
              ].map((item) => (
                <li key={item.title} className="flex gap-3">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-success-soft text-success">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                  <div>
                    <p className="text-[13px] font-medium text-ink">{item.title}</p>
                    <p className="text-[12px] text-muted">{item.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={120} direction="scale">
            <div className="relative">
              <div
                className="absolute -inset-5 rounded-[32px] bg-[radial-gradient(circle_at_30%_20%,rgba(83,100,74,0.14),transparent_65%)]"
                aria-hidden
              />
              <div className="relative overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-[var(--shadow-lift)]">
                <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted">Bill</p>
                    <p className="font-mono text-[13px] font-semibold text-ink">BILL-SATHORN-20261125-0042</p>
                  </div>
                  <span className="rounded-full bg-success-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-success">
                    Paid
                  </span>
                </div>
                <div className="space-y-2 px-5 py-4 text-[12.5px]">
                  {[
                    ['2 × ผัดไทยกุ้งสด', '358.00'],
                    ['1 × ต้มยำกุ้ง', '189.00'],
                    ['3 × ชาไทย', '195.00'],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-ink-soft">{label}</span>
                      <span className="tabular text-ink">฿{value}</span>
                    </div>
                  ))}
                  <div className="my-2 h-px bg-line" />
                  {[
                    ['Subtotal', '742.00'],
                    ['Service charge 10%', '74.20'],
                    ['VAT 7% (included)', '53.40'],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between text-muted">
                      <span>{label}</span>
                      <span className="tabular">{value}</span>
                    </div>
                  ))}
                  <div className="mt-2 flex items-baseline justify-between border-t border-line pt-3">
                    <span className="text-[12px] font-medium text-muted">Total</span>
                    <span className="font-display text-[30px] leading-none text-ink">฿816.20</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between rounded-lg bg-paper px-3 py-2">
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
                      <CreditCard className="h-3.5 w-3.5" /> PromptPay
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success">
                      <Check className="h-3 w-3" /> Confirmed by Pim
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ------------------------------------------------------------- CTA */}
        <section className="mx-auto w-full max-w-6xl px-5 pb-24">
          <Reveal direction="scale">
            <div className="noise relative overflow-hidden rounded-[28px] bg-night px-6 py-12 text-[#e8e2d6] sm:px-12">
              <div
                aria-hidden
                className="absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,rgba(180,81,44,0.34),transparent_65%)] animate-drift"
              />
              <div
                aria-hidden
                className="absolute -bottom-32 -left-20 h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle_at_center,rgba(83,100,74,0.28),transparent_65%)]"
              />
              <div className="relative grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d9a88f]">
                    Take the whole loop
                  </p>
                  <h2 className="mt-3 font-display text-[32px] leading-[1.05] text-white sm:text-[40px]">
                    Scan a table, cook an order, settle a bill.
                  </h2>
                  <p className="mt-3 max-w-xl text-[13.5px] leading-relaxed text-[#b3ab9c]">
                    Sign in as the owner, open the floor plan, scan a table on your phone, then work the order
                    through the kitchen and close the bill. Thirty days of trading history sits behind it.
                  </p>
                </div>
                <div className="flex flex-col gap-2.5">
                  <Link
                    href="/login"
                    className="press group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand px-6 text-[14px] font-semibold text-white transition-colors hover:bg-brand-deep"
                  >
                    Enter the demo
                    <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </Link>
                  <Link
                    href="/menu/demo-sathorn-t03-4f8c2a91"
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/15 px-6 text-[14px] font-medium text-white transition-colors hover:bg-white/5"
                  >
                    Open the guest menu
                  </Link>
                  <p className="mt-1 text-center text-[11px] text-[#7d7768]">
                    Demo credentials are on the sign-in page.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-line py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-start justify-between gap-4 px-5 text-[12px] text-muted">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-ink text-paper">
              <UtensilsCrossed className="h-3.5 w-3.5" />
            </span>
            <span className="font-medium text-ink">TableTap</span>
          </div>
          <p className="max-w-md leading-relaxed">
            A portfolio system, not a certified fiscal product. PromptPay QR generation requests payment; a
            cashier or verified provider confirms it.
          </p>
          <p className="text-[11px]">Next.js · NestJS · PostgreSQL · Socket.IO</p>
        </div>
      </footer>
    </div>
  );
}
