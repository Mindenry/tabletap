'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowRightLeft,
  BrushCleaning,
  Clock,
  CreditCard,
  Download,
  Link2,
  Merge,
  Plus,
  QrCode,
  RefreshCw,
  Users,
  X,
} from 'lucide-react';
import { clientApi, errorMessage } from '@/lib/api';
import { cn, elapsedLabel, formatTHB } from '@/lib/utils';
import type { TableRow } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';

const STATUS_STYLES: Record<string, string> = {
  AVAILABLE: 'border-line bg-surface-raised hover:border-success/40',
  OCCUPIED: 'border-brand/25 bg-brand-soft/40',
  ORDERING: 'border-brand/40 bg-brand-soft/60',
  BILL_REQUESTED: 'border-gold/40 bg-gold-soft/60',
  PAYMENT_PENDING: 'border-olive/40 bg-olive-soft/60',
  CLEANING: 'border-line bg-paper-deep/70',
};

const REQUEST_LABELS: Record<string, string> = {
  CALL_WAITER: 'Waiter called',
  REQUEST_BILL: 'Bill requested',
  REQUEST_WATER: 'Water',
  REQUEST_UTENSILS: 'Utensils',
  REPORT_ISSUE: 'Issue reported',
};

export function FloorBoard({
  branchId,
  initialTables,
  zones,
  canUpdate,
  canCreateBill,
}: {
  branchId: string;
  initialTables: TableRow[];
  zones: Array<{ id: string; name: string; displayOrder: number }>;
  canUpdate: boolean;
  canCreateBill: boolean;
}) {
  const router = useRouter();
  const [zone, setZone] = React.useState<string>('ALL');
  const [selected, setSelected] = React.useState<TableRow | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [guests, setGuests] = React.useState('2');
  const [qr, setQr] = React.useState<{ token: string; url: string; prefix: string } | null>(null);
  const [qrLoading, setQrLoading] = React.useState(false);
  const [moveTarget, setMoveTarget] = React.useState('');
  const [mergeSource, setMergeSource] = React.useState('');
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Keep the selected row in sync after a refresh.
  React.useEffect(() => {
    if (!selected) return;
    const fresh = initialTables.find((table) => table.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [initialTables, selected]);

  const visible = zone === 'ALL' ? initialTables : initialTables.filter((table) => table.zone?.id === zone);
  const occupied = initialTables.filter((table) => table.session);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function openSession() {
    if (!selected) return;
    await run(
      () =>
        clientApi(`/tables/${selected.id}/open-session`, {
          method: 'POST',
          body: { guestCount: Number(guests) || 0 },
        }),
      `Table ${selected.number} opened`,
    );
    setSelected(null);
  }

  async function closeSession() {
    if (!selected) return;
    await run(
      () => clientApi(`/tables/${selected.id}/close-session`, { method: 'POST', body: {} }),
      `Table ${selected.number} closed`,
    );
    setSelected(null);
  }

  async function markCleaned() {
    if (!selected) return;
    await run(
      () => clientApi(`/tables/${selected.id}/cleaned`, { method: 'POST', body: {} }),
      `Table ${selected.number} is available`,
    );
    setSelected(null);
  }

  async function loadQr() {
    if (!selected) return;
    setQrLoading(true);
    try {
      const result = await clientApi<{ token: string; url: string; prefix: string }>(
        `/tables/${selected.id}/qr`,
        {
          method: 'POST',
        },
      );
      setQr(result);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setQrLoading(false);
    }
  }

  async function rotateQr() {
    if (!selected) return;
    setQrLoading(true);
    try {
      const result = await clientApi<{ token: string; url: string; prefix: string }>(
        `/tables/${selected.id}/qr/rotate`,
        { method: 'POST' },
      );
      setQr(result);
      toast.success('New QR issued. Old labels no longer work.');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setQrLoading(false);
    }
  }

  async function moveSession() {
    if (!selected || !moveTarget) return;
    await run(
      () => clientApi(`/tables/${selected.id}/move`, { method: 'POST', body: { targetTableId: moveTarget } }),
      'Table moved',
    );
    setSelected(null);
    setMoveTarget('');
  }

  async function mergeTables() {
    if (!selected || !mergeSource) return;
    await run(
      () =>
        clientApi(`/tables/${selected.id}/merge`, { method: 'POST', body: { sourceTableId: mergeSource } }),
      'Tables merged',
    );
    setSelected(null);
    setMergeSource('');
  }

  function printLabel() {
    if (!selected || !qr) return;
    const imageUrl = `/api/v1/tables/${selected.id}/qr/download?format=png`;
    const win = window.open('', '_blank', 'width=520,height=720');
    if (!win) return;
    win.document.write(`<!doctype html><html><head><title>Table ${selected.number} QR</title>
      <style>
        body{font-family:ui-sans-serif,system-ui,sans-serif;text-align:center;padding:40px;color:#191712}
        .card{border:1px solid #e2dbcd;border-radius:16px;padding:28px;max-width:380px;margin:0 auto}
        h1{font-size:38px;margin:0 0 4px}
        p{color:#726c5f;font-size:13px;margin:4px 0}
        img{width:260px;height:260px;margin:18px auto;display:block}
        .brand{color:#b8532e;font-weight:700;letter-spacing:.12em;font-size:11px;text-transform:uppercase}
      </style></head><body>
      <div class="card">
        <p class="brand">TableTap · Spice Garden</p>
        <h1>Table ${selected.number}</h1>
        <p>Scan to view the menu and order</p>
        <img src="${imageUrl}" alt="QR code for table ${selected.number}" />
        <p>เปิดเมนูและสั่งอาหารได้ทันที</p>
      </div>
      <script>window.onload=()=>setTimeout(()=>window.print(),400)</script>
      </body></html>`);
    win.document.close();
  }

  const availableForMove = initialTables.filter((table) => !table.session && table.id !== selected?.id);
  const mergeCandidates = occupied.filter((table) => table.id !== selected?.id && table.session);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setZone('ALL')}
            className={cn(
              'rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors',
              zone === 'ALL' ? 'bg-ink text-paper' : 'bg-surface text-ink-soft hover:bg-paper-deep',
            )}
          >
            All · {initialTables.length}
          </button>
          {zones.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              onClick={() => setZone(candidate.id)}
              className={cn(
                'rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors',
                zone === candidate.id ? 'bg-ink text-paper' : 'bg-surface text-ink-soft hover:bg-paper-deep',
              )}
            >
              {candidate.name} · {initialTables.filter((table) => table.zone?.id === candidate.id).length}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 text-[11px] text-muted">
          {[
            ['OCCUPIED', 'Seated'],
            ['ORDERING', 'Ordering'],
            ['BILL_REQUESTED', 'Bill'],
            ['PAYMENT_PENDING', 'Paying'],
            ['AVAILABLE', 'Free'],
          ].map(([status, label]) => (
            <span key={status} className="inline-flex items-center gap-1.5">
              <span
                className={cn('h-2 w-2 rounded-full', {
                  'bg-brand': status === 'OCCUPIED',
                  'bg-brand-deep': status === 'ORDERING',
                  'bg-gold': status === 'BILL_REQUESTED',
                  'bg-olive': status === 'PAYMENT_PENDING',
                  'bg-success': status === 'AVAILABLE',
                })}
              />
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map((table) => (
          <button
            key={table.id}
            type="button"
            onClick={() => {
              setSelected(table);
              setQr(null);
              setMoveTarget('');
              setMergeSource('');
            }}
            className={cn(
              'group flex min-h-[132px] flex-col justify-between rounded-lg border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-card',
              STATUS_STYLES[table.status] ?? STATUS_STYLES.AVAILABLE!,
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[18px] font-semibold leading-none tracking-tight">Table {table.number}</p>
                <p className="mt-1 text-[11px] text-muted">
                  {table.zone?.name ?? 'Unzoned'} · {table.capacity} seats
                </p>
              </div>
              <StatusBadge status={table.status} />
            </div>

            {table.session ? (
              <div className="mt-3 space-y-1">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="inline-flex items-center gap-1 text-muted">
                    <Clock className="h-3 w-3" /> {elapsedLabel(table.session.openedAt)}
                  </span>
                  <span className="tabular font-semibold text-ink">
                    {formatTHB(table.session.outstandingTotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted">
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3" /> {table.session.guestCount || '—'}
                  </span>
                  <span>{table.session.orderCount} order(s)</span>
                </div>
                {table.session.openRequests > 0 ? (
                  <p className="rounded bg-danger-soft px-2 py-0.5 text-[10px] font-semibold text-danger">
                    {table.session.openRequests} open request(s)
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
                <span>{table.status === 'CLEANING' ? 'Waiting to be reset' : 'Ready for guests'}</span>
                {table.qr ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium">
                    <QrCode className="h-3 w-3" /> QR
                  </span>
                ) : (
                  <span className="text-danger">No QR</span>
                )}
              </div>
            )}

            <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-brand opacity-0 transition-opacity group-hover:opacity-100">
              Manage <ArrowRightLeft className="h-3 w-3" />
            </span>
          </button>
        ))}
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        {selected ? (
          <DialogContent
            title={`Table ${selected.number}`}
            description={`${selected.zone?.name ?? 'Unzoned'} · ${selected.capacity} seats · ${selected.status.replace(/_/g, ' ').toLowerCase()}`}
          >
            <div className="space-y-5">
              {selected.session ? (
                <div className="rounded-lg border border-line bg-paper/60 p-4">
                  <div className="grid grid-cols-2 gap-3 text-[12px]">
                    <div>
                      <p className="text-muted">Session</p>
                      <p className="font-medium">{selected.session.status.replace(/_/g, ' ')}</p>
                    </div>
                    <div>
                      <p className="text-muted">Seated</p>
                      <p className="font-medium">{elapsedLabel(selected.session.openedAt)} ago</p>
                    </div>
                    <div>
                      <p className="text-muted">Orders</p>
                      <p className="font-medium">{selected.session.orderCount}</p>
                    </div>
                    <div>
                      <p className="text-muted">Outstanding</p>
                      <p className="font-semibold text-brand">
                        {formatTHB(selected.session.outstandingTotal)}
                      </p>
                    </div>
                  </div>

                  {canCreateBill ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={`/app/pos?branch=${branchId}&session=${selected.session.id}`}
                        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-ink px-3.5 text-[12px] font-medium text-paper hover:bg-ink-soft"
                      >
                        <CreditCard className="h-3.5 w-3.5" /> Open in POS
                      </Link>
                      <Link
                        href={`/app/orders?branch=${branchId}&session=${selected.session.id}`}
                        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-[12px] font-medium hover:bg-paper-deep"
                      >
                        View orders
                      </Link>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-line-strong bg-paper/50 p-4">
                  <p className="text-[13px] font-medium">No open session</p>
                  <p className="mt-0.5 text-[12px] text-muted">
                    Guests can also open the table by scanning its QR.
                  </p>
                  {canUpdate ? (
                    <div className="mt-3 flex items-end gap-2">
                      <div className="w-24 space-y-1">
                        <Label htmlFor="guests">Guests</Label>
                        <Input
                          id="guests"
                          type="number"
                          min={0}
                          max={50}
                          value={guests}
                          onChange={(event) => setGuests(event.target.value)}
                        />
                      </div>
                      <Button size="sm" onClick={openSession} loading={busy}>
                        <Plus className="h-3.5 w-3.5" /> Open session
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={loadQr}
                  loading={qrLoading}
                  disabled={!canUpdate && !selected.qr}
                >
                  <QrCode className="h-3.5 w-3.5" /> {selected.qr ? 'Show QR' : 'Generate QR'}
                </Button>

                {canUpdate && selected.qr ? (
                  <Button variant="ghost" size="sm" onClick={rotateQr} loading={qrLoading}>
                    <RefreshCw className="h-3.5 w-3.5" /> Rotate QR
                  </Button>
                ) : null}

                {canUpdate && selected.status === 'CLEANING' ? (
                  <Button variant="secondary" size="sm" onClick={markCleaned} loading={busy}>
                    <BrushCleaning className="h-3.5 w-3.5" /> Mark cleaned
                  </Button>
                ) : null}

                {canUpdate && selected.session ? (
                  <Button variant="danger" size="sm" onClick={closeSession} loading={busy}>
                    <X className="h-3.5 w-3.5" /> Close session
                  </Button>
                ) : null}
              </div>

              {qr ? (
                <div className="rounded-lg border border-line bg-surface p-4">
                  <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/v1/tables/${selected.id}/qr/download?format=png`}
                      alt={`QR code for table ${selected.number}`}
                      className="h-40 w-40 rounded-md border border-line bg-white p-1"
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="text-[12px] font-medium">Guest link</p>
                      <code className="block truncate rounded bg-paper-deep px-2 py-1.5 text-[11px] text-ink-soft">
                        {qr.url}
                      </code>
                      <p className="text-[11px] text-muted">
                        Prefix {qr.prefix} · rotating invalidates printed labels.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            void navigator.clipboard.writeText(qr.url);
                            toast.success('Link copied');
                          }}
                        >
                          <Link2 className="h-3.5 w-3.5" /> Copy
                        </Button>
                        <a
                          href={`/api/v1/tables/${selected.id}/qr/download?format=png`}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-[12px] font-medium hover:bg-paper-deep"
                        >
                          <Download className="h-3.5 w-3.5" /> PNG
                        </a>
                        <a
                          href={`/api/v1/tables/${selected.id}/qr/download?format=svg`}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 text-[12px] font-medium hover:bg-paper-deep"
                        >
                          <Download className="h-3.5 w-3.5" /> SVG
                        </a>
                        <Button size="sm" variant="ghost" onClick={printLabel}>
                          Print label
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {canUpdate && selected.session ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="move-target" hint="same branch">
                      Move to
                    </Label>
                    <Select
                      id="move-target"
                      value={moveTarget}
                      onChange={(event) => setMoveTarget(event.target.value)}
                    >
                      <option value="">Select a free table</option>
                      {availableForMove.map((table) => (
                        <option key={table.id} value={table.id}>
                          Table {table.number} · {table.zone?.name ?? '—'}
                        </option>
                      ))}
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      disabled={!moveTarget}
                      loading={busy}
                      onClick={moveSession}
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5" /> Move session
                    </Button>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="merge-source" hint="source closes">
                      Merge into this table
                    </Label>
                    <Select
                      id="merge-source"
                      value={mergeSource}
                      onChange={(event) => setMergeSource(event.target.value)}
                    >
                      <option value="">Select a seated table</option>
                      {mergeCandidates.map((table) => (
                        <option key={table.id} value={table.id}>
                          Table {table.number} · {formatTHB(table.session?.outstandingTotal ?? '0')}
                        </option>
                      ))}
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      disabled={!mergeSource}
                      loading={busy}
                      onClick={mergeTables}
                    >
                      <Merge className="h-3.5 w-3.5" /> Merge tables
                    </Button>
                  </div>
                </div>
              ) : null}

              {selected.session && selected.session.openRequests > 0 ? (
                <div className="rounded-md border border-gold/30 bg-gold-soft/60 px-3 py-2 text-[12px] text-gold">
                  {selected.session.openRequests} guest request(s) waiting — check the orders screen.
                </div>
              ) : null}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setSelected(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>

      <p className="text-[11px] text-muted">
        {tick >= 0 ? 'Durations refresh every 30 seconds.' : ''} Status changes are validated by the API — a
        table cannot be closed while bills are unpaid or orders are in progress.
      </p>
    </div>
  );
}
