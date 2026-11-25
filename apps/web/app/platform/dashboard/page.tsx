import type { Metadata } from 'next';
import { requireSession } from '@/lib/auth';
import { serverApi } from '@/lib/api-server';
import { formatDate, formatTHB } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, InlineError, StatCard } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/table';
import { TenantActions } from './tenant-actions';

export const metadata: Metadata = { title: 'Platform dashboard' };
export const dynamic = 'force-dynamic';

interface PlatformDashboard {
  tenants: number;
  activeTenants: number;
  trialTenants: number;
  suspendedTenants: number;
  branches: number;
  orders: number;
  paidBills: number;
  grossSalesAllTime: string;
  plansAvailable: number;
}

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  branches: number;
  members: number;
  orders: number;
  sales30d: string;
  subscription: { status: string; plan: string; planName: string; trialEndsAt: string | null } | null;
}

interface Health {
  status: string;
  database: { ok: boolean; latencyMs: number | null };
  redis: { ok: boolean; latencyMs: number | null; error?: string };
  outbox: { pending: number; failed: number };
  process: { uptimeSeconds: number; rssMb: string; nodeVersion: string };
  timestamp: string;
}

export default async function PlatformDashboardPage() {
  const me = await requireSession();

  let dashboard: PlatformDashboard | null = null;
  let tenants: TenantRow[] = [];
  let health: Health | null = null;
  let plans: Array<{ key: string; name: string; priceMonthly: string; limits: Record<string, number> }> = [];
  let error: string | null = null;
  try {
    [dashboard, tenants, health, plans] = await Promise.all([
      serverApi<PlatformDashboard>('/platform/dashboard'),
      serverApi<TenantRow[]>('/platform/tenants'),
      serverApi<Health>('/platform/system-health'),
      serverApi<typeof plans>('/platform/plans'),
    ]);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : 'Could not load platform data';
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform"
        title="Operations overview"
        description="Tenant lifecycle and system health. Restaurant business data is not visible here without an explicit membership."
        actions={<span className="text-[12px] text-muted">Signed in as {me.user.email}</span>}
      />
      {error ? <InlineError>{error}</InlineError> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Tenants"
          value={dashboard?.tenants ?? 0}
          hint={`${dashboard?.activeTenants ?? 0} active · ${dashboard?.suspendedTenants ?? 0} suspended`}
          tone="brand"
        />
        <StatCard
          label="Branches"
          value={dashboard?.branches ?? 0}
          hint={`${dashboard?.trialTenants ?? 0} tenant(s) on trial`}
        />
        <StatCard
          label="Orders (all time)"
          value={dashboard?.orders ?? 0}
          hint={`${dashboard?.paidBills ?? 0} paid bills`}
          tone="gold"
        />
        <StatCard
          label="Gross sales (all time)"
          value={formatTHB(dashboard?.grossSalesAllTime ?? '0')}
          hint="Sum of paid bills"
          tone="olive"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card id="tenants">
          <CardHeader>
            <CardTitle>Tenants</CardTitle>
            <span className="text-[11px] text-muted">{tenants.length} restaurant(s)</span>
          </CardHeader>
          <div className="mt-3">
            <TableWrap className="rounded-none border-x-0 border-b-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Restaurant</TH>
                    <TH>Plan</TH>
                    <TH className="text-right">Branches</TH>
                    <TH className="text-right">Members</TH>
                    <TH className="text-right">Sales 30d</TH>
                    <TH>Status</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {tenants.map((tenant) => (
                    <TR key={tenant.id}>
                      <TD>
                        <p className="font-medium text-ink">{tenant.name}</p>
                        <p className="text-[11px] text-muted">
                          /{tenant.slug} · joined {formatDate(tenant.createdAt)}
                        </p>
                      </TD>
                      <TD className="text-[12px]">{tenant.subscription?.planName ?? '—'}</TD>
                      <TD className="text-right tabular">{tenant.branches}</TD>
                      <TD className="text-right tabular">{tenant.members}</TD>
                      <TD className="text-right tabular">{formatTHB(tenant.sales30d)}</TD>
                      <TD>
                        <div className="flex flex-col gap-1">
                          <StatusBadge status={tenant.status} />
                          {tenant.subscription ? <StatusBadge status={tenant.subscription.status} /> : null}
                        </div>
                      </TD>
                      <TD className="text-right">
                        <TenantActions
                          tenantId={tenant.id}
                          tenantName={tenant.name}
                          status={tenant.status}
                          plan={tenant.subscription?.plan ?? 'GROWTH'}
                          plans={plans.map((plan) => ({ key: plan.key, name: plan.name }))}
                        />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System health</CardTitle>
              <StatusBadge
                status={
                  health?.status === 'healthy'
                    ? 'ACTIVE'
                    : health?.status === 'degraded'
                      ? 'PENDING'
                      : 'CANCELLED'
                }
                label={health?.status ?? 'unknown'}
              />
            </CardHeader>
            <CardContent className="space-y-2 pt-2 text-[12px]">
              <div className="flex justify-between">
                <span className="text-muted">PostgreSQL</span>
                <span>{health?.database.ok ? `ok · ${health.database.latencyMs}ms` : 'down'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Redis</span>
                <span>
                  {health?.redis.ok
                    ? `ok · ${health.redis.latencyMs}ms`
                    : (health?.redis.error ?? 'not configured')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Outbox pending</span>
                <span className="tabular">{health?.outbox.pending ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Outbox failed</span>
                <span className={health?.outbox.failed ? 'text-danger' : ''}>
                  {health?.outbox.failed ?? 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Process uptime</span>
                <span>{health ? `${Math.floor(health.process.uptimeSeconds / 60)}m` : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">RSS</span>
                <span>{health?.process.rssMb ?? '—'} MB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Node</span>
                <span>{health?.process.nodeVersion ?? '—'}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Plans</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-2">
              {plans.map((plan) => (
                <div key={plan.key} className="rounded-md border border-line px-3 py-2">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-medium">{plan.name}</span>
                    <span className="tabular">{formatTHB(plan.priceMonthly)}/mo</span>
                  </div>
                  <p className="text-[11px] text-muted">
                    {plan.limits.branches} branches · {plan.limits.staff} staff · {plan.limits.monthlyOrders}{' '}
                    orders/mo
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <p className="text-[11px] text-muted">
            Suspending a tenant revokes every staff session immediately. Reactivating does not restore old
            sessions.
          </p>
        </div>
      </div>
    </div>
  );
}
