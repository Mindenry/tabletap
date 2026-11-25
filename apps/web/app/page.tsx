import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Check,
  ClipboardCheck,
  CreditCard,
  QrCode,
  ReceiptText,
  ShieldCheck,
  Timer,
  UtensilsCrossed,
} from 'lucide-react';

const STEPS = [
  {
    title: 'Guest scans the table QR',
    body: 'A single-use table token opens the live menu. No app, no account, no login screen.',
    icon: QrCode,
  },
  {
    title: 'Order reaches the right station',
    body: 'Items are routed to hot kitchen, grill, cold kitchen, dessert and bar, each with its own ticket.',
    icon: UtensilsCrossed,
  },
  {
    title: 'Kitchen works the board',
    body: 'Accept, start, mark ready — per item. The guest sees progress on their phone.',
    icon: Timer,
  },
  {
    title: 'Cashier settles and closes',
    body: 'One bill across many order rounds, split equally or by item, PromptPay or cash.',
    icon: CreditCard,
  },
];

const CAPABILITIES = [
  {
    icon: QrCode,
    title: 'QR ordering',
    body: 'Table-scoped sessions, server-validated carts, idempotent submission.',
  },
  {
    icon: UtensilsCrossed,
    title: 'Kitchen display',
    body: 'Station routing, per-item states, elapsed timers, reject with reason.',
  },
  {
    icon: CreditCard,
    title: 'POS & billing',
    body: 'Bill snapshots, split payments, PromptPay QR, audited confirmation.',
  },
  {
    icon: ReceiptText,
    title: 'Receipts',
    body: 'Immutable bill snapshots and printable receipts, never rewritten by menu edits.',
  },
  {
    icon: Boxes,
    title: 'Inventory',
    body: 'Recipes deduct stock once, with reversal on cancellation and full movement history.',
  },
  {
    icon: BarChart3,
    title: 'Analytics',
    body: 'Every number is a SQL aggregate over real bills, payments and orders.',
  },
  {
    icon: ShieldCheck,
    title: 'Multi-tenant security',
    body: 'Permission-based access, branch scoping and per-request membership checks.',
  },
  {
    icon: ClipboardCheck,
    title: 'Audit trail',
    body: 'Who changed a price, confirmed a payment, cancelled an order — and when.',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-paper">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-white">
            <UtensilsCrossed className="h-4.5 w-4.5" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">TableTap</span>
        </Link>
        <nav className="flex items-center gap-2">
          <Link
            href="/menu/demo-sathorn-t03-4f8c2a91"
            className="hidden rounded-md px-3 py-2 text-[13px] font-medium text-ink-soft hover:bg-paper-deep sm:block"
          >
            View a live menu
          </Link>
          <Link
            href="/login"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-ink px-4 text-[13px] font-medium text-paper hover:bg-ink-soft"
          >
            Staff sign in
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid w-full max-w-6xl gap-10 px-5 pb-16 pt-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:pt-16">
          <div className="animate-in-up">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand">
              Restaurant operations platform
            </p>
            <h1 className="text-balance font-[family-name:var(--font-display)] text-[44px] leading-[1.05] tracking-[-0.03em] text-ink sm:text-[58px]">
              The order, the kitchen and the bill — one system.
            </h1>
            <p className="mt-5 max-w-xl text-pretty text-[15px] leading-relaxed text-ink-soft">
              TableTap connects QR ordering to the kitchen display, the cashier&apos;s bill and the
              owner&apos;s dashboard. Built for Thai restaurants: Thai and English menus, 7% VAT, service
              charge, PromptPay, and baht-accurate totals.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="inline-flex h-11 items-center gap-2 rounded-md bg-brand px-5 text-[14px] font-medium text-white shadow-[0_12px_28px_-18px_rgba(184,83,46,0.9)] hover:bg-brand-deep"
              >
                Open the demo
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/menu/demo-sathorn-t03-4f8c2a91"
                className="inline-flex h-11 items-center gap-2 rounded-md border border-line-strong bg-surface px-5 text-[14px] font-medium text-ink hover:bg-paper-deep"
              >
                <QrCode className="h-4 w-4" />
                Scan as a guest
              </Link>
            </div>
            <ul className="mt-8 grid gap-2 text-[13px] text-ink-soft sm:grid-cols-2">
              {[
                'Server-side pricing, never the client',
                'Idempotent order submission',
                'Atomic, once-only stock deduction',
                'Tenant isolation tested',
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-success" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative animate-in-up [animation-delay:120ms]">
            <div className="absolute -inset-4 rounded-[28px] bg-paper-deep/70" aria-hidden />
            <div className="relative overflow-hidden rounded-xl border border-line bg-surface-raised shadow-pop">
              <div className="flex items-center justify-between border-b border-line bg-night px-4 py-3 text-[#e8e2d6]">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a8a194]">
                  Kitchen · Hot station
                </span>
                <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold">2 live</span>
              </div>
              <div className="space-y-3 p-4">
                {[
                  {
                    table: 'Table 07',
                    number: 'ORD-SATHORN-0912',
                    age: '06:12',
                    items: ['ผัดไทยกุ้งสด ×2', 'ต้มยำกุ้ง ×1'],
                    state: 'Preparing',
                  },
                  {
                    table: 'Table 12',
                    number: 'ORD-SATHORN-0913',
                    age: '02:48',
                    items: ['แกงเขียวหวาน ×1', 'ข้าวสวย ×2'],
                    state: 'New',
                  },
                ].map((ticket) => (
                  <div key={ticket.number} className="rounded-lg border border-line bg-paper/50 p-3.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[13px] font-semibold text-ink">{ticket.table}</p>
                        <p className="text-[11px] text-muted">{ticket.number}</p>
                      </div>
                      <span className="tabular text-[12px] font-semibold text-brand">{ticket.age}</span>
                    </div>
                    <ul className="mt-2 space-y-1 text-[12px] text-ink-soft">
                      {ticket.items.map((item) => (
                        <li key={item}>• {item}</li>
                      ))}
                    </ul>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="rounded-full bg-gold-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold">
                        {ticket.state}
                      </span>
                      <span className="text-[11px] text-muted">Station: HOT_KITCHEN</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-line bg-paper px-4 py-3 text-[11px] text-muted">
                Every ticket is persisted in PostgreSQL before it is broadcast.
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-line bg-surface/70">
          <div className="mx-auto grid w-full max-w-6xl gap-6 px-5 py-12 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="relative">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-md bg-brand-soft text-brand-deep">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                      Step {index + 1}
                    </span>
                  </div>
                  <h3 className="text-[14px] font-semibold text-ink">{step.title}</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted">{step.body}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-5 py-16">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">What is real</p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-[34px] leading-tight tracking-[-0.02em]">
              Every capability below is wired to the database.
            </h2>
            <p className="mt-3 text-[14px] leading-relaxed text-muted">
              No decorative buttons, no invented metrics. The demo dataset is generated from real orders,
              bills and payments — and the dashboard reads from those rows.
            </p>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {CAPABILITIES.map((capability) => {
              const Icon = capability.icon;
              return (
                <div key={capability.title} className="rounded-lg border border-line bg-surface-raised p-4">
                  <Icon className="h-4.5 w-4.5 text-brand" />
                  <h3 className="mt-3 text-[13px] font-semibold text-ink">{capability.title}</h3>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted">{capability.body}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-5 pb-20">
          <div className="rounded-xl border border-line bg-night px-6 py-10 text-[#e8e2d6] sm:px-10">
            <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
              <div>
                <h2 className="font-[family-name:var(--font-display)] text-[30px] leading-tight text-white">
                  Try the whole flow in five minutes.
                </h2>
                <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-[#a8a194]">
                  Sign in as the owner, open the floor plan, scan a table QR on your phone, place an order,
                  then work it through the kitchen and settle the bill. The seeded restaurant has 30 days of
                  trading history behind it.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Link
                  href="/login"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-brand px-5 text-[14px] font-medium text-white hover:bg-brand-deep"
                >
                  Sign in to the demo
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/menu/demo-sathorn-t03-4f8c2a91"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-white/15 px-5 text-[14px] font-medium text-white hover:bg-white/5"
                >
                  Guest menu
                </Link>
                <p className="mt-1 text-center text-[11px] text-[#7d7768]">
                  Demo credentials are listed on the sign-in page.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line py-6">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 text-[12px] text-muted">
          <p>TableTap — built with Next.js, NestJS, PostgreSQL and Socket.IO.</p>
          <p>
            A portfolio system, not a certified fiscal product. PromptPay QR generation only requests payment;
            a cashier or verified provider confirms it.
          </p>
        </div>
      </footer>
    </div>
  );
}
