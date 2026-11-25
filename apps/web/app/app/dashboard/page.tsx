import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowUpRight,
  Banknote,
  CircleAlert,
  ClipboardList,
  CreditCard,
  LayoutGrid,
  TrendingUp,
  Users,
} from 'lucide-react';
import { requireSession, hasPermission } from '@/lib/auth';
import { serverApi } from '@/lib/api-server';
import { formatTHB, formatTime } from '@/lib/utils';
import type { MenuPerformanceRow, OrderRow, Overview, SalesPoint, TableRow } from '@/lib/types';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  InlineError,
  StatCard,
} from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { SalesChart } from '@/components/charts/sales-chart';
import { StatusBadge } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR, TableEmpty, TableWrap } from '@/components/ui/table';

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

  const [overview, monthOverview, sales, tables, orders, lowStock, menuPerformance, errors] =
    await Promise.all([
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
        ? safe(serverApi<OrderRow[]>(`/orders?branchId=${branchId}&limit=8`), [] as OrderRow[])
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
      Promise.resolve([]),
    ]);

  void errors;
  const openTables = tables.filter((table) => table.session).length;
  const attention = tables.filter(
    (table) =>
      table.session &&
      (table.session.openRequests > 0 ||
        (table.session.unpaidOrders !== '0.00' && table.session.orderCount > 0)),
  );
  const hasData = Boolean(overview && Number(overview.paidBills) > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Live operations"
        title={`Good service starts here, ${me.user.name.split(' ')[0]}`}
        description={`${overview?.branch.name ?? 'Branch'} · ${new Intl.DateTimeFormat('th-TH', { dateStyle: 'full', timeZone: 'Asia/Bangkok' }).format(new Date())}`}
        actions={
          <>
            <Link
              href={`/app/tables?branch=${branchId}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-[13px] font-medium hover:bg-paper-deep"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Floor plan
            </Link>
            {hasPermission(me, 'bill.create') ? (
              <Link
                href={`/app/pos?branch=${branchId}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-ink px-3.5 text-[13px] font-medium text-paper hover:bg-ink-soft"
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
          Your role does not include analytics access. Operational counts below are still scoped to your
          branch.
        </InlineError>
      ) : null}

      {canSeeAnalytics ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Gross sales today"
            value={formatTHB(overview?.grossSales ?? '0.00')}
            hint={`${overview?.paidBills ?? 0} paid bill(s) · net ${formatTHB(overview?.netSales ?? '0.00')}`}
            tone="brand"
          />
          <StatCard
            label="Orders today"
            value={overview?.orders ?? 0}
            hint={`${overview?.cancelledOrders ?? 0} cancelled · ${overview?.itemsSold ?? 0} items sold`}
          />
          <StatCard
            label="Average bill"
            value={formatTHB(overview?.averageOrderValue ?? '0.00')}
            hint={`VAT ${formatTHB(overview?.vatTotal ?? '0.00')} · service ${formatTHB(overview?.serviceChargeTotal ?? '0.00')}`}
            tone="gold"
          />
          <StatCard
            label="Tables seated"
            value={`${openTables}/${tables.length}`}
            hint={`${tables.reduce((acc, table) => acc + (table.session?.openRequests ?? 0), 0)} open request(s)`}
            tone="olive"
          />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Sales, last 30 days</CardTitle>
              <p className="text-[12px] text-muted">
                {monthOverview
                  ? `${monthOverview.paidBills} settled bills · ${formatTHB(monthOverview.grossSales)} gross`
                  : 'No data'}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">
              <TrendingUp className="h-3 w-3" /> Paid revenue
            </span>
          </CardHeader>
          <CardContent className="pt-3">
            <SalesChart data={sales.series} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Payment mix</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-2">
              {sales.paymentBreakdown.length === 0 ? (
                <p className="text-[12px] text-muted">No payments in this period.</p>
              ) : (
                sales.paymentBreakdown.map((method) => {
                  const totalValue = sales.paymentBreakdown.reduce(
                    (acc, item) => acc + Number(item.total),
                    0,
                  );
                  const percent = totalValue > 0 ? Math.round((Number(method.total) / totalValue) * 100) : 0;
                  return (
                    <div key={method.method}>
                      <div className="mb-1 flex items-center justify-between text-[12px]">
                        <span className="font-medium text-ink-soft">{method.method}</span>
                        <span className="tabular text-muted">
                          {formatTHB(method.total)} · {percent}%
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-paper-deep">
                        <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Needs attention</CardTitle>
              <Link
                href={`/app/tables?branch=${branchId}`}
                className="text-[11px] font-medium text-brand hover:underline"
              >
                Floor
              </Link>
            </CardHeader>
            <CardContent className="space-y-2 pt-2">
              {attention.length === 0 ? (
                <p className="text-[12px] text-muted">All seated tables are settled and happy.</p>
              ) : (
                attention.slice(0, 4).map((table) => (
                  <div
                    key={table.id}
                    className="flex items-center justify-between rounded-md border border-line px-3 py-2"
                  >
                    <div>
                      <p className="text-[12px] font-medium text-ink">Table {table.number}</p>
                      <p className="text-[11px] text-muted">
                        {table.session?.openRequests ?? 0} request(s) ·{' '}
                        {formatTHB(table.session?.outstandingTotal ?? '0')}
                      </p>
                    </div>
                    <StatusBadge status={table.status} />
                  </div>
                ))
              )}
              {canSeeInventory && lowStock.length > 0 ? (
                <div className="mt-3 rounded-md border border-danger/20 bg-danger-soft/60 px-3 py-2">
                  <p className="flex items-center gap-1.5 text-[12px] font-medium text-danger">
                    <CircleAlert className="h-3.5 w-3.5" /> {lowStock.length} ingredient(s) low
                  </p>
                  <p className="mt-0.5 text-[11px] text-danger/80">
                    {lowStock
                      .slice(0, 3)
                      .map((item) => item.name)
                      .join(', ')}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Recent orders</CardTitle>
            {canSeeOrders ? (
              <Link
                href={`/app/orders?branch=${branchId}`}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline"
              >
                All orders <ArrowUpRight className="h-3 w-3" />
              </Link>
            ) : null}
          </CardHeader>
          <div className="mt-3">
            {orders.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState
                  title="No orders yet today"
                  description="Scan a table QR or open the POS to create the first order."
                  icon={<ClipboardList className="h-6 w-6" />}
                />
              </div>
            ) : (
              <TableWrap className="rounded-none border-x-0 border-b-0">
                <Table>
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
                            className="font-medium text-ink hover:text-brand"
                          >
                            {order.number}
                          </Link>
                          <p className="text-[11px] text-muted">
                            {order.itemCount} item(s) · {order.source === 'CUSTOMER_QR' ? 'QR' : 'POS'}
                          </p>
                        </TD>
                        <TD>Table {order.table.number}</TD>
                        <TD>
                          <StatusBadge status={order.status} />
                        </TD>
                        <TD className="text-right tabular">{formatTHB(order.total)}</TD>
                        <TD className="text-right text-[12px] text-muted">{formatTime(order.createdAt)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Best sellers · 30 days</CardTitle>
          </CardHeader>
          <CardContent className="pt-3">
            {menuPerformance.length === 0 ? (
              <p className="text-[12px] text-muted">No settled sales yet.</p>
            ) : (
              <ol className="space-y-3">
                {menuPerformance.map((item, index) => (
                  <li key={item.menuItemId} className="flex items-start gap-3">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-paper-deep text-[10px] font-semibold text-muted">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium text-ink">{item.name}</p>
                      <p className="text-[11px] text-muted">
                        {item.quantity} sold · margin {item.marginPercent ? `${item.marginPercent}%` : 'n/a'}
                      </p>
                    </div>
                    <span className="tabular text-[12px] text-ink-soft">{formatTHB(item.revenue)}</span>
                  </li>
                ))}
              </ol>
            )}
            {canSeeAnalytics ? (
              <Link
                href={`/app/analytics?branch=${branchId}`}
                className="mt-4 inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline"
              >
                Full analytics <ArrowUpRight className="h-3 w-3" />
              </Link>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {!hasData && canSeeAnalytics ? (
        <Card className="border-dashed bg-surface/60">
          <CardContent className="flex items-start gap-3">
            <Banknote className="mt-0.5 h-5 w-5 text-gold" />
            <div>
              <p className="text-[13px] font-medium text-ink">No settled bills for today yet</p>
              <p className="mt-0.5 text-[12px] text-muted">
                The chart still shows the last 30 days. Complete a payment flow in the POS to see today&apos;s
                numbers move.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex items-center justify-between text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          Signed in as {me.user.email} · {me.role}
        </span>
        <span>All figures are SQL aggregates over persisted records.</span>
      </div>
    </div>
  );
}
