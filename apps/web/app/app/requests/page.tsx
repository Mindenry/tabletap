import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireSession, hasPermission } from '@/lib/auth';
import { serverApi } from '@/lib/api-server';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, InlineError } from '@/components/ui/card';
import { NoAccess } from '@/components/no-access';
import { RequestsBoard } from './requests-board';

export const metadata: Metadata = { title: 'Guest requests' };
export const dynamic = 'force-dynamic';

export interface TableRequestRow {
  id: string;
  type: string;
  status: string;
  note: string | null;
  table: { id: string; number: string; name: string | null };
  tableSessionId: string;
  sessionOpenedAt: string;
  assignedTo: { id: string; name: string } | null;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; status?: string }>;
}) {
  const me = await requireSession();
  if (!me.tenant) redirect('/platform/dashboard');
  if (!hasPermission(me, 'table.read')) return <NoAccess permission="table.read" />;
  const params = await searchParams;
  const branchId = params.branch ?? me.branches[0]?.id;
  if (!branchId) return <EmptyState title="No branch" />;

  let requests: TableRequestRow[] = [];
  let error: string | null = null;
  try {
    const query = new URLSearchParams({ branchId });
    if (params.status) query.set('status', params.status);
    requests = await serverApi<TableRequestRow[]>(`/table-requests?${query.toString()}`);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : 'Could not load requests';
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Service"
        title="Guest requests"
        description="Calls, water, utensils and bill requests raised from table QR sessions. Acknowledge to claim, resolve when done."
      />
      {error ? <InlineError>{error}</InlineError> : null}
      <RequestsBoard initialRequests={requests} branchId={branchId} />
    </div>
  );
}
