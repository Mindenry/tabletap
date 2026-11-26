import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, ArrowRight, ClipboardList, Download } from 'lucide-react';
import { requireSession, hasPermission } from '@/lib/auth';
import { serverApi } from '@/lib/api-server';
import { cn, formatDateTime, formatTHB, plural } from '@/lib/utils';
import type { OrderRow } from '@/lib/types';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, InlineError } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/table';

export const metadata: Metadata = { title: 'Orders' };
export const dynamic = 'force-dynamic';

const FILTERS = ['ALL', 'PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'CANCELLED'] as const;
const PAGE_SIZE = 50;
const DAY = 24 * 60 * 60 * 1000;

const isDate = (value?: string) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));

/** A date input is a Bangkok calendar day; the API compares instants. */
function dayStart(value?: string): string | undefined {
  return isDate(value) ? new Date(`${value}T00:00:00+07:00`).toISOString() : undefined;
}

function dayEndExclusive(value?: string): string | undefined {
  return isDate(value)
    ? new Date(new Date(`${value}T00:00:00+07:00`).getTime() + DAY).toISOString()
    : undefined;
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    branch?: string;
    status?: string;
    session?: string;
    search?: string;
    from?: string;
    to?: string;
    offset?: string;
  }>;
}) {
  const me = await requireSession();
  if (!me.tenant) redirect('/platform/dashboard');
  if (!hasPermission(me, 'order.read')) return <NoAccess permission="order.read" />;
  const params = await searchParams;
  const branchId = params.branch ?? me.branches[0]?.id;
  if (!branchId) return <EmptyState title="No branch" />;
  const status =
    params.status && FILTERS.includes(params.status as (typeof FILTERS)[number]) ? params.status : 'ALL';
  const offset = Math.max(0, Number(params.offset ?? 0) || 0);

  const query = new URLSearchParams({ branchId, limit: String(PAGE_SIZE), offset: String(offset) });
  if (status !== 'ALL') query.set('status', status);
  if (params.session) query.set('tableSessionId', params.session);
  if (params.search) query.set('search', params.search);
  const from = dayStart(params.from);
  const to = dayEndExclusive(params.to);
  if (from) query.set('from', from);
  if (to) query.set('to', to);

  let orders: OrderRow[] = [];
  let error: string | null = null;
  try {
    orders = await serverApi<OrderRow[]>(`/orders?${query.toString()}`);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : 'Could not load orders';
  }

  function href(overrides: Record<string, string | number | undefined>) {
    const next = new URLSearchParams();
    const values = {
      branch: branchId,
      status: status === 'ALL' ? undefined : status,
      search: params.search,
      from: params.from,
      to: params.to,
      offset: offset === 0 ? undefined : String(offset),
      ...overrides,
    };
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined && value !== '') next.set(key, String(value));
    }
    return `/app/orders?${next.toString()}`;
  }

  const exportHref = `/app/exports/orders?${new URLSearchParams({
    branchId,
    ...(status !== 'ALL' ? { status } : {}),
    ...(params.search ? { search: params.search } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  }).toString()}`;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Service"
        title="Orders"
        description="Every order is persisted before it reaches the kitchen, with an append-only event history."
        actions={
          <a
            href={exportHref}
            className="inline-flex h-9 items-center gap-1.5 border border-line px-3 text-[12px] font-medium text-ink transition-colors hover:border-line-strong hover:bg-paper-deep"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </a>
        }
      />
      {error ? <InlineError>{error}</InlineError> : null}

      <div className="space-y-2">
        <div className="inline-flex max-w-full flex-wrap border border-line bg-surface-raised">
          {FILTERS.map((filter, index) => (
            <Link
              key={filter}
              href={href({ status: filter === 'ALL' ? undefined : filter, offset: undefined })}
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

        <form action="/app/orders" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="branch" value={branchId} />
          {status !== 'ALL' ? <input type="hidden" name="status" value={status} /> : null}
          <label className="flex flex-col gap-1">
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-soft">
              From
            </span>
            <input
              type="date"
              name="from"
              defaultValue={params.from}
              className="h-9 rounded-md border border-line bg-surface px-2 text-[12px] focus:border-brand focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-soft">To</span>
            <input
              type="date"
              name="to"
              defaultValue={params.to}
              className="h-9 rounded-md border border-line bg-surface px-2 text-[12px] focus:border-brand focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-soft">
              Search
            </span>
            <input
              name="search"
              defaultValue={params.search}
              placeholder="Order or table number"
              aria-label="Search orders"
              className="h-9 w-full rounded-md border border-line bg-surface px-3 text-[12px] focus:border-brand focus:outline-none sm:w-56"
            />
          </label>
          <button
            type="submit"
            className="h-9 border border-line-strong bg-surface px-3 text-[12px] font-medium hover:bg-paper-deep"
          >
            Apply
          </button>
          {params.from || params.to || params.search ? (
            <Link
              href={href({ from: undefined, to: undefined, search: undefined, offset: undefined })}
              className="h-9 px-1 text-[11.5px] leading-9 text-muted hover:text-ink"
            >
              Clear
            </Link>
          ) : null}
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
          <div className="divide-y divide-line border border-line bg-surface-raised md:hidden">
            {orders.map((order) => (
              <Link
                key={order.id}
                href={`/app/orders/${order.id}?branch=${branchId}`}
                className="block px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="money whitespace-nowrap text-[11.5px] font-medium text-ink">
                      {order.number}
                    </p>
                    <p className="mt-0.5 text-[10.5px] text-muted">
                      Table {order.table.number} · {order.source === 'CUSTOMER_QR' ? 'Guest QR' : 'Staff POS'}
                    </p>
                    <p className="text-[10.5px] text-muted">{formatDateTime(order.createdAt)}</p>
                  </div>
                  <StatusBadge status={order.status} />
                </div>
                <div className="mt-2 flex items-baseline justify-between gap-3">
                  <span className="text-[10.5px] text-muted">{plural(order.itemCount, 'item')}</span>
                  <span className="money text-[13px] text-ink">{formatTHB(order.total)}</span>
                </div>
              </Link>
            ))}
          </div>

          <div className="hidden md:block">
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
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-muted">
              {orders.length === PAGE_SIZE
                ? `Rows ${offset + 1}–${offset + PAGE_SIZE}`
                : `${plural(orders.length, 'row')}`}
            </span>
            <div className="flex items-center gap-2">
              {offset > 0 ? (
                <Link
                  href={href({ offset: Math.max(0, offset - PAGE_SIZE) })}
                  className="inline-flex h-8 items-center gap-1 border border-line px-2.5 text-[11.5px] font-medium hover:bg-paper-deep"
                >
                  <ArrowLeft className="h-3 w-3" /> Newer
                </Link>
              ) : null}
              {orders.length === PAGE_SIZE ? (
                <Link
                  href={href({ offset: offset + PAGE_SIZE })}
                  className="inline-flex h-8 items-center gap-1 border border-line px-2.5 text-[11.5px] font-medium hover:bg-paper-deep"
                >
                  Older <ArrowRight className="h-3 w-3" />
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
