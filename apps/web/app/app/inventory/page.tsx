import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireSession, hasPermission } from '@/lib/auth';
import { serverApi } from '@/lib/api-server';
import type { IngredientRow } from '@/lib/types';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, InlineError } from '@/components/ui/card';
import { InventoryManager } from './inventory-manager';

export const metadata: Metadata = { title: 'Inventory' };
export const dynamic = 'force-dynamic';

interface RecipeRow {
  id: string;
  menuItem: { id: string; name: string; basePrice: string };
  version: number;
  cost: string;
  margin: string | null;
  items: Array<{ ingredientId: string; name: string; quantity: string; unit: string }>;
  versionCount: number;
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const me = await requireSession();
  if (!me.tenant) redirect('/platform/dashboard');
  if (!hasPermission(me, 'inventory.read')) return <NoAccess permission="inventory.read" />;
  const params = await searchParams;
  const branchId = params.branch ?? me.branches[0]?.id;
  if (!branchId) return <EmptyState title="No branch" />;

  let ingredients: IngredientRow[] = [];
  let recipes: RecipeRow[] = [];
  let error: string | null = null;
  try {
    [ingredients, recipes] = await Promise.all([
      serverApi<IngredientRow[]>(`/inventory/ingredients?branchId=${branchId}`),
      serverApi<RecipeRow[]>('/recipes'),
    ]);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : 'Could not load inventory';
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Restaurant"
        title="Inventory"
        description="Stock is deducted once when the kitchen accepts an order, and returned if a ticket is rejected."
        actions={
          <span className="text-[12px] text-muted">
            {ingredients.filter((item) => item.lowStock).length} low · {ingredients.length} ingredients
          </span>
        }
      />
      {error ? <InlineError>{error}</InlineError> : null}
      <InventoryManager
        branchId={branchId}
        ingredients={ingredients}
        recipes={recipes}
        canAdjust={hasPermission(me, 'inventory.adjust')}
        canReceive={hasPermission(me, 'inventory.receive')}
      />
    </div>
  );
}
