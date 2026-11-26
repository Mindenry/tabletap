import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import { requireSession, hasPermission } from '@/lib/auth';
import { serverApi } from '@/lib/api-server';
import { formatDateTime, formatTHB, cn } from '@/lib/utils';
import type { OrderRow } from '@/lib/types';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, InlineError } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR, TableEmpty, TableWrap } from '@/components/ui/table';

export const metadata: Metadata = { title: 'Orders' };
export const dynamic = 'force-dynamic';

const FILTERS = ['ALL', 'PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'CANCELLED'] as const;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; status?: string; session?: string; search?: string }>;
}) {
  const me = await requireSession();
  if (!me.tenant) redirect('/platform/dashboard');
  if (!hasPermission(me, 'order.read')) return <NoAccess permission="order.read" />;
  const params = await searchParams;
  const branchId = params.branch ?? me.branches[0]?.id;
  if (!branchId) return <EmptyState title="No branch" />;
  const status =
    params.status && FILTERS.includes(params.status as (typeof FILTERS)[number]) ? params.status : 'ALL';

  const query = new URLSearchParams({ branchId, limit: '100' });
  if (status !== 'ALL') query.set('status', status);
  if (params.session) query.set('tableSessionId', params.session);
  if (params.search) query.set('search', params.search);

  let orders: OrderRow[] = [];
  let error: string | null = null;
  try {
    orders = await serverApi<OrderRow[]>(`/orders?${query.toString()}`);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : 'Could not load orders';
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Service"
        title="Orders"
        description="Every order is persisted before it reaches the kitchen, with an append-only event history."
      />
      {error ? <InlineError>{error}</InlineError> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex max-w-full flex-wrap border border-line bg-surface-raised">
          {FILTERS.map((filter, index) => (
            <Link
              key={filter}
              href={`/app/orders?branch=${branchId}${filter === 'ALL' ? '' : `&status=${filter}`}`}
              className={cn(
                'border-line px-3 py-1.5 text-[11.5px] font-medium transition-colors',
                index < FILTERS.length - 1 && 'border-r',
                status === filter ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-paper-deep hover:text-ink',
              )}
            >
              {filter === 'ALL' ? 'All' : filter.toLowerCase()}
            </Link>
          ))}
        </div>
        <form action="/app/orders" className="flex items-center gap-2">
          <input type="hidden" name="branch" value={branchId} />
          {status !== 'ALL' ? <input type="hidden" name="status" value={status} /> : null}
          <input
            name="search"
            defaultValue={params.search}
            placeholder="Order or table number"
            aria-label="Search orders"
            className="h-9 w-56 rounded-md border border-line bg-surface px-3 text-[12px] focus:border-brand focus:outline-none"
          />
          <button
            type="submit"
            className="h-9 rounded-md border border-line-strong bg-surface px-3 text-[12px] font-medium hover:bg-paper-deep"
          >
            Search
          </button>
        </form>
      </div>

      {orders.length === 0 ? (
        <EmptyState
          title="No orders in this view"
          description="Once a guest submits an order it appears here immediately."
          icon={<ClipboardList className="h-7 w-7" />}
        />
      ) : (
        <div className="space-y-2">
          <TableWrap>
            <Table className="min-w-[860px]">
              <THead>
                <TR>
                  <TH>Order</TH>
                  <TH>Table</TH>
                  <TH>Status</TH>
                  <TH>Source</TH>
                  <TH>Bill</TH>
                  <TH className="text-right">Items</TH>
                  <TH className="text-right">Total</TH>
                  <TH className="text-right">Created</TH>
                </TR>
              </THead>
              <TBody>
                {orders.map((order) => (
                  <TR key={order.id}>
                    <TD>
                      <Link
                        href={`/app/orders/${order.id}?branch=${branchId}`}
                        className="whitespace-nowrap font-medium text-ink hover:text-brand"
                      >
                        {order.number}
                      </Link>
                    </TD>
                    <TD className="whitespace-nowrap">Table {order.table.number}</TD>
                    <TD>
                      <StatusBadge status={order.status} />
                    </TD>
                    <TD className="whitespace-nowrap text-[12px]">
                      {order.source === 'CUSTOMER_QR' ? 'Guest QR' : 'Staff POS'}
                    </TD>
                    <TD className="whitespace-nowrap text-[12px]">
                      {order.bill ? (
                        <span className={order.bill.status === 'PAID' ? 'text-success' : 'text-gold'}>
                          {order.bill.number}
                        </span>
                      ) : (
                        <span className="text-muted">Unbilled</span>
                      )}
                    </TD>
                    <TD className="text-right tabular">{order.itemCount}</TD>
                    <TD className="whitespace-nowrap text-right tabular">{formatTHB(order.total)}</TD>
                    <TD className="whitespace-nowrap text-right text-[12px] text-muted">
                      {formatDateTime(order.createdAt)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
          {orders.length >= 100 ? (
            <p className="text-[11px] text-muted">
              Showing the latest 100 orders. Narrow the list with a status filter or a search.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
