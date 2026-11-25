import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireSession, hasPermission } from '@/lib/auth';
import { serverApi } from '@/lib/api-server';
import type { KitchenTicket } from '@/lib/types';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, InlineError } from '@/components/ui/card';
import { KitchenBoard } from '@/components/kitchen-board';

export const metadata: Metadata = { title: 'Kitchen display' };
export const dynamic = 'force-dynamic';

export default async function KitchenPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const me = await requireSession();
  if (!me.tenant) redirect('/platform/dashboard');
  if (!hasPermission(me, 'kitchen.read')) return <NoAccess permission="kitchen.read" />;
  const params = await searchParams;
  const branchId = params.branch ?? me.branches[0]?.id;
  if (!branchId) return <EmptyState title="No branch" />;

  let stations: Array<{ id: string; name: string; code: string }> = [];
  let tickets: KitchenTicket[] = [];
  let error: string | null = null;
  try {
    [stations, tickets] = await Promise.all([
      serverApi<Array<{ id: string; name: string; code: string; isActive: boolean }>>(
        `/kitchen/stations?branchId=${branchId}`,
      ),
      serverApi<KitchenTicket[]>(`/kitchen/tickets?branchId=${branchId}`),
    ]);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : 'Could not load the kitchen board';
  }

  const branch = me.branches.find((candidate) => candidate.id === branchId);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Back of house"
        title="Kitchen display"
        description={`${branch?.name ?? 'Branch'} · tickets are routed by station and persisted before they appear here`}
        actions={
          <a
            href={`/kitchen/display?branch=${branchId}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-[13px] font-medium hover:bg-paper-deep"
          >
            Open full screen
          </a>
        }
      />
      {error ? <InlineError>{error}</InlineError> : null}
      <KitchenBoard
        branchId={branchId}
        stations={stations}
        initialTickets={tickets}
        canUpdate={hasPermission(me, 'kitchen.update')}
      />
    </div>
  );
}
