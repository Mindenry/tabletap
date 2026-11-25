import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireSession, hasPermission } from '@/lib/auth';
import { serverApi } from '@/lib/api-server';
import type { TableRow } from '@/lib/types';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, InlineError } from '@/components/ui/card';
import { FloorBoard } from './floor-board';

export const metadata: Metadata = { title: 'Floor plan' };
export const dynamic = 'force-dynamic';

export default async function TablesPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const me = await requireSession();
  if (!me.tenant) redirect('/platform/dashboard');
  if (!hasPermission(me, 'table.read')) return <NoAccess permission="table.read" />;
  const params = await searchParams;
  const branchId = params.branch ?? me.branches[0]?.id;
  if (!branchId) return <EmptyState title="No branch" description="Create a branch first." />;

  const canUpdate = hasPermission(me, 'table.update');

  let tables: TableRow[] = [];
  let zones: Array<{ id: string; name: string; displayOrder: number }> = [];
  let error: string | null = null;
  try {
    [tables, zones] = await Promise.all([
      serverApi<TableRow[]>(`/branches/${branchId}/tables`),
      serverApi<Array<{ id: string; name: string; displayOrder: number }>>(`/branches/${branchId}/zones`),
    ]);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : 'Could not load the floor';
  }

  const branch = me.branches.find((candidate) => candidate.id === branchId);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Service floor"
        title="Floor plan"
        description={`${branch?.name ?? 'Branch'} · ${tables.length} tables · ${tables.filter((t) => t.session).length} seated`}
      />

      {error ? <InlineError>{error}</InlineError> : null}

      <FloorBoard
        branchId={branchId}
        initialTables={tables}
        zones={zones}
        canUpdate={canUpdate}
        canCreateBill={hasPermission(me, 'bill.create')}
      />
    </div>
  );
}
