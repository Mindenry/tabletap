import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowUpRight, CircleAlert, ClipboardList, CreditCard, Grid2x2, TrendingUp } from 'lucide-react';
import { requireSession, hasPermission } from '@/lib/auth';
import { serverApi } from '@/lib/api-server';
import { elapsedLabel, formatTHB, formatTime, plural } from '@/lib/utils';
import type { MenuPerformanceRow, OrderRow, Overview, SalesPoint, TableRow } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, EmptyState, InlineError } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { SalesChart } from '@/components/charts/sales-chart';
import { Reveal } from '@/components/motion/reveal';
import { NumberTicker } from '@/components/motion/number-ticker';
import { StatusBadge } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/table';

export const metadata: Metadata = { title: 'Overview' };
export const dynamic = 'force-dynamic';

async function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const me = await requireSession();
  if (!me.tenant) redirect('/platform/dashboard');
  const params = await searchParams;
  const branchId = params.branch ?? me.branches[0]?.id;
  if (!branchId) {
    return <EmptyState title="No branch configured" description="Create a branch in settings to begin." />;
  }

  const canSeeAnalytics = hasPermission(me, 'analytics.read');
  const canSeeOrders = hasPermission(me, 'order.read');
  const canSeeInventory = hasPermission(me, 'inventory.read');

  const chartFrom = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString();
  const chartTo = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const [overview, monthOverview, sales, tables, orders, lowStock, menuPerformance] = await Promise.all([
    canSeeAnalytics
      ? safe(serverApi<Overview>(`/analytics/overview?branchId=${branchId}`), null as Overview | null)
      : Promise.resolve(null),
    canSeeAnalytics
      ? safe(
          serverApi<Overview>(`/analytics/overview?branchId=${branchId}&from=${chartFrom}&to=${chartTo}`),
          null as Overview | null,
        )
      : Promise.resolve(null),
    canSeeAnalytics
      ? safe(
          serverApi<{
            series: SalesPoint[];
            paymentBreakdown: Array<{ method: string; total: string; count: number }>;
          }>(`/analytics/sales?branchId=${branchId}&groupBy=day&from=${chartFrom}&to=${chartTo}`),
          { series: [], paymentBreakdown: [] },
        )
      : Promise.resolve({ series: [], paymentBreakdown: [] }),
    safe(serverApi<TableRow[]>(`/branches/${branchId}/tables`), [] as TableRow[]),
    canSeeOrders
      ? safe(serverApi<OrderRow[]>(`/orders?branchId=${branchId}&limit=7`), [] as OrderRow[])
      : Promise.resolve([] as OrderRow[]),
    canSeeInventory
      ? safe(
          serverApi<
            Array<{ id: string; name: string; unit: string; currentStock: string; minStock: string }>
          >(`/inventory/low-stock?branchId=${branchId}`),
          [],
        )
      : Promise.resolve([]),
    canSeeAnalytics
      ? safe(
          serverApi<MenuPerformanceRow[]>(
            `/analytics/menu-performance?branchId=${branchId}&from=${chartFrom}&to=${chartTo}&limit=5`,
          ),
          [] as MenuPerformanceRow[],
        )
      : Promise.resolve([] as MenuPerformanceRow[]),
  ]);

  const seated = tables.filter((table) => table.session);
  const openRequests = tables.reduce((acc, table) => acc + (table.session?.openRequests ?? 0), 0);
  const branch = me.branches.find((candidate) => candidate.id === branchId);
  const today = new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'full',
    timeZone: 'Asia/Bangkok',
  }).format(new Date());

  return (
    <div className="space-y-7">
      <PageHeader
        title="Service overview"
        description={`${branch?.name ?? 'Branch'} · ${today}`}
        actions={
          <>
            <Link
              href={`/app/tables?branch=${branchId}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line bg-transparent px-3 text-[12.5px] font-medium text-ink transition-colors hover:border-line-strong hover:bg-paper-deep"
            >
              <Grid2x2 className="h-3.5 w-3.5" />
              Floor plan
            </Link>
            {hasPermission(me, 'bill.create') ? (
              <Link
                href={`/app/pos?branch=${branchId}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-ink px-3.5 text-[12.5px] font-medium text-paper transition-colors hover:bg-ink-soft"
              >
                <CreditCard className="h-3.5 w-3.5" />
                Open POS
              </Link>
            ) : null}
          </>
        }
      />

      {!canSeeAnalytics ? (
        <InlineError>
          Your role does not include analytics access. Operational counts below remain scoped to your branch.
        </InlineError>
      ) : null}

      {canSeeAnalytics ? (
        <Reveal>
          <div className="metric-band -mx-4 sm:-mx-6 lg:-mx-8">
            <div className="metric-cell px-4 sm:px-6 lg:px-8">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                Gross sales · 30 days
              </p>
              <p className="money mt-2 text-[26px] leading-none text-brand sm:text-[30px]">
                <NumberTicker value={Number(monthOverview?.grossSales ?? 0)} format="currency" />
              </p>
              <p className="mt-2 text-[11px] text-muted">
                Today {formatTHB(overview?.grossSales ?? '0.00')} · {plural(overview?.paidBills ?? 0, 'bill')}
              </p>
            </div>
            <div className="metric-cell px-4 sm:px-6 lg:px-8">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                Orders · 30 days
              </p>
              <p className="money mt-2 text-[26px] leading-none text-ink sm:text-[30px]">
                <NumberTicker value={monthOverview?.orders ?? 0} format="number" />
              </p>
              <p className="mt-2 text-[11px] text-muted">
                Today {overview?.orders ?? 0} · {monthOverview?.cancelledOrders ?? 0} cancelled
              </p>
            </div>
            <div className="metric-cell px-4 sm:px-6 lg:px-8">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                Average bill · 30 days
              </p>
              <p className="money mt-2 text-[26px] leading-none text-gold sm:text-[30px]">
                <NumberTicker value={Number(monthOverview?.averageOrderValue ?? 0)} format="currency" />
              </p>
              <p className="mt-2 text-[11px] text-muted">
                VAT {formatTHB(monthOverview?.vatTotal ?? '0.00')} · service{' '}
                {formatTHB(monthOverview?.serviceChargeTotal ?? '0.00')}
              </p>
            </div>
            <div className="metric-cell px-4 sm:px-6 lg:px-8">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                Tables seated
              </p>
              <p className="money mt-2 text-[26px] leading-none text-olive sm:text-[30px]">
                <NumberTicker value={seated.length} format="number" />
                <span className="ml-1 text-[15px] text-muted-soft">/ {tables.length}</span>
              </p>
              <p className="mt-2 text-[11px] text-muted">{openRequests} open guest request(s)</p>
            </div>
          </div>
        </Reveal>
      ) : null}

      <Reveal delay={80}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Sales, last 30 days</CardTitle>
                <p className="mt-0.5 text-[11.5px] text-muted">
                  {monthOverview
                    ? `${monthOverview.paidBills} settled bills · ${formatTHB(monthOverview.grossSales)} gross`
                    : 'No settled bills yet'}
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.1em] text-success">
                <TrendingUp className="h-3.5 w-3.5" /> Paid revenue
              </span>
            </CardHeader>
            <CardContent className="pt-4">
              <SalesChart data={sales.series} height={300} />
            </CardContent>
          </Card>

          <div className="space-y-5">
            <section>
              <div className="flex items-end justify-between gap-3 border-b border-line pb-2">
                <h2 className="text-[14px] font-semibold text-ink">Service now</h2>
                <Link
                  href={`/app/tables?branch=${branchId}`}
                  className="inline-flex items-center gap-1 text-[10.5px] font-medium text-brand hover:underline"
                >
                  Floor <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
              {seated.length === 0 ? (
                <p className="py-6 text-[12px] text-muted">No tables are seated right now.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {seated.slice(0, 5).map((table) => (
                    <li key={table.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-medium text-ink">Table {table.number}</p>
                        <p className="text-[10.5px] text-muted">
                          {elapsedLabel(table.session!.openedAt)} ·{' '}
                          {plural(table.session!.orderCount, 'order')}
                          {table.session!.openRequests > 0
                            ? ` · ${plural(table.session!.openRequests, 'request')}`
                            : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="money text-[12px] text-ink-soft">
                          {formatTHB(table.session!.outstandingTotal)}
                        </span>
                        <StatusBadge status={table.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <div className="flex items-end justify-between gap-3 border-b border-line pb-2">
                <h2 className="text-[14px] font-semibold text-ink">Needs attention</h2>
                {canSeeInventory ? (
                  <Link
                    href={`/app/inventory?branch=${branchId}`}
                    className="text-[10.5px] font-medium text-brand hover:underline"
                  >
                    Stock
                  </Link>
                ) : null}
              </div>
              <div className="space-y-2 pt-2">
                {openRequests > 0 ? (
                  <Link
                    href={`/app/requests?branch=${branchId}`}
                    className="flex items-center gap-2 border border-gold/30 bg-gold-soft px-2.5 py-2 text-[11.5px] text-gold"
                  >
                    <CircleAlert className="h-3.5 w-3.5" />
                    {openRequests} guest request(s) waiting
                  </Link>
                ) : null}
                {canSeeInventory && lowStock.length > 0 ? (
                  <div className="border border-danger/25 bg-danger-soft px-2.5 py-2">
                    <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-danger">
                      <CircleAlert className="h-3.5 w-3.5" /> {lowStock.length} ingredient(s) low
                    </p>
                    <p className="mt-0.5 text-[10.5px] text-danger/80">
                      {lowStock
                        .slice(0, 3)
                        .map((item) => item.name)
                        .join(', ')}
                    </p>
                  </div>
                ) : null}
                {openRequests === 0 && (!canSeeInventory || lowStock.length === 0) ? (
                  <p className="py-2 text-[12px] text-muted">Nothing needs attention. Service is calm.</p>
                ) : null}
              </div>
            </section>
          </div>
        </div>
      </Reveal>

      <Reveal delay={140}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
          <div>
            <div className="flex items-end justify-between gap-3 border-b border-line pb-2">
              <h2 className="text-[14px] font-semibold text-ink">Recent orders</h2>
              {canSeeOrders ? (
                <Link
                  href={`/app/orders?branch=${branchId}`}
                  className="inline-flex items-center gap-1 text-[10.5px] font-medium text-brand hover:underline"
                >
                  All orders <ArrowUpRight className="h-3 w-3" />
                </Link>
              ) : null}
            </div>
            {orders.length === 0 ? (
              <div className="py-6">
                <EmptyState
                  title="No orders yet today"
                  description="Scan a table QR or open the POS to create the first order."
                  icon={<ClipboardList className="h-6 w-6" />}
                />
              </div>
            ) : (
              <TableWrap className="rounded-none border-x-0 border-t-0">
                <Table className="min-w-[620px]">
                  <THead>
                    <TR>
                      <TH>Order</TH>
                      <TH>Table</TH>
                      <TH>Status</TH>
                      <TH className="text-right">Total</TH>
                      <TH className="text-right">Time</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {orders.map((order) => (
                      <TR key={order.id}>
                        <TD>
                          <Link
                            href={`/app/orders/${order.id}?branch=${branchId}`}
                            className="money text-[12px] font-medium text-ink hover:text-brand"
                          >
                            {order.number}
                          </Link>
                          <p className="text-[10.5px] text-muted">
                            {plural(order.itemCount, 'item')} ·{' '}
                            {order.source === 'CUSTOMER_QR' ? 'Guest QR' : 'Staff POS'}
                          </p>
                        </TD>
                        <TD>Table {order.table.number}</TD>
                        <TD>
                          <StatusBadge status={order.status} />
                        </TD>
                        <TD className="money text-right text-[12px]">{formatTHB(order.total)}</TD>
                        <TD className="text-right text-[11px] text-muted">{formatTime(order.createdAt)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
            )}
          </div>

          <div>
            <div className="flex items-end justify-between gap-3 border-b border-line pb-2">
              <h2 className="text-[14px] font-semibold text-ink">Best sellers · 30 days</h2>
              {canSeeAnalytics ? (
                <Link
                  href={`/app/analytics?branch=${branchId}`}
                  className="text-[10.5px] font-medium text-brand hover:underline"
                >
                  Analytics
                </Link>
              ) : null}
            </div>
            {menuPerformance.length === 0 ? (
              <p className="py-6 text-[12px] text-muted">No settled sales yet.</p>
            ) : (
              <ol className="divide-y divide-line">
                {menuPerformance.map((item, index) => (
                  <li key={item.menuItemId} className="flex items-start gap-3 py-2.5">
                    <span className="money mt-0.5 w-4 shrink-0 text-[10px] text-muted-soft">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium text-ink">{item.name}</p>
                      <p className="text-[10.5px] text-muted">
                        {item.quantity} sold · margin {item.marginPercent ? `${item.marginPercent}%` : 'n/a'}
                      </p>
                    </div>
                    <span className="money text-[11.5px] text-ink-soft">{formatTHB(item.revenue)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </Reveal>

      {canSeeAnalytics && (overview?.paidBills ?? 0) === 0 ? (
        <p className="border-t border-line pt-3 text-[11.5px] text-muted">
          No settled bills for today yet. The chart still covers the last 30 days; complete a POS payment to
          move today&apos;s numbers.
        </p>
      ) : null}
    </div>
  );
}
