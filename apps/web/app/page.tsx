import Link from 'next/link';
import { ArrowRight, ArrowUpRight } from 'lucide-react';

const LOOP = [
  {
    time: '11:42',
    title: 'Guest orders',
    body: 'A table QR opens the menu. Modifiers and notes are validated before the order exists.',
  },
  {
    time: '11:43',
    title: 'The pass accepts',
    body: 'Tickets route to hot kitchen, grill, cold kitchen, dessert or bar — one per station.',
  },
  {
    time: '11:48',
    title: 'Kitchen ready',
    body: 'Each item is marked ready individually. The guest sees the change on their phone.',
  },
  {
    time: '12:10',
    title: 'Check settled',
    body: 'One bill across every round, split or paid in full, receipt snapshotted at payment.',
  },
];

const CAPABILITIES = [
  {
    label: 'Ordering',
    title: 'Taken once, priced once',
    body: 'Server-side pricing, idempotent submission, modifier rules enforced before a row is written.',
  },
  {
    label: 'Kitchen',
    title: 'A pass that keeps time',
    body: 'Station routing, per-item readiness, elapsed timers and a reject that returns its own stock.',
  },
  {
    label: 'Billing',
    title: 'Checks that never move',
    body: 'Bills snapshot every line and total. Editing the menu tomorrow cannot rewrite yesterday.',
  },
  {
    label: 'Payment',
    title: 'One confirmation',
    body: 'PromptPay QR plus a locked cashier confirmation. Duplicate and overpayment are rejected.',
  },
  {
    label: 'Inventory',
    title: 'Stock from recipes',
    body: 'Deduction happens once, when the kitchen accepts. Rejection reverses only that ticket.',
  },
  {
    label: 'Analytics',
    title: 'Numbers from rows',
    body: 'Every figure is a SQL aggregate over paid bills, payments and tickets. Nothing is invented.',
  },
  {
    label: 'Access',
    title: 'Six roles, one boundary',
    body: 'Permissions per action, branch scoping per membership, tenant isolation covered by tests.',
  },
  {
    label: 'Service',
    title: 'Requests with an owner',
    body: 'Waiter calls, water, utensils and the bill arrive on the floor screen with age and assignee.',
  },
];

