'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { CalendarClock, Pencil, Plus, Tag, X } from 'lucide-react';
import { clientApi, errorMessage } from '@/lib/api';
import { cn, formatDate, formatTHB, plural } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox, Input, Label, Select } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/card';

export interface PromotionRow {
  id: string;
  name: string;
  code: string | null;
  type: 'PERCENTAGE' | 'FIXED' | 'COUPON';
  value: string;
  minOrderAmount: string;
  maxDiscount: string | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  branch: { id: string; name: string } | null;
  createdAt: string;
}

interface FormState {
  id: string | null;
  name: string;
  code: string;
  type: 'PERCENTAGE' | 'FIXED' | 'COUPON';
  value: string;
  minOrderAmount: string;
  maxDiscount: string;
  maxRedemptions: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  branchId: string;
}

const EMPTY: FormState = {
  id: null,
  name: '',
  code: '',
  type: 'PERCENTAGE',
  value: '10',
  minOrderAmount: '0',
  maxDiscount: '',
  maxRedemptions: '',
  startsAt: '',
  endsAt: '',
  isActive: true,
  branchId: '',
};

const TYPE_LABEL: Record<string, string> = {
  PERCENTAGE: 'Percentage',
  FIXED: 'Fixed amount',
  COUPON: 'Coupon amount',
};

function valueLabel(promotion: PromotionRow): string {
  if (promotion.type === 'PERCENTAGE') return `${Number(promotion.value)}%`;
  return formatTHB(promotion.value);
}

function state(promotion: PromotionRow): { label: string; tone: string } {
  if (!promotion.isActive) return { label: 'Inactive', tone: 'border-line bg-paper-deep text-muted' };
  const now = Date.now();
  if (promotion.startsAt && new Date(promotion.startsAt).getTime() > now) {
    return { label: 'Scheduled', tone: 'border-gold/30 bg-gold-soft text-gold' };
  }
  if (promotion.endsAt && new Date(promotion.endsAt).getTime() < now) {
    return { label: 'Expired', tone: 'border-line bg-paper-deep text-muted' };
  }
  if (promotion.maxRedemptions !== null && promotion.redemptionCount >= promotion.maxRedemptions) {
    return { label: 'Fully redeemed', tone: 'border-danger/30 bg-danger-soft text-danger' };
  }
  return { label: 'Active', tone: 'border-success/30 bg-success-soft text-success' };
}

function toDateInput(value: string | null): string {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}

