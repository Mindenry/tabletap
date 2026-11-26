import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireSession, hasPermission } from '@/lib/auth';
import { serverApi } from '@/lib/api-server';
import { formatDateTime, formatTHB, plural } from '@/lib/utils';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, InlineError } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { OrderActions } from './order-actions';

export const metadata: Metadata = { title: 'Order' };
export const dynamic = 'force-dynamic';

interface OrderDetail {
  id: string;
  number: string;
  status: string;
  source: string;
  table: { id: string; number: string; name: string | null };
  tableSessionId: string;
  subtotal: string;
  discountTotal: string;
  serviceCharge: string;
  taxTotal: string;
  total: string;
  note: string | null;
  createdAt: string;
  acceptedAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  items: Array<{
    id: string;
    name: string;
    variantName: string | null;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
    status: string;
    note: string | null;
    modifiers: Array<{ groupName: string; name: string; priceDelta: string }>;
  }>;
  events: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    actorType: string;
    reason: string | null;
    createdAt: string;
  }>;
  tickets: Array<{
    id: string;
    number: string;
    status: string;
    station: { name: string; code: string };
    rejectReason: string | null;
    items: Array<{ orderItemId: string; status: string }>;
  }>;
  bills: Array<{ id: string; number: string; status: string; total: string }>;
  cancellation: { reason: string; refundRequired: boolean; inventoryReversed: boolean } | null;
}

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ branch?: string }>;
}) {
  const me = await requireSession();
  if (!me.tenant) redirect('/platform/dashboard');
  if (!hasPermission(me, 'order.read')) return <NoAccess permission="order.read" />;
  const { orderId } = await params;
  const { branch } = await searchParams;

  let order: OrderDetail;
  try {
    order = await serverApi<OrderDetail>(`/orders/${orderId}`);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-5">
      <PageHeader
        backHref={`/app/orders?branch=${branch ?? me.branches[0]?.id}`}
        eyebrow={`Order · ${order.source === 'CUSTOMER_QR' ? 'Guest QR' : 'Staff POS'}`}
        title={order.number}
        description={`Table ${order.table.number} · created ${formatDateTime(order.createdAt)} · ${plural(order.items.length, 'line')}`}
        actions={<StatusBadge status={order.status} className="text-[12px]" />}
      />

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
              <span className="tabular text-[15px] font-semibold">{formatTHB(order.total)}</span>
            </CardHeader>
            <CardContent className="pt-3">
              <ul className="divide-y divide-line">
                {order.items.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium">
                        {item.quantity} × {item.name}
                        {item.variantName ? <span className="text-muted"> · {item.variantName}</span> : null}
                      </p>
                      {item.modifiers.length > 0 ? (
                        <p className="text-[11px] text-muted">
                          {item.modifiers.map((modifier) => modifier.name).join(' · ')}
                        </p>
                      ) : null}
                      {item.note ? <p className="text-[11px] text-gold">{item.note}</p> : null}
                      <p className="text-[10px] uppercase tracking-wide text-muted">
                        {item.status.toLowerCase()}
                      </p>
                    </div>
                    <span className="shrink-0 tabular text-[13px]">{formatTHB(item.lineTotal)}</span>
                  </li>
                ))}
              </ul>

              <dl className="mt-3 space-y-1 border-t border-line pt-3 text-[12px]">
                <div className="flex justify-between">
                  <dt className="text-muted">Subtotal</dt>
                  <dd className="tabular">{formatTHB(order.subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Discount</dt>
                  <dd className="tabular">−{formatTHB(order.discountTotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Service charge</dt>
                  <dd className="tabular">{formatTHB(order.serviceCharge)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">VAT</dt>
                  <dd className="tabular">{formatTHB(order.taxTotal)}</dd>
                </div>
                <div className="flex justify-between border-t border-line pt-2 text-[14px] font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular">{formatTHB(order.total)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Kitchen routing</CardTitle>
            </CardHeader>
            <CardContent className="pt-3">
              {order.tickets.length === 0 ? (
                <p className="text-[12px] text-muted">No tickets (order cancelled before routing).</p>
              ) : (
                <ul className="space-y-2">
                  {order.tickets.map((ticket) => (
                    <li
                      key={ticket.id}
                      className="flex items-center justify-between rounded-md border border-line px-3 py-2"
                    >
                      <div>
                        <p className="text-[12px] font-medium">{ticket.station.name}</p>
                        <p className="text-[11px] text-muted">
                          {ticket.number} · {plural(ticket.items.length, 'item')}
                        </p>
                        {ticket.rejectReason ? (
                          <p className="text-[11px] text-danger">{ticket.rejectReason}</p>
                        ) : null}
                      </div>
                      <StatusBadge status={ticket.status} />
                    </li>
                  ))}
                </ul>
              )}
              {order.cancellation ? (
                <div className="mt-3 rounded-md border border-danger/25 bg-danger-soft px-3 py-2 text-[11px] text-danger">
                  Cancelled: {order.cancellation.reason} · stock reversed:{' '}
                  {order.cancellation.inventoryReversed ? 'yes' : 'no'}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <OrderActions
            orderId={order.id}
            status={order.status}
            branchId={branch ?? me.branches[0]?.id ?? ''}
            canKitchen={hasPermission(me, 'kitchen.update')}
            canServe={hasPermission(me, 'table.update') || hasPermission(me, 'kitchen.update')}
            canCancel={hasPermission(me, 'order.cancel')}
          />

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent className="pt-3">
              <ol className="space-y-3">
                {order.events.map((event) => (
                  <li key={event.id} className="relative border-l border-line pl-3">
                    <span className="absolute -left-[3px] top-1.5 h-1.5 w-1.5 rounded-full bg-brand" />
                    <p className="text-[12px] font-medium">
                      {event.fromStatus ? `${event.fromStatus} → ` : ''}
                      {event.toStatus}
                    </p>
                    <p className="text-[11px] text-muted">
                      {event.actorType.toLowerCase()} · {formatDateTime(event.createdAt)}
                    </p>
                    {event.reason ? <p className="text-[11px] text-muted">{event.reason}</p> : null}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          {order.bills.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Bill</CardTitle>
              </CardHeader>
              <CardContent className="pt-3">
                {order.bills.map((bill) => (
                  <div key={bill.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-[12px] font-medium">{bill.number}</p>
                      <p className="text-[11px] text-muted">{formatTHB(bill.total)}</p>
                    </div>
                    <StatusBadge status={bill.status} />
                  </div>
                ))}
                <Link
                  href={`/app/pos?branch=${branch ?? me.branches[0]?.id}&session=${order.tableSessionId}`}
                  className="mt-3 inline-flex text-[11px] font-medium text-brand hover:underline"
                >
                  Open session in POS
                </Link>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {order.note ? <InlineError>Order note: {order.note}</InlineError> : null}
    </div>
  );
}
