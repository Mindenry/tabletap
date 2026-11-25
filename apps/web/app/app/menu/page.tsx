import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireSession, hasPermission } from '@/lib/auth';
import { serverApi } from '@/lib/api-server';
import type { CategoryRow, MenuItemRow } from '@/lib/types';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, InlineError } from '@/components/ui/card';
import { MenuManager } from './menu-manager';

export const metadata: Metadata = { title: 'Menu' };
export const dynamic = 'force-dynamic';

export default async function MenuPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const me = await requireSession();
  if (!me.tenant) redirect('/platform/dashboard');
  if (!hasPermission(me, 'menu.read')) return <NoAccess permission="menu.read" />;
  const params = await searchParams;
  const branchId = params.branch ?? me.branches[0]?.id;
  if (!branchId) return <EmptyState title="No branch" />;

  let categories: CategoryRow[] = [];
  let items: MenuItemRow[] = [];
  let stations: Array<{ id: string; name: string; code: string }> = [];
  let error: string | null = null;
  try {
    [categories, items, stations] = await Promise.all([
      serverApi<CategoryRow[]>('/menu/categories'),
      serverApi<MenuItemRow[]>(`/menu/items?branchId=${branchId}`),
      serverApi<Array<{ id: string; name: string; code: string }>>(`/kitchen/stations?branchId=${branchId}`),
    ]);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : 'Could not load the menu';
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Restaurant"
        title="Menu"
        description="Prices, sold-out state and kitchen routing. Availability is per branch."
        actions={
          <span className="text-[12px] text-muted">
            {items.length} items · {categories.length} categories
          </span>
        }
      />
      {error ? <InlineError>{error}</InlineError> : null}
      <MenuManager
        branchId={branchId}
        categories={categories}
        items={items}
        stations={stations}
        canEdit={hasPermission(me, 'menu.update')}
        canCreate={hasPermission(me, 'menu.create')}
        canPrice={hasPermission(me, 'menu.price.update')}
      />
    </div>
  );
}