export function PromotionsManager({
  initial,
  branches,
  defaultBranchId,
}: {
  initial: PromotionRow[];
  branches: Array<{ id: string; name: string }>;
  defaultBranchId: string;
}) {
  const [rows, setRows] = React.useState(initial);
  const [form, setForm] = React.useState<FormState | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function refresh() {
    try {
      setRows(await clientApi<PromotionRow[]>(`/promotions?branchId=${defaultBranchId}`));
    } catch {
      // keep the last good list
    }
  }

  function openCreate() {
    setError(null);
    setForm({ ...EMPTY, branchId: '', startsAt: '', endsAt: '' });
  }

  function openEdit(promotion: PromotionRow) {
    setError(null);
    setForm({
      id: promotion.id,
      name: promotion.name,
      code: promotion.code ?? '',
      type: promotion.type,
      value: String(Number(promotion.value)),
      minOrderAmount: String(Number(promotion.minOrderAmount)),
      maxDiscount: promotion.maxDiscount ? String(Number(promotion.maxDiscount)) : '',
      maxRedemptions: promotion.maxRedemptions ? String(promotion.maxRedemptions) : '',
      startsAt: toDateInput(promotion.startsAt),
      endsAt: toDateInput(promotion.endsAt),
      isActive: promotion.isActive,
      branchId: promotion.branch?.id ?? '',
    });
  }

  function payload(current: FormState) {
    return {
      name: current.name.trim(),
      ...(current.code.trim() ? { code: current.code.trim().toUpperCase() } : {}),
      type: current.type,
      value: Number(current.value),
      minOrderAmount: Number(current.minOrderAmount || 0),
      ...(current.maxDiscount ? { maxDiscount: Number(current.maxDiscount) } : {}),
      ...(current.maxRedemptions ? { maxRedemptions: Number(current.maxRedemptions) } : {}),
      ...(current.startsAt ? { startsAt: `${current.startsAt}T00:00:00+07:00` } : {}),
      ...(current.endsAt ? { endsAt: `${current.endsAt}T23:59:59+07:00` } : {}),
      isActive: current.isActive,
      ...(current.branchId ? { branchId: current.branchId } : {}),
    };
  }

  async function save() {
    if (!form) return;
    if (form.name.trim().length < 2) {
      setError('Give the promotion a name.');
      return;
    }
    if (!(Number(form.value) > 0)) {
      setError('Value must be greater than zero.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (form.id) {
        await clientApi(`/promotions/${form.id}`, { method: 'PATCH', body: payload(form) });
        toast.success('Promotion updated');
      } else {
        await clientApi('/promotions', { method: 'POST', body: payload(form) });
        toast.success('Promotion created');
      }
      setForm(null);
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(promotion: PromotionRow) {
    setBusy(true);
    try {
      await clientApi(`/promotions/${promotion.id}`, {
        method: 'PATCH',
        body: { isActive: !promotion.isActive },
      });
      toast.success(promotion.isActive ? 'Promotion paused' : 'Promotion activated');
      await refresh();
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted">
            {plural(rows.length, 'promotion')} · {rows.filter((row) => state(row).label === 'Active').length}{' '}
            active
          </p>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" /> New promotion
          </Button>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title="No promotions yet"
            description="Create a code guests can type at the table. A percentage or a fixed amount, with optional dates and a redemption cap."
            icon={<Tag className="h-7 w-7" />}
            action={
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5" /> Create the first one
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-line border border-line bg-surface-raised">
            {rows.map((promotion) => {
              const status = state(promotion);
              return (
                <li key={promotion.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-display text-[18px] leading-tight text-ink">{promotion.name}</p>
                        <span
                          className={cn(
                            'border px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.12em]',
                            status.tone,
                          )}
                        >
                          {status.label}
                        </span>
                      </div>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10.5px] text-muted">
                        <span className="money text-[11.5px] text-ink-soft">{valueLabel(promotion)}</span>
                        <span>{TYPE_LABEL[promotion.type]}</span>
                        {promotion.code ? (
                          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-brand">
                            {promotion.code}
                          </span>
                        ) : (
                          <span className="text-muted-soft">no code</span>
                        )}
                        <span>{promotion.branch?.name ?? 'All branches'}</span>
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-soft">
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="h-3 w-3" />
                          {promotion.startsAt ? formatDate(promotion.startsAt) : 'any time'}
                          {' → '}
                          {promotion.endsAt ? formatDate(promotion.endsAt) : 'no end'}
                        </span>
                        <span>
                          {promotion.redemptionCount}
                          {promotion.maxRedemptions ? ` / ${promotion.maxRedemptions}` : ''} redeemed
                        </span>
                        {Number(promotion.minOrderAmount) > 0 ? (
                          <span>min {formatTHB(promotion.minOrderAmount)}</span>
                        ) : null}
                        {promotion.maxDiscount ? <span>cap {formatTHB(promotion.maxDiscount)}</span> : null}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(promotion)}
                        className="inline-flex h-8 items-center gap-1 border border-line px-2.5 text-[11px] font-medium text-ink-soft hover:border-line-strong hover:text-ink"
                      >
                        <Pencil className="h-3 w-3" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => toggle(promotion)}
                        disabled={busy}
                        className="inline-flex h-8 items-center border border-line px-2.5 text-[11px] font-medium text-ink-soft hover:border-line-strong hover:text-ink disabled:opacity-50"
                      >
                        {promotion.isActive ? 'Pause' : 'Activate'}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {form ? (
        <aside className="border border-line bg-surface-raised">
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-soft">
              {form.id ? 'Edit promotion' : 'New promotion'}
            </p>
            <button
              type="button"
              onClick={() => setForm(null)}
              className="p-1 text-muted hover:text-ink"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="space-y-3 px-4 py-4">
            <div className="space-y-1">
              <Label htmlFor="promo-name">Name</Label>
              <Input
                id="promo-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Songkran 10%"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="promo-type">Type</Label>
                <Select
                  id="promo-type"
                  value={form.type}
                  onChange={(event) => setForm({ ...form, type: event.target.value as FormState['type'] })}
                >
                  <option value="PERCENTAGE">Percentage</option>
                  <option value="FIXED">Fixed amount</option>
                  <option value="COUPON">Coupon amount</option>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="promo-value" hint={form.type === 'PERCENTAGE' ? '%' : '฿'}>
                  Value
                </Label>
                <Input
                  id="promo-value"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.value}
                  onChange={(event) => setForm({ ...form, value: event.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="promo-code" hint="A–Z, 0–9, dash">
                Code
              </Label>
              <Input
                id="promo-code"
                value={form.code}
                onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
                placeholder="SONGKRAN10"
                className="font-mono uppercase"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="promo-min">Minimum spend</Label>
                <Input
                  id="promo-min"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.minOrderAmount}
                  onChange={(event) => setForm({ ...form, minOrderAmount: event.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="promo-cap" hint="optional">
                  Max discount
                </Label>
                <Input
                  id="promo-cap"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.maxDiscount}
                  onChange={(event) => setForm({ ...form, maxDiscount: event.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="promo-start" hint="optional">
                  Starts
                </Label>
                <Input
                  id="promo-start"
                  type="date"
                  value={form.startsAt}
                  onChange={(event) => setForm({ ...form, startsAt: event.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="promo-end" hint="optional">
                  Ends
                </Label>
                <Input
                  id="promo-end"
                  type="date"
                  value={form.endsAt}
                  onChange={(event) => setForm({ ...form, endsAt: event.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="promo-max" hint="optional">
                  Max redemptions
                </Label>
                <Input
                  id="promo-max"
                  type="number"
                  min={1}
                  value={form.maxRedemptions}
                  onChange={(event) => setForm({ ...form, maxRedemptions: event.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="promo-branch">Branch</Label>
                <Select
                  id="promo-branch"
                  value={form.branchId}
                  onChange={(event) => setForm({ ...form, branchId: event.target.value })}
                >
                  <option value="">All branches</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <label className="flex items-center gap-2 pt-1 text-[12px] text-ink-soft">
              <Checkbox
                checked={form.isActive}
                onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
              />
              Active — guests can use it now
            </label>

            {error ? (
              <p
                role="alert"
                className="border border-danger/30 bg-danger-soft px-2.5 py-1.5 text-[11px] text-danger"
              >
                {error}
              </p>
            ) : null}

            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={save} loading={busy}>
                {form.id ? 'Save changes' : 'Create promotion'}
              </Button>
              <Button variant="secondary" onClick={() => setForm(null)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        </aside>
      ) : (
        <aside className="border border-dashed border-line-strong px-4 py-6 text-[11.5px] leading-relaxed text-muted">
          Select a promotion to edit it, or create a new one. Codes are applied by the pricing engine at order
          time, inside the same transaction that writes the order.
        </aside>
      )}
    </div>
  );
}
