import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Download } from 'lucide-react';
import { requireSession, hasPermission } from '@/lib/auth';
import { serverApi } from '@/lib/api-server';
import { formatTHB, plural } from '@/lib/utils';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, InlineError } from '@/components/ui/card';
import { PrintButton } from './print-button';

export const metadata: Metadata = { title: 'Day close' };
export const dynamic = 'force-dynamic';

interface DayClose {
  businessDate: string;
  timezone: string;
  period: { from: string; to: string };
  branch: { id: string; name: string };
  grossSales: string;
  refunds: string;
  netSales: string;
  vat: string;
  serviceCharge: string;
  discounts: string;
  paidBills: number;
  averageBill: string;
  orders: number;
  cancelledOrders: number;
  payments: Array<{ method: string; total: string; count: number }>;
  cashCollected: string;
  openBills: { count: number; due: string };
  openSessions: number;
}

const todayInBangkok = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const isDate = (value?: string) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

export default async function DayClosePage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; date?: string }>;
}) {
  const me = await requireSession();
  if (!me.tenant) redirect('/platform/dashboard');
  if (!hasPermission(me, 'payment.read') && !hasPermission(me, 'analytics.read')) {
    return <NoAccess permission="payment.read" />;
  }
  const params = await searchParams;
  const branchId = params.branch ?? me.branches[0]?.id;
  if (!branchId) return <EmptyState title="No branch" />;
  const date = isDate(params.date) ? params.date! : todayInBangkok();

  let report: DayClose | null = null;
  let error: string | null = null;
  try {
    report = await serverApi<DayClose>(
      `/analytics/day-close?${new URLSearchParams({ branchId, date }).toString()}`,
    );
  } catch (caught) {
    error = caught instanceof Error ? caught.message : 'Could not load the day close';
  }

  const exportHref = `/app/exports/bills?${new URLSearchParams({
    branchId,
    from: new Date(`${date}T00:00:00+07:00`).toISOString(),
    to: new Date(new Date(`${date}T00:00:00+07:00`).getTime() + 24 * 60 * 60 * 1000).toISOString(),
  }).toString()}`;

  return (
    <div className="space-y-6">
      <div className="no-print">
        <PageHeader
          eyebrow="Money"
          title="Day close"
          description="One restaurant day in Asia/Bangkok, derived from settled bills, confirmed payments and recorded refunds."
          actions={
            <>
              <PrintButton />
              <a
                href={exportHref}
                className="inline-flex h-9 items-center gap-1.5 border border-line px-3 text-[12px] font-medium text-ink transition-colors hover:border-line-strong hover:bg-paper-deep"
              >
                <Download className="h-3.5 w-3.5" /> Bills CSV
              </a>
            </>
          }
        />
      </div>

      {error ? <InlineError>{error}</InlineError> : null}

      <form action="/app/day-close" className="no-print flex flex-wrap items-end gap-2">
        <input type="hidden" name="branch" value={branchId} />
        <label className="flex flex-col gap-1">
          <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-soft">
            Business date
          </span>
          <input
            type="date"
            name="date"
            defaultValue={date}
            className="h-9 rounded-md border border-line bg-surface px-2 text-[12px] focus:border-brand focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="h-9 border border-line-strong bg-surface px-3 text-[12px] font-medium hover:bg-paper-deep"
        >
          Apply
        </button>
        {date !== todayInBangkok() ? (
          <a
            href={`/app/day-close?branch=${branchId}`}
            className="h-9 px-1 text-[11.5px] leading-9 text-muted hover:text-ink"
          >
            Today
          </a>
        ) : null}
      </form>

      {report ? (
        <>
          <div className="metric-band -mx-4 sm:-mx-6 lg:-mx-8">
            <div className="metric-cell px-4 sm:px-6 lg:px-8">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Gross sales</p>
              <p className="money mt-2 text-[26px] leading-none text-brand sm:text-[30px]">
                {formatTHB(report.grossSales)}
              </p>
              <p className="mt-2 text-[11px] text-muted">{plural(report.paidBills, 'settled bill')}</p>
            </div>
            <div className="metric-cell px-4 sm:px-6 lg:px-8">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Refunds</p>
              <p className="money mt-2 text-[26px] leading-none text-danger sm:text-[30px]">
                {formatTHB(report.refunds)}
              </p>
              <p className="mt-2 text-[11px] text-muted">Recorded today</p>
            </div>
            <div className="metric-cell px-4 sm:px-6 lg:px-8">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Net sales</p>
              <p className="money mt-2 text-[26px] leading-none text-ink sm:text-[30px]">
                {formatTHB(report.netSales)}
              </p>
              <p className="mt-2 text-[11px] text-muted">Gross minus refunds</p>
            </div>
            <div className="metric-cell px-4 sm:px-6 lg:px-8">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                Cash collected
              </p>
              <p className="money mt-2 text-[26px] leading-none text-olive sm:text-[30px]">
                {formatTHB(report.cashCollected)}
              </p>
              <p className="mt-2 text-[11px] text-muted">Count the drawer against this</p>
            </div>
          </div>

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <section>
              <div className="flex items-end justify-between gap-3 border-b border-line pb-2">
                <h2 className="text-[14px] font-semibold text-ink">Settlement</h2>
                <span className="money text-[11px] text-muted">{report.businessDate}</span>
              </div>
              <dl className="divide-y divide-line text-[12.5px]">
                {[
                  ['Gross sales', formatTHB(report.grossSales)],
                  ['VAT included', formatTHB(report.vat)],
                  ['Service charge', formatTHB(report.serviceCharge)],
                  ['Discounts', formatTHB(report.discounts)],
                  ['Refunds', formatTHB(report.refunds)],
                  ['Average bill', formatTHB(report.averageBill)],
                  ['Orders', plural(report.orders, 'order')],
                  ['Cancelled orders', String(report.cancelledOrders)],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-4 py-2.5">
                    <dt className="text-muted">{label}</dt>
                    <dd className="money text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section>
              <div className="flex items-end justify-between gap-3 border-b border-line pb-2">
                <h2 className="text-[14px] font-semibold text-ink">Payments taken</h2>
                <span className="text-[11px] text-muted">{plural(report.payments.length, 'method')}</span>
              </div>
              {report.payments.length === 0 ? (
                <p className="py-6 text-[12px] text-muted">No payments were confirmed on this day.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {report.payments.map((payment) => (
                    <li key={payment.method} className="flex items-baseline justify-between gap-4 py-2.5">
                      <div>
                        <p className="text-[12.5px] font-medium text-ink">
                          {payment.method.replace(/_/g, ' ')}
                        </p>
                        <p className="text-[10.5px] text-muted">{plural(payment.count, 'payment')}</p>
                      </div>
                      <span className="money text-[13px] text-ink">{formatTHB(payment.total)}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-6 flex items-end justify-between gap-3 border-b border-line pb-2">
                <h2 className="text-[14px] font-semibold text-ink">Still open</h2>
                <span className="text-[11px] text-muted">Not part of today&apos;s sales</span>
              </div>
              <dl className="divide-y divide-line text-[12.5px]">
                <div className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="text-muted">Unsettled bills</dt>
                  <dd className="money text-ink">{plural(report.openBills.count, 'bill')}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="text-muted">Outstanding</dt>
                  <dd className="money text-gold">{formatTHB(report.openBills.due)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="text-muted">Open table sessions</dt>
                  <dd className="money text-ink">{report.openSessions}</dd>
                </div>
              </dl>
            </section>
          </div>

          <p className="border-t border-line pt-3 text-[11px] leading-relaxed text-muted">
            Sales count bills that were paid on this business date; refunds count when they were recorded.
            Cash collected is the sum of confirmed cash payments and is what the drawer should hold before any
            petty cash. Nothing here moves money.
          </p>
        </>
      ) : null}
    </div>
  );
}
