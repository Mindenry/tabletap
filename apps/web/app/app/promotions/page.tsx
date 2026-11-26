import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireSession, hasPermission } from '@/lib/auth';
import { serverApi } from '@/lib/api-server';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, InlineError } from '@/components/ui/card';
import { PromotionsManager, type PromotionRow } from './promotions-manager';

export const metadata: Metadata = { title: 'Promotions' };
export const dynamic = 'force-dynamic';

export default async function PromotionsPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const me = await requireSession();
  if (!me.tenant) redirect('/platform/dashboard');
  if (!hasPermission(me, 'promotion.manage')) return <NoAccess permission="promotion.manage" />;
  const params = await searchParams;
  const branchId = params.branch ?? me.branches[0]?.id;
  if (!branchId) return <EmptyState title="No branch" />;

  let promotions: PromotionRow[] = [];
  let error: string | null = null;
  try {
    promotions = await serverApi<PromotionRow[]>(`/promotions?branchId=${branchId}`);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : 'Could not load promotions';
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Restaurant"
        title="Promotions"
        description="Codes guests can type at the table. The pricing engine applies them to the order; limits and dates are enforced when the order is priced."
      />
      {error ? <InlineError>{error}</InlineError> : null}
      <PromotionsManager initial={promotions} branches={me.branches} defaultBranchId={branchId} />
    </div>
  );
}