const LEDGER = [
  ['NUMERIC, not float', 'PostgreSQL NUMERIC(12,2) with decimal.js end to end.'],
  ['Server-only totals', 'The browser sends ids and quantities; the API loads every price.'],
  ['Frozen bills', 'A bill copies the order lines and totals it settles.'],
  ['Remainder pinned', 'Discounts and service charge allocate so the parts sum exactly.'],
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <Link href="/" className="flex items-baseline gap-2.5">
            <span className="font-display text-[22px] leading-none tracking-[-0.04em] text-ink">
              TableTap
            </span>
            <span className="hidden text-[10px] uppercase tracking-[0.16em] text-muted-soft sm:inline">
              Restaurant operations
            </span>
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              href="/menu/demo-sathorn-t03-4f8c2a91"
              className="hidden text-[12px] font-medium text-ink-soft transition-colors hover:text-ink sm:inline"
            >
              Guest menu
            </Link>
            <Link
              href="/login"
              className="group inline-flex h-8 items-center gap-1.5 border-b border-ink pb-0.5 text-[12px] font-medium text-ink"
            >
              Staff sign in
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto grid w-full max-w-6xl gap-12 px-5 pb-14 pt-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pt-16">
          <div className="animate-rise">
            <h1 className="max-w-[13ch] font-display text-[46px] leading-[0.96] text-ink sm:text-[62px] lg:text-[68px]">
              From the table to the pass.
            </h1>
            <p className="mt-6 max-w-[46ch] text-[14.5px] leading-[1.7] text-ink-soft">
              TableTap carries an order from the guest&apos;s phone, through the kitchen, to a settled check —
              without retyping, re-asking, or guessing the total.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-5">
              <Link
                href="/login"
                className="group inline-flex h-10 items-center gap-2 bg-ink px-5 text-[13px] font-medium text-paper transition-colors hover:bg-ink-soft"
              >
                Enter the demo
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/menu/demo-sathorn-t03-4f8c2a91"
                className="inline-flex items-center gap-1.5 border-b border-line-strong pb-0.5 text-[12.5px] font-medium text-ink-soft transition-colors hover:border-ink hover:text-ink"
              >
                Open a guest menu
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          <div className="relative animate-rise [animation-delay:120ms]">
            <div className="bg-night px-4 pb-5 pt-3">
              <div className="flex items-center justify-between border-b border-[#2e2920] pb-3">
                <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.2em] text-[#a49a88]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#d8b978]" />
                  The pass · Sathorn
                </div>
                <span className="money text-[10px] text-[#7d7464]">21:42</span>
              </div>
              <div className="space-y-2.5 pt-3">
                {[
                  {
                    table: '07',
                    ticket: 'T-0912',
                    items: ['ผัดไทยกุ้งสด ×2', 'ต้มยำกุ้ง ×1'],
                    note: 'ไม่ใส่ผักชี',
                    time: '06:12',
                  },
                  {
                    table: '12',
                    ticket: 'T-0913',
                    items: ['แกงเขียวหวาน ×1', 'ข้าวสวย ×2'],
                    note: null,
                    time: '02:48',
                  },
                ].map((slip, index) => (
                  <div
                    key={slip.ticket}
                    className={`bg-surface px-3.5 py-3 ${index === 0 ? '-rotate-[0.5deg]' : 'rotate-[0.35deg]'}`}
                  >
                    <div className="flex items-baseline justify-between border-b border-dashed border-line pb-2">
                      <p className="money text-[12px] font-medium text-ink">TABLE {slip.table}</p>
                      <p className="money text-[10px] text-muted">{slip.ticket}</p>
                    </div>
                    <ul className="space-y-1 py-2 text-[11.5px] text-ink-soft">
                      {slip.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                    <div className="flex items-center justify-between border-t border-dashed border-line pt-1.5">
                      <span className="text-[9px] uppercase tracking-[0.12em] text-muted">
                        {slip.note ?? 'Standard'}
                      </span>
                      <span className="money text-[11px] font-medium text-brand">{slip.time}</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="pt-3 text-[9.5px] leading-relaxed text-[#7d7464]">
                Every ticket is persisted before it is broadcast. Reconnect and the pass is still true.
              </p>
            </div>
            <p className="mt-3 text-[10px] uppercase tracking-[0.12em] text-muted-soft">
              Demo dataset · Spice Garden, Bangkok
            </p>
          </div>
        </section>

        <section className="border-y border-line bg-surface/50">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-5 py-3 text-[11px] text-muted">
            <span className="text-ink-soft">Inside the demo</span>
            <span>2 restaurants</span>
            <span>4 branches</span>
            <span>60 tables</span>
            <span>34 dishes</span>
            <span>607 settled orders</span>
            <span>30 days of history</span>
          </div>
        </section>

        <section className="bg-night text-[#e9e3d6]">
          <div className="mx-auto w-full max-w-6xl px-5 py-14">
            <div className="max-w-2xl">
              <h2 className="font-display text-[32px] leading-[1.05] text-white sm:text-[40px]">
                One order, four moments, no retyping.
              </h2>
              <p className="mt-3 text-[13px] leading-relaxed text-[#a49a88]">
                The same order is visible to the guest, the kitchen and the cashier at every step. Each step
                is a transaction in PostgreSQL, not a message in memory.
              </p>
            </div>
            <div className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
              {LOOP.map((step) => (
                <div key={step.time} className="border-t border-[#3a3327] pt-3">
                  <p className="money text-[11px] text-[#d8b978]">{step.time}</p>
                  <h3 className="mt-2 font-display text-[20px] leading-tight text-white">{step.title}</h3>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-[#a49a88]">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-5 py-16">
          <div className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr]">
            <div>
              <h2 className="font-display text-[34px] leading-[1.03] text-ink sm:text-[42px]">
                Made of the things a restaurant already trusts.
              </h2>
              <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-muted">
                Checks, tickets, the pass, the floor book. TableTap keeps those artefacts and removes the
                transcription between them.
              </p>
            </div>
            <div>
              {CAPABILITIES.map((capability) => (
                <div
                  key={capability.title}
                  className="grid gap-x-6 gap-y-1 border-b border-line py-4 first:border-t sm:grid-cols-[92px_1fr]"
                >
                  <p className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted-soft">
                    {capability.label}
                  </p>
                  <div>
                    <h3 className="font-display text-[21px] leading-tight text-ink">{capability.title}</h3>
                    <p className="mt-1 max-w-[52ch] text-[12.5px] leading-relaxed text-muted">
                      {capability.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-line bg-surface/50">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-16 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
            <div>
              <h2 className="font-display text-[34px] leading-[1.03] text-ink sm:text-[42px]">
                The total on the check is the total the guest saw.
              </h2>
              <div className="mt-7 divide-y divide-line border-y border-line">
                {LEDGER.map(([title, body]) => (
                  <div key={title} className="grid gap-1 py-3 sm:grid-cols-[190px_1fr] sm:gap-6">
                    <p className="text-[12px] font-medium text-ink">{title}</p>
                    <p className="text-[12px] leading-relaxed text-muted">{body}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mx-auto w-full max-w-[340px] border border-line bg-surface-raised px-5 py-5 font-mono text-[11px] text-ink-soft">
              <div className="text-center">
                <p className="text-[12px] font-medium text-ink">SPICE GARDEN</p>
                <p className="mt-0.5 text-[9.5px] text-muted">Sathorn · Bangkok</p>
              </div>
              <div className="my-3 border-t border-dashed border-line" />
              <div className="flex justify-between text-[9.5px] text-muted">
                <span>BILL-SATHORN-20261125-0042</span>
                <span>PAID</span>
              </div>
              <div className="my-2 border-t border-dashed border-line" />
              <div className="space-y-1.5">
                {[
                  ['2 × ผัดไทยกุ้งสด', '358.00'],
                  ['1 × ต้มยำกุ้ง', '189.00'],
                  ['3 × ชาไทย', '195.00'],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3">
                    <span>{label}</span>
                    <span>{value}</span>
                  </div>
                ))}
              </div>
              <div className="my-2 border-t border-dashed border-line" />
              <div className="space-y-1 text-[10.5px]">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>742.00</span>
                </div>
                <div className="flex justify-between">
                  <span>Service 10%</span>
                  <span>74.20</span>
                </div>
                <div className="flex justify-between">
                  <span>VAT 7% incl.</span>
                  <span>53.40</span>
                </div>
              </div>
              <div className="my-2 border-t border-dashed border-line" />
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] uppercase tracking-[0.1em] text-muted">Total</span>
                <span className="text-[20px] text-ink">฿816.20</span>
              </div>
              <p className="mt-3 text-[8.5px] leading-relaxed text-muted-soft">
                Sales receipt, not a Thai e-Tax invoice. Illustrative demo values.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-5 py-16">
          <div className="bg-night px-6 py-12 text-[#e9e3d6] sm:px-10">
            <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
              <div>
                <h2 className="max-w-[18ch] font-display text-[32px] leading-[1.04] text-white sm:text-[40px]">
                  Take the whole service loop.
                </h2>
                <p className="mt-3 max-w-xl text-[12.5px] leading-relaxed text-[#a49a88]">
                  Sign in as the owner, open the floor, scan a table on your phone, work the order through the
                  kitchen and settle the check. Thirty days of trading history sits behind it.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <Link
                  href="/login"
                  className="group inline-flex h-10 items-center justify-center gap-2 border border-[#d8b978] px-5 text-[12.5px] font-medium text-[#f2e7ce] transition-colors hover:bg-[#d8b978] hover:text-night"
                >
                  Enter the demo
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/menu/demo-sathorn-t03-4f8c2a91"
                  className="inline-flex h-10 items-center justify-center border border-[#3a3327] px-5 text-[12.5px] text-[#c9c0ad] transition-colors hover:border-[#6d5a2f] hover:text-white"
                >
                  Guest menu
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line py-6">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 text-[11px] text-muted">
          <span className="font-display text-[15px] text-ink">TableTap</span>
          <span className="max-w-md leading-relaxed">
            PromptPay QR generation requests payment; a cashier or verified provider confirms it.
          </span>
          <span className="text-muted-soft">Next.js · NestJS · PostgreSQL · Socket.IO</span>
        </div>
      </footer>
    </div>
  );
}
