import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireSession, hasPermission } from '@/lib/auth';
import { serverApi } from '@/lib/api-server';
import type { BillRow, MenuItemRow, TableRow } from '@/lib/types';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, InlineError } from '@/components/ui/card';
import { PosTerminal } from './pos-terminal';

export const metadata: Metadata = { title: 'Point of sale' };
export const dynamic = 'force-dynamic';

export default async function PosPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; session?: string }>;
}) {
  const me = await requireSession();
  if (!me.tenant) redirect('/platform/dashboard');
  if (!hasPermission(me, 'bill.create')) return <NoAccess permission="bill.create" />;
  const params = await searchParams;
  const branchId = params.branch ?? me.branches[0]?.id;
  if (!branchId) return <EmptyState title="No branch" />;

  let tables: TableRow[] = [];
  let bills: BillRow[] = [];
  let menu: MenuItemRow[] = [];
  let error: string | null = null;
  try {
    [tables, bills, menu] = await Promise.all([
      serverApi<TableRow[]>(`/branches/${branchId}/tables`),
      serverApi<BillRow[]>(`/bills?branchId=${branchId}&limit=100`),
      serverApi<MenuItemRow[]>(`/menu/items?branchId=${branchId}`),
    ]);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : 'Could not load the POS';
  }

  const openBills = bills.filter((bill) => bill.status === 'OPEN' || bill.status === 'PARTIALLY_PAID');
  const branch = me.branches.find((candidate) => candidate.id === branchId);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Front of house"
        title="Point of sale"
        description={`${branch?.name ?? 'Branch'} · settle a table, split a bill, take cash or PromptPay`}
      />
      {error ? <InlineError>{error}</InlineError> : null}
      <PosTerminal
        branchId={branchId}
        initialTables={tables}
        initialBills={openBills}
        menu={menu}
        canCreateBill={hasPermission(me, 'bill.create')}
        canSplit={hasPermission(me, 'bill.split')}
        canConfirm={hasPermission(me, 'payment.confirm')}
        canRefund={hasPermission(me, 'payment.refund')}
        canCreateOrder={hasPermission(me, 'order.create')}
        canCloseTable={hasPermission(me, 'table.update')}
        initialSessionId={params.session}
      />
    </div>
  );
}
