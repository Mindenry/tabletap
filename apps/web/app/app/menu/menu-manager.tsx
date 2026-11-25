'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Pencil, Plus, Search, UtensilsCrossed } from 'lucide-react';
import { clientApi, errorMessage } from '@/lib/api';
import { cn, formatTHB } from '@/lib/utils';
import type { CategoryRow, MenuItemRow } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/card';

interface Station {
  id: string;
  name: string;
  code: string;
}

export function MenuManager({
  branchId,
  categories,
  items,
  stations,
  canEdit,
  canCreate,
  canPrice,
}: {
  branchId: string;
  categories: CategoryRow[];
  items: MenuItemRow[];
  stations: Station[];
  canEdit: boolean;
  canCreate: boolean;
  canPrice: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [categoryFilter, setCategoryFilter] = React.useState('ALL');
  const [busy, setBusy] = React.useState<string | null>(null);

  const [itemDialog, setItemDialog] = React.useState<'create' | MenuItemRow | null>(null);
  const [categoryDialog, setCategoryDialog] = React.useState(false);

  const [name, setName] = React.useState('');
  const [nameEn, setNameEn] = React.useState('');
  const [price, setPrice] = React.useState('');
  const [cost, setCost] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [categoryId, setCategoryId] = React.useState(categories[0]?.id ?? '');
  const [stationId, setStationId] = React.useState(stations[0]?.id ?? '');
  const [itemStatus, setItemStatus] = React.useState('ACTIVE');
  const [categoryName, setCategoryName] = React.useState('');

  React.useEffect(() => {
    if (itemDialog === 'create') {
      setName('');
      setNameEn('');
      setPrice('');
      setCost('');
      setDescription('');
      setItemStatus('ACTIVE');
      setCategoryId(categories[0]?.id ?? '');
      setStationId(stations[0]?.id ?? '');
    } else if (itemDialog) {
      setName(itemDialog.name);
      setNameEn(itemDialog.nameEn ?? '');
      setPrice(itemDialog.basePrice);
      setCost(itemDialog.costEstimate);
      setDescription(itemDialog.description ?? '');
      setItemStatus(itemDialog.status);
      setCategoryId(itemDialog.category.id);
      setStationId(
        stations.find((station) => itemDialog.stationIds.includes(station.id))?.id ?? stations[0]?.id ?? '',
      );
    }
  }, [itemDialog, categories, stations]);

  const filtered = items.filter((item) => {
    if (categoryFilter !== 'ALL' && item.category.id !== categoryFilter) return false;
    if (!search.trim()) return true;
    return `${item.name} ${item.nameEn ?? ''} ${item.sku ?? ''}`.toLowerCase().includes(search.toLowerCase());
  });

  async function toggleAvailability(item: MenuItemRow) {
    setBusy(item.id);
    try {
      await clientApi(`/menu/items/${item.id}/availability`, {
        method: 'POST',
        body: { branchId, isAvailable: !item.availableInBranch },
      });
      toast.success(item.availableInBranch ? `${item.name} marked sold out` : `${item.name} is available`);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function saveItem() {
    const creating = itemDialog === 'create';
    if (!name.trim() || !price) {
      toast.error('Name and price are required');
      return;
    }
    const body: Record<string, unknown> = {
      categoryId,
      name: name.trim(),
      nameEn: nameEn.trim() || undefined,
      description: description.trim() || undefined,
      prepMinutes: 10,
      ...(creating
        ? {
            basePrice: Number(price),
            costEstimate: Number(cost || 0),
            status: itemStatus === 'ARCHIVED' ? 'UNAVAILABLE' : itemStatus,
            stationId,
          }
        : {
            ...(canPrice ? { basePrice: Number(price), priceChangeReason: 'Menu edit' } : {}),
            status: itemStatus,
          }),
    };
    setBusy('save');
    try {
      if (creating) {
        await clientApi('/menu/items', { method: 'POST', body });
        toast.success('Menu item created');
      } else {
        await clientApi(`/menu/items/${(itemDialog as MenuItemRow).id}`, { method: 'PATCH', body });
        toast.success('Menu item updated');
      }
      setItemDialog(null);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function createCategory() {
    if (!categoryName.trim()) return;
    setBusy('category');
    try {
      await clientApi('/menu/categories', { method: 'POST', body: { name: categoryName.trim() } });
      toast.success('Category created');
      setCategoryDialog(false);
      setCategoryName('');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search items"
              className="w-56 pl-9"
              aria-label="Search menu items"
            />
          </div>
          <Select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="w-48"
            aria-label="Filter by category"
          >
            <option value="ALL">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </div>
        {canCreate ? (
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setCategoryDialog(true)}>
              <Plus className="h-3.5 w-3.5" /> Category
            </Button>
            <Button size="sm" onClick={() => setItemDialog('create')}>
              <Plus className="h-3.5 w-3.5" /> New item
            </Button>
          </div>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No menu items"
          description="Create a category, then add your first dish."
          icon={<UtensilsCrossed className="h-7 w-7" />}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-surface-raised">
          <table className="w-full text-[13px]">
            <thead className="border-b border-line bg-paper/60">
              <tr>
                <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Item
                </th>
                <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Category
                </th>
                <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Price
                </th>
                <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Cost
                </th>
                <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Branch
                </th>
                <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/70">
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-paper/40">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-ink">{item.name}</p>
                    <p className="text-[11px] text-muted">
                      {item.nameEn ?? '—'}{' '}
                      {item.modifierGroups.length > 0
                        ? `· ${item.modifierGroups.length} option group(s)`
                        : ''}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-muted">{item.category.name}</td>
                  <td className="px-4 py-2.5 text-right tabular">{formatTHB(item.basePrice)}</td>
                  <td className="px-4 py-2.5 text-right tabular text-[12px] text-muted">
                    {formatTHB(item.costEstimate)}
                  </td>
                  <td className="px-4 py-2.5">
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => toggleAvailability(item)}
                        disabled={busy === item.id}
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[11px] font-medium',
                          item.availableInBranch
                            ? 'bg-success-soft text-success'
                            : 'bg-danger-soft text-danger',
                        )}
                      >
                        {item.availableInBranch ? 'Available' : 'Sold out'}
                      </button>
                    ) : (
                      <StatusBadge
                        status={item.availableInBranch ? 'ACTIVE' : 'CANCELLED'}
                        label={item.availableInBranch ? 'Available' : 'Sold out'}
                      />
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {canEdit ? (
                      <Button variant="ghost" size="sm" onClick={() => setItemDialog(item)}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={Boolean(itemDialog)} onOpenChange={(open) => !open && setItemDialog(null)}>
        <DialogContent
          title={itemDialog === 'create' ? 'New menu item' : 'Edit menu item'}
          description="Prices are authoritative on the server; every price change is written to history."
        >
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="item-name">Name (Thai)</Label>
              <Input id="item-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="item-name-en" hint="optional">
                Name (English)
              </Label>
              <Input id="item-name-en" value={nameEn} onChange={(event) => setNameEn(event.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="item-price">Price (THB)</Label>
                <Input
                  id="item-price"
                  inputMode="decimal"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  disabled={itemDialog !== 'create' && !canPrice}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="item-cost" hint="per serving">
                  Cost estimate
                </Label>
                <Input
                  id="item-cost"
                  inputMode="decimal"
                  value={cost}
                  onChange={(event) => setCost(event.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="item-category">Category</Label>
                <Select
                  id="item-category"
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="item-status">Status</Label>
                <Select
                  id="item-status"
                  value={itemStatus}
                  onChange={(event) => setItemStatus(event.target.value)}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="SOLD_OUT">Sold out</option>
                  <option value="UNAVAILABLE">Unavailable</option>
                  <option value="ARCHIVED">Archived</option>
                </Select>
              </div>
            </div>
            {itemDialog === 'create' ? (
              <div className="grid gap-1.5">
                <Label htmlFor="item-station">Kitchen station</Label>
                <Select
                  id="item-station"
                  value={stationId}
                  onChange={(event) => setStationId(event.target.value)}
                >
                  {stations.map((station) => (
                    <option key={station.id} value={station.id}>
                      {station.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
            <div className="grid gap-1.5">
              <Label htmlFor="item-description" hint="optional">
                Description
              </Label>
              <Textarea
                id="item-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setItemDialog(null)}>
              Cancel
            </Button>
            <Button onClick={saveItem} loading={busy === 'save'}>
              Save item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={categoryDialog} onOpenChange={setCategoryDialog}>
        <DialogContent title="New category" description="Categories control the guest menu sections.">
          <div className="grid gap-1.5">
            <Label htmlFor="category-name">Name</Label>
            <Input
              id="category-name"
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCategoryDialog(false)}>
              Cancel
            </Button>
            <Button onClick={createCategory} loading={busy === 'category'}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
