import type { Metadata } from 'next';
import { requireSession, hasPermission } from '@/lib/auth';
import { serverApi } from '@/lib/api-server';
import type { KitchenTicket } from '@/lib/types';
import { KitchenBoard } from '@/components/kitchen-board';

export const metadata: Metadata = { title: 'Kitchen display' };
export const dynamic = 'force-dynamic';

export default async function KitchenDisplayPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const me = await requireSession();
  const params = await searchParams;
  const branchId = params.branch ?? me.branches[0]?.id;
  if (!me.tenant || !branchId) {
    return <main className="p-6 text-sm">No branch available for this account.</main>;
  }
  if (!hasPermission(me, 'kitchen.read')) {
    return <main className="p-6 text-sm">This account does not have kitchen access.</main>;
  }

  const [stations, tickets] = await Promise.all([
    serverApi<Array<{ id: string; name: string; code: string }>>(`/kitchen/stations?branchId=${branchId}`),
    serverApi<KitchenTicket[]>(`/kitchen/tickets?branchId=${branchId}`),
  ]);

  return (
    <div className="min-h-screen bg-paper-deep/40">
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-raised px-5 py-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand">TableTap kitchen</p>
          <h1 className="text-[20px] font-semibold tracking-tight">{me.tenant.name}</h1>
        </div>
        <div className="text-right text-[11px] text-muted">
          <p>{me.branches.find((branch) => branch.id === branchId)?.name}</p>
          <p>Station tickets only · served items leave the board</p>
        </div>
      </header>
      <main className="p-4 sm:p-5">
        <KitchenBoard
          branchId={branchId}
          stations={stations}
          initialTickets={tickets}
          canUpdate={hasPermission(me, 'kitchen.update')}
          fullscreen
        />
      </main>
    </div>
  );
}
