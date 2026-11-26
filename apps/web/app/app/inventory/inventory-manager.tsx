'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Boxes, Plus, Scale, Truck } from 'lucide-react';
import { clientApi, errorMessage } from '@/lib/api';
import { cn, formatTHB } from '@/lib/utils';
import type { IngredientRow } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, EmptyState } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface RecipeRow {
  id: string;
  menuItem: { id: string; name: string; basePrice: string };
  version: number;
  cost: string;
  margin: string | null;
  items: Array<{ ingredientId: string; name: string; quantity: string; unit: string }>;
  versionCount: number;
}

const UNITS = ['g', 'kg', 'ml', 'l', 'pcs', 'pack'];

export function InventoryManager({
  branchId,
  ingredients,
  recipes,
  canAdjust,
  canReceive,
}: {
  branchId: string;
  ingredients: IngredientRow[];
  recipes: RecipeRow[];
  canAdjust: boolean;
  canReceive: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<'receive' | 'adjust' | 'create' | null>(null);
  const [selectedId, setSelectedId] = React.useState(ingredients[0]?.id ?? '');
  const [quantity, setQuantity] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const [newName, setNewName] = React.useState('');
  const [newSku, setNewSku] = React.useState('');
  const [newUnit, setNewUnit] = React.useState('kg');
  const [newCost, setNewCost] = React.useState('');
  const [newMin, setNewMin] = React.useState('5');
  const [newStock, setNewStock] = React.useState('0');

  const low = ingredients.filter((item) => item.lowStock);
  const totalValue = ingredients.reduce((acc, item) => acc + Number(item.stockValue), 0);

  async function submitMovement() {
    if (!selectedId || !quantity) {
      toast.error('Choose an ingredient and quantity');
      return;
    }
    setBusy(true);
    try {
      if (dialog === 'receive') {
        await clientApi('/inventory/receive', {
          method: 'POST',
          body: { ingredientId: selectedId, quantity: Number(quantity), reason: reason || 'Stock received' },
        });
        toast.success('Stock received');
      } else {
        const ingredient = ingredients.find((item) => item.id === selectedId)!;
        await clientApi('/inventory/adjust', {
          method: 'POST',
          body: {
            ingredientId: selectedId,
            newQuantity: Number(quantity),
            reason: reason || 'Manual adjustment',
          },
        });
        toast.success(`Stock set to ${quantity} ${ingredient.unit}`);
      }
      setDialog(null);
      setQuantity('');
      setReason('');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function createIngredient() {
    if (!newName.trim()) {
      toast.error('Name is required');
      return;
    }
    setBusy(true);
    try {
      await clientApi('/inventory/ingredients', {
        method: 'POST',
        body: {
          branchId,
          name: newName.trim(),
          sku: newSku.trim() || undefined,
          unit: newUnit,
          costPerUnit: Number(newCost || 0),
          minStock: Number(newMin || 0),
          currentStock: Number(newStock || 0),
        },
      });
      toast.success('Ingredient created');
      setDialog(null);
      setNewName('');
      setNewSku('');
      setNewCost('');
      setNewStock('0');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="metric-band -mx-4 sm:-mx-6 lg:-mx-8">
        <div className="metric-cell px-4 sm:px-6 lg:px-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Stock value</p>
          <p className="money mt-2 text-[24px] leading-none text-brand sm:text-[26px]">
            {formatTHB(totalValue)}
          </p>
        </div>
        <div className="metric-cell px-4 sm:px-6 lg:px-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Low stock</p>
          <p
            className={cn(
              'money mt-2 text-[24px] leading-none sm:text-[26px]',
              low.length > 0 ? 'text-danger' : 'text-success',
            )}
          >
            {low.length}
          </p>
        </div>
        <div className="metric-cell px-4 sm:px-6 lg:px-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Recipes</p>
          <p className="money mt-2 text-[24px] leading-none text-ink sm:text-[26px]">{recipes.length}</p>
        </div>
        <div className="metric-cell px-4 sm:px-6 lg:px-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Ingredients</p>
          <p className="money mt-2 text-[24px] leading-none text-gold sm:text-[26px]">{ingredients.length}</p>
        </div>
      </div>

      <Tabs defaultValue="stock">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="stock">Stock</TabsTrigger>
            <TabsTrigger value="recipes">Recipes</TabsTrigger>
            <TabsTrigger value="low">Low stock · {low.length}</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            {canAdjust ? (
              <Button size="sm" variant="secondary" onClick={() => setDialog('create')}>
                <Plus className="h-3.5 w-3.5" /> Ingredient
              </Button>
            ) : null}
            {canReceive ? (
              <Button
                size="sm"
                onClick={() => {
                  setSelectedId(ingredients[0]?.id ?? '');
                  setQuantity('');
                  setDialog('receive');
                }}
              >
                <Truck className="h-3.5 w-3.5" /> Receive
              </Button>
            ) : null}
            {canAdjust ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSelectedId(ingredients[0]?.id ?? '');
                  setQuantity('');
                  setDialog('adjust');
                }}
              >
                <Scale className="h-3.5 w-3.5" /> Adjust
              </Button>
            ) : null}
          </div>
        </div>

        <TabsContent value="stock">
          {ingredients.length === 0 ? (
            <EmptyState
              title="No ingredients"
              description="Add an ingredient to start tracking stock."
              icon={<Boxes className="h-7 w-7" />}
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-line bg-surface-raised">
              <table className="w-full min-w-[720px] text-[13px]">
                <thead className="border-b border-line bg-paper/60">
                  <tr>
                    <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                      Ingredient
                    </th>
                    <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted">
                      On hand
                    </th>
                    <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted">
                      Minimum
                    </th>
                    <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted">
                      Unit cost
                    </th>
                    <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted">
                      Value
                    </th>
                    <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                      State
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/70">
                  {ingredients.map((item) => (
                    <tr key={item.id} className="hover:bg-paper/40">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-ink">{item.name}</p>
                        <p className="text-[11px] text-muted">
                          {item.sku ?? '—'} · {item.storageLocation ?? 'Main store'}
                        </p>
                      </td>
                      <td
                        className={cn(
                          'px-4 py-2.5 text-right tabular',
                          item.lowStock && 'font-semibold text-danger',
                        )}
                      >
                        {Number(item.currentStock).toFixed(2)} {item.unit}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular text-[12px] text-muted">
                        {Number(item.minStock).toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular text-[12px]">
                        {formatTHB(item.costPerUnit)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular text-[12px]">
                        {formatTHB(item.stockValue)}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge
                          status={item.lowStock ? 'LOW' : 'ACTIVE'}
                          label={item.lowStock ? 'Low' : 'Healthy'}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="recipes">
          {recipes.length === 0 ? (
            <EmptyState
              title="No recipes"
              description="Recipes connect menu items to ingredient consumption."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {recipes.map((recipe) => (
                <Card key={recipe.id}>
                  <CardHeader>
                    <div>
                      <CardTitle className="text-[13px]">{recipe.menuItem.name}</CardTitle>
                      <p className="text-[11px] text-muted">
                        v{recipe.version} · {recipe.items.length} ingredient(s)
                      </p>
                    </div>
                    <span className="text-[11px] text-muted">×{recipe.versionCount}</span>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <ul className="space-y-1 text-[11px] text-muted">
                      {recipe.items.slice(0, 4).map((item) => (
                        <li key={item.ingredientId} className="flex justify-between">
                          <span>{item.name}</span>
                          <span className="tabular">
                            {item.quantity} {item.unit}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 flex items-end justify-between border-t border-line pt-2">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted">Plate cost</p>
                        <p className="text-[13px] font-semibold tabular">{formatTHB(recipe.cost)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-wide text-muted">Margin</p>
                        <p className="text-[13px] font-semibold text-success tabular">
                          {recipe.margin ? `${recipe.margin}%` : '—'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="low">
          {low.length === 0 ? (
            <EmptyState
              title="Everything is stocked"
              description="No ingredient is at or below its minimum level."
            />
          ) : (
            <div className="space-y-2">
              {low.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border border-danger/25 bg-danger-soft/40 px-4 py-3"
                >
                  <div>
                    <p className="text-[13px] font-medium">{item.name}</p>
                    <p className="text-[11px] text-danger">
                      {Number(item.currentStock).toFixed(2)} {item.unit} left · minimum{' '}
                      {Number(item.minStock).toFixed(2)}
                    </p>
                  </div>
                  {canReceive ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setSelectedId(item.id);
                        setQuantity('');
                        setReason('');
                        setDialog('receive');
                      }}
                    >
                      Receive stock
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog
        open={dialog === 'receive' || dialog === 'adjust'}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent
          title={dialog === 'receive' ? 'Receive stock' : 'Adjust stock'}
          description={
            dialog === 'receive'
              ? 'Adds a RECEIVE movement and updates the running balance.'
              : 'Sets the counted quantity and records the difference as an ADJUST movement.'
          }
        >
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ingredient">Ingredient</Label>
              <Select
                id="ingredient"
                value={selectedId}
                onChange={(event) => {
                  setSelectedId(event.target.value);
                  const ingredient = ingredients.find((item) => item.id === event.target.value);
                  if (dialog === 'adjust' && ingredient) setQuantity(String(Number(ingredient.currentStock)));
                }}
              >
                {ingredients.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {Number(item.currentStock).toFixed(2)} {item.unit}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="quantity">
                {dialog === 'receive' ? 'Quantity received' : 'Counted quantity'}
              </Label>
              <Input
                id="quantity"
                inputMode="decimal"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="reason" hint="required for adjustments">
                Reason
              </Label>
              <Textarea
                id="reason"
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button onClick={submitMovement} loading={busy}>
              {dialog === 'receive' ? 'Receive' : 'Adjust'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'create'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent
          title="New ingredient"
          description="Ingredients are branch-scoped so each kitchen keeps its own stock."
        >
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="new-name">Name</Label>
              <Input id="new-name" value={newName} onChange={(event) => setNewName(event.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="new-sku" hint="optional">
                  SKU
                </Label>
                <Input id="new-sku" value={newSku} onChange={(event) => setNewSku(event.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="new-unit">Unit</Label>
                <Select id="new-unit" value={newUnit} onChange={(event) => setNewUnit(event.target.value)}>
                  {UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="new-cost">Cost / unit</Label>
                <Input
                  id="new-cost"
                  inputMode="decimal"
                  value={newCost}
                  onChange={(event) => setNewCost(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="new-min">Minimum</Label>
                <Input
                  id="new-min"
                  inputMode="decimal"
                  value={newMin}
                  onChange={(event) => setNewMin(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="new-stock">Opening</Label>
                <Input
                  id="new-stock"
                  inputMode="decimal"
                  value={newStock}
                  onChange={(event) => setNewStock(event.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button onClick={createIngredient} loading={busy}>
              Create ingredient
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
