import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowUpRight, Printer, ReceiptText } from 'lucide-react';
import { requireSession, hasPermission } from '@/lib/auth';
import { serverApi } from '@/lib/api-server';
import { cn, formatDateTime, formatTHB, plural } from '@/lib/utils';
import type { BillDetail } from '@/lib/types';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/badge';
import { BillReceiptButton } from './bill-receipt-button';

export const metadata: Metadata = { title: 'Bill' };
export const dynamic = 'force-dynamic';

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  PROMPTPAY: 'PromptPay',
  OTHER: 'Other',
};

function Leader({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn('flex items-baseline gap-2', strong ? 'text-[13px] font-semibold' : 'text-[11.5px]')}>
      <span className={strong ? 'text-ink' : 'text-muted'}>{label}</span>
      <span className="flex-1 border-b border-dotted border-line-strong/70" />
      <span className={cn('money', strong ? 'text-ink' : 'text-ink-soft')}>{value}</span>
    </div>
  );
}

export default async function BillDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ billId: string }>;
  searchParams: Promise<{ branch?: string }>;
}) {
  const me = await requireSession();
  if (!me.tenant) redirect('/platform/dashboard');
  if (!hasPermission(me, 'payment.read')) return <NoAccess permission="payment.read" />;
  const { billId } = await params;
  const { branch } = await searchParams;
  const branchId = branch ?? me.branches[0]?.id;

  let bill: BillDetail;
  try {
    bill = await serverApi<BillDetail>(`/bills/${billId}`);
  } catch {
    notFound();
  }

  const settled =
    bill.status === 'PAID' || bill.status === 'REFUNDED' || bill.status === 'PARTIALLY_REFUNDED';

  return (
    <div className="space-y-6">
      <PageHeader
        backHref={`/app/bills?branch=${branchId}`}
        eyebrow="Bill"
        title={bill.number}
        description={`Table ${bill.table.number} · opened ${formatDateTime(bill.createdAt)} · ${plural(bill.orders.length, 'order')}`}
        actions={
          <>
            <StatusBadge status={bill.status} className="text-[12px]" />
            {settled ? (
              <Link
                href={`/receipt/${bill.id}`}
                className="inline-flex h-9 items-center gap-1.5 border border-line px-3 text-[12px] font-medium text-ink transition-colors hover:border-line-strong hover:bg-paper-deep"
              >
                <ReceiptText className="h-3.5 w-3.5" /> Receipt
              </Link>
            ) : (
              <BillReceiptButton billId={bill.id} disabled />
            )}
            <Link
              href={`/app/pos?branch=${branchId}&session=${bill.tableSessionId}`}
              className="inline-flex h-9 items-center gap-1.5 bg-ink px-3.5 text-[12.5px] font-medium text-paper transition-colors hover:bg-ink-soft"
            >
              Open in POS <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)]">
        <section className="border border-line bg-surface-raised">
          <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-soft">
                The check
              </p>
              <p className="mt-1 font-display text-[24px] leading-none text-ink">Table {bill.table.number}</p>
            </div>
            <div className="text-right text-[10.5px] leading-relaxed text-muted">
              <p className="money">{bill.number}</p>
              <p>
                {plural(bill.orders.length, 'order')} · {plural(bill.items.length, 'line')}
              </p>
            </div>
          </header>

          <ol className="divide-y divide-line/70 px-5">
            {bill.items.map((item) => (
              <li key={item.id} className="flex items-start gap-4 py-3">
                <span className="money mt-0.5 w-7 shrink-0 text-[11px] text-muted">{item.quantity}×</span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[17px] leading-tight text-ink">
                    {item.name}
                    {item.variantName ? (
                      <span className="ml-1.5 font-sans text-[11px] text-muted">· {item.variantName}</span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted">
                    {formatTHB(item.unitPrice)} each · VAT {formatTHB(item.lineTax)}
                    {Number(item.lineDiscount) !== 0 ? ` · discount −${formatTHB(item.lineDiscount)}` : ''}
                  </p>
                </div>
                <span className="money shrink-0 text-[13px] text-ink">{formatTHB(item.lineTotal)}</span>
              </li>
            ))}
          </ol>

          <div className="space-y-1.5 border-t border-line px-5 py-4">
            <Leader label="Subtotal" value={formatTHB(bill.subtotal)} />
            {Number(bill.discountTotal) !== 0 ? (
              <Leader label="Discount" value={`− ${formatTHB(bill.discountTotal)}`} />
            ) : null}
            {Number(bill.serviceCharge) !== 0 ? (
              <Leader label="Service charge" value={formatTHB(bill.serviceCharge)} />
            ) : null}
            <Leader
              label={`VAT ${bill.taxRate}%${bill.taxInclusive ? ' (incl.)' : ''}`}
              value={formatTHB(bill.taxTotal)}
            />
            <div className="mt-2 flex items-baseline justify-between border-t-[3px] border-double border-ink/70 pt-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink">Total</span>
              <span className="money text-[26px] leading-none text-ink">{formatTHB(bill.total)}</span>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="border border-line bg-surface-raised">
            <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-soft">
                Settlement
              </p>
              <StatusBadge status={bill.status} />
            </header>
            <div className="px-4 py-4">
              <p className="text-[9.5px] uppercase tracking-[0.14em] text-muted-soft">Balance due</p>
              <p
                className={cn(
                  'money mt-1 text-[30px] leading-none',
                  Number(bill.due) > 0 ? 'text-brand' : 'text-success',
                )}
              >
                {formatTHB(bill.due)}
              </p>
              <div className="mt-3 space-y-1.5">
                <Leader label="Bill total" value={formatTHB(bill.total)} />
                <Leader label="Paid" value={formatTHB(bill.paidTotal)} />
                {Number(bill.pendingTotal) !== 0 ? (
                  <Leader label="Pending" value={formatTHB(bill.pendingTotal)} />
                ) : null}
              </div>
            </div>

            <div className="border-t border-line px-4 py-3">
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-soft">Payments</p>
              {bill.payments.length === 0 ? (
                <p className="mt-2 text-[11.5px] text-muted">No payments recorded yet.</p>
              ) : (
                <ul className="mt-2 divide-y divide-line/70">
                  {bill.payments.map((payment) => (
                    <li key={payment.id} className="py-2">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-[12px] font-medium text-ink">
                          {METHOD_LABEL[payment.method] ?? payment.method}
                        </span>
                        <span className="money text-[12px] text-ink">{formatTHB(payment.amountPaid)}</span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-[9px] text-muted">{payment.reference}</span>
                        <StatusBadge status={payment.status} />
                      </div>
                      {payment.confirmedAt ? (
                        <p className="mt-0.5 text-[9.5px] text-muted-soft">
                          confirmed {formatDateTime(payment.confirmedAt)}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {bill.splits.length > 0 ? (
            <section className="border border-line bg-surface-raised">
              <header className="border-b border-line px-4 py-3">
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-soft">Split</p>
              </header>
              <ul className="divide-y divide-line/70 px-4">
                {bill.splits.map((split) => (
                  <li key={split.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div>
                      <p className="text-[12px] font-medium text-ink">{split.label}</p>
                      <p className="money text-[10px] text-muted">{formatTHB(split.amount)}</p>
                    </div>
                    <StatusBadge status={split.status} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="border border-line bg-surface-raised">
            <header className="border-b border-line px-4 py-3">
              <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-soft">
                Orders on this bill
              </p>
            </header>
            <ul className="divide-y divide-line/70 px-4">
              {bill.orders.map((order) => (
                <li key={order.id} className="flex items-center justify-between gap-3 py-2.5">
                  <Link
                    href={`/app/orders/${order.id}?branch=${branchId}`}
                    className="money text-[11.5px] font-medium text-ink hover:text-brand"
                  >
                    {order.number}
                  </Link>
                  <StatusBadge status={order.status} />
                </li>
              ))}
            </ul>
          </section>

          <section className="border border-line bg-surface-raised px-4 py-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-soft">Receipt</p>
            {bill.receipt ? (
              <>
                <p className="money mt-1.5 text-[11.5px] text-ink-soft">{bill.receipt.number}</p>
                <p className="text-[10px] text-muted">issued {formatDateTime(bill.receipt.issuedAt)}</p>
                <Link
                  href={`/receipt/${bill.id}`}
                  className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline"
                >
                  <Printer className="h-3 w-3" /> Open the printable receipt
                </Link>
              </>
            ) : (
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                {settled
                  ? 'A receipt is created the first time you open it.'
                  : 'Available once the bill is paid.'}
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
