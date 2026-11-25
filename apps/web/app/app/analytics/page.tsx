import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireSession, hasPermission } from '@/lib/auth';
import { serverApi } from '@/lib/api-server';
import { formatTHB } from '@/lib/utils';
import type { MenuPerformanceRow, Overview, SalesPoint } from '@/lib/types';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, InlineError, StatCard } from '@/components/ui/card';
import { SalesChart } from '@/components/charts/sales-chart';
import { Table, TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/table';

export const metadata: Metadata = { title: 'Analytics' };
export const dynamic = 'force-dynamic';

interface Operations {
  averagePrepSeconds: string | null;
  ticketsMeasured: number;
  averageOrderCompletionSeconds: string | null;
  ordersMeasured: number;
  requests: Array<{ type: string; count: number; averageResolutionSeconds: string | null }>;
  stations: Array<{ station: string; tickets: number; averageReadySeconds: string | null }>;
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const me = await requireSession();
  if (!me.tenant) redirect('/platform/dashboard');
  if (!hasPermission(me, 'analytics.read')) return <NoAccess permission="analytics.read" />;
  const params = await searchParams;
  const branchId = params.branch ?? me.branches[0]?.id;
  if (!branchId) return <div>No branch</div>;

  const from = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString();
  const to = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const range = `branchId=${branchId}&from=${from}&to=${to}`;

  let overview: Overview | null = null;
  let sales: {
    series: SalesPoint[];
    paymentBreakdown: Array<{ method: string; total: string; count: number }>;
  } = {
    series: [],
    paymentBreakdown: [],
  };
  let menu: MenuPerformanceRow[] = [];
  let operations: Operations | null = null;
  let error: string | null = null;

  try {
    [overview, sales, menu, operations] = await Promise.all([
      serverApi<Overview>(`/analytics/overview?${range}`),
      serverApi<typeof sales>(`/analytics/sales?${range}&groupBy=day`),
      serverApi<MenuPerformanceRow[]>(`/analytics/menu-performance?${range}&limit=25`),
      serverApi<Operations>(`/analytics/operations?${range}`),
    ]);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : 'Could not load analytics';
  }

  const branch = me.branches.find((candidate) => candidate.id === branchId);
  const formatSeconds = (value: string | null) => {
    if (!value) return '—';
    const seconds = Number(value);
    return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Insight"
        title="Analytics"
        description={`${branch?.name ?? 'Branch'} · last 30 days · every figure is a SQL aggregate over settled bills, payments and orders`}
      />
      {error ? <InlineError>{error}</InlineError> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Gross sales"
          value={formatTHB(overview?.grossSales ?? '0')}
          hint={`${overview?.paidBills ?? 0} settled bills`}
          tone="brand"
        />
        <StatCard
          label="Net of refunds"
          value={formatTHB(overview?.netSales ?? '0')}
          hint={`Refunds ${formatTHB(overview?.refunds ?? '0')}`}
        />
        <StatCard
          label="Average bill"
          value={formatTHB(overview?.averageOrderValue ?? '0')}
          hint={`${overview?.itemsSold ?? 0} items sold`}
          tone="gold"
        />
        <StatCard
          label="Cancellation rate"
          value={`${overview?.cancellationRate ?? '0.0'}%`}
          hint={`${overview?.cancelledOrders ?? 0} of ${overview?.orders ?? 0} orders`}
          tone="olive"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Daily gross sales</CardTitle>
            <span className="text-[11px] text-muted">VAT-inclusive bill totals</span>
          </CardHeader>
          <CardContent className="pt-2">
            <SalesChart data={sales.series} height={300} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Payment mix</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-2">
              {sales.paymentBreakdown.length === 0 ? (
                <p className="text-[12px] text-muted">No payments yet.</p>
              ) : (
                sales.paymentBreakdown.map((method) => (
                  <div key={method.method} className="flex items-center justify-between text-[12px]">
                    <span>{method.method}</span>
                    <span className="tabular text-muted">
                      {method.count} · {formatTHB(method.total)}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Kitchen timings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-2 text-[12px]">
              <div className="flex justify-between">
                <span className="text-muted">Average ticket ready</span>
                <span className="font-medium">{formatSeconds(operations?.averagePrepSeconds ?? null)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Order to served</span>
                <span className="font-medium">
                  {formatSeconds(operations?.averageOrderCompletionSeconds ?? null)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Tickets measured</span>
                <span className="font-medium">{operations?.ticketsMeasured ?? 0}</span>
              </div>
              {operations?.stations.map((station) => (
                <div key={station.station} className="flex justify-between border-t border-line pt-1.5">
                  <span className="text-muted">{station.station}</span>
                  <span className="font-medium">
                    {formatSeconds(station.averageReadySeconds)} · {station.tickets}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Menu performance</CardTitle>
          <span className="text-[11px] text-muted">Revenue uses line totals from paid bills</span>
        </CardHeader>
        <div className="mt-3">
          <TableWrap className="rounded-none border-x-0 border-b-0">
            <Table>
              <THead>
                <TR>
                  <TH>Item</TH>
                  <TH className="text-right">Qty sold</TH>
                  <TH className="text-right">Revenue</TH>
                  <TH className="text-right">Est. cost</TH>
                  <TH className="text-right">Gross margin</TH>
                  <TH className="text-right">Margin %</TH>
                </TR>
              </THead>
              <TBody>
                {menu.length === 0 ? (
                  <TR>
                    <TD colSpan={6} className="text-center text-muted">
                      No settled sales in this period.
                    </TD>
                  </TR>
                ) : (
                  menu.map((item) => (
                    <TR key={item.menuItemId}>
                      <TD className="font-medium text-ink">{item.name}</TD>
                      <TD className="text-right tabular">{item.quantity}</TD>
                      <TD className="text-right tabular">{formatTHB(item.revenue)}</TD>
                      <TD className="text-right tabular text-muted">{formatTHB(item.estimatedCost)}</TD>
                      <TD className="text-right tabular">{formatTHB(item.grossMargin)}</TD>
                      <TD className="text-right tabular">
                        {item.marginPercent ? `${item.marginPercent}%` : '—'}
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </TableWrap>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Guest requests</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 pt-2 sm:grid-cols-2 lg:grid-cols-4">
          {operations?.requests.length === 0 ? (
            <p className="text-[12px] text-muted">No requests in this period.</p>
          ) : (
            operations?.requests.map((request) => (
              <div key={request.type} className="rounded-md border border-line px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                  {request.type.replace(/_/g, ' ')}
                </p>
                <p className="mt-1 text-[15px] font-semibold tabular">{request.count}</p>
                <p className="text-[11px] text-muted">
                  avg {formatSeconds(request.averageResolutionSeconds)}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted">
        Definitions: gross sales = sum of paid bill totals; refunds are recorded separately and subtracted for
        net sales. Cancelled orders never contribute to sales.
      </p>
    </div>
  );
}
