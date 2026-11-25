import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireSession, hasPermission } from '@/lib/auth';
import { serverApi } from '@/lib/api-server';
import { formatDateTime, formatTHB } from '@/lib/utils';
import type { BillDetail } from '@/lib/types';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { BillReceiptButton } from './bill-receipt-button';

export const metadata: Metadata = { title: 'Bill' };
export const dynamic = 'force-dynamic';

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

  let bill: BillDetail;
  try {
    bill = await serverApi<BillDetail>(`/bills/${billId}`);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-5">
      <PageHeader
        backHref={`/app/bills?branch=${branch ?? me.branches[0]?.id}`}
        eyebrow="Bill"
        title={bill.number}
        description={`Table ${bill.table.number} · opened ${formatDateTime(bill.createdAt)}`}
        actions={
          <>
            <StatusBadge status={bill.status} className="text-[12px]" />
            <BillReceiptButton billId={bill.id} disabled={bill.status !== 'PAID'} />
            <Link
              href={`/app/pos?branch=${branch ?? me.branches[0]?.id}&session=${bill.tableSessionId}`}
              className="inline-flex h-9 items-center rounded-md bg-ink px-3.5 text-[13px] font-medium text-paper hover:bg-ink-soft"
            >
              Open in POS
            </Link>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Items</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <ul className="divide-y divide-line">
              {bill.items.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 py-2">
                  <div>
                    <p className="text-[13px] font-medium">
                      {item.quantity} × {item.name}
                      {item.variantName ? <span className="text-muted"> · {item.variantName}</span> : null}
                    </p>
                    <p className="text-[11px] text-muted">
                      {formatTHB(item.unitPrice)} each · VAT {formatTHB(item.lineTax)}
                    </p>
                  </div>
                  <span className="tabular text-[13px]">{formatTHB(item.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1 border-t border-line pt-3 text-[12px]">
              <div className="flex justify-between">
                <dt className="text-muted">Subtotal</dt>
                <dd className="tabular">{formatTHB(bill.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Discount</dt>
                <dd className="tabular">−{formatTHB(bill.discountTotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Service charge</dt>
                <dd className="tabular">{formatTHB(bill.serviceCharge)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">VAT {bill.taxRate}%</dt>
                <dd className="tabular">{formatTHB(bill.taxTotal)}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-2 text-[15px] font-semibold">
                <dt>Total</dt>
                <dd className="tabular">{formatTHB(bill.total)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-2">
              {bill.payments.length === 0 ? (
                <p className="text-[12px] text-muted">No payments recorded.</p>
              ) : (
                bill.payments.map((payment) => (
                  <div key={payment.id} className="rounded-md border border-line px-3 py-2">
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="font-medium">{payment.method}</span>
                      <span className="tabular">{formatTHB(payment.amount)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between text-[11px] text-muted">
                      <span>{payment.reference}</span>
                      <StatusBadge status={payment.status} />
                    </div>
                    {payment.confirmedAt ? (
                      <p className="mt-0.5 text-[10px] text-muted">
                        Confirmed {formatDateTime(payment.confirmedAt)}
                      </p>
                    ) : null}
                  </div>
                ))
              )}
              <div className="flex items-center justify-between border-t border-line pt-2 text-[12px]">
                <span className="text-muted">Paid</span>
                <span className="tabular text-success">{formatTHB(bill.paidTotal)}</span>
              </div>
              <div className="flex items-center justify-between text-[13px] font-semibold">
                <span>Balance due</span>
                <span className="tabular text-brand">{formatTHB(bill.due)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Orders on this bill</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 pt-2">
              {bill.orders.map((order) => (
                <div key={order.id} className="flex items-center justify-between text-[12px]">
                  <Link
                    href={`/app/orders/${order.id}?branch=${branch ?? me.branches[0]?.id}`}
                    className="font-medium text-ink hover:text-brand"
                  >
                    {order.number}
                  </Link>
                  <StatusBadge status={order.status} />
                </div>
              ))}
            </CardContent>
          </Card>

          {bill.receipt ? (
            <p className="text-[11px] text-muted">
              Receipt {bill.receipt.number} issued {formatDateTime(bill.receipt.issuedAt)}.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
