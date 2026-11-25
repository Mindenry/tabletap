'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BellRing, Check, Clock, Receipt, Utensils } from 'lucide-react';
import { clientApi, errorMessage } from '@/lib/api';
import { cn, elapsedLabel, formatTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/card';
import type { TableRequestRow } from './page';

const TYPE_META: Record<string, { label: string; icon: React.ElementType }> = {
  CALL_WAITER: { label: 'Call waiter', icon: BellRing },
  REQUEST_BILL: { label: 'Bill requested', icon: Receipt },
  REQUEST_WATER: { label: 'Water', icon: Utensils },
  REQUEST_UTENSILS: { label: 'Utensils', icon: Utensils },
  REPORT_ISSUE: { label: 'Issue reported', icon: BellRing },
};

export function RequestsBoard({
  initialRequests,
  branchId,
}: {
  initialRequests: TableRequestRow[];
  branchId: string;
}) {
  const router = useRouter();
  const [requests, setRequests] = React.useState(initialRequests);
  const [busy, setBusy] = React.useState<string | null>(null);

  React.useEffect(() => setRequests(initialRequests), [initialRequests]);

  React.useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const fresh = await clientApi<TableRequestRow[]>(`/table-requests?branchId=${branchId}`);
        setRequests(fresh);
      } catch {
        // silent; next tick retries
      }
    }, 15_000);
    return () => clearInterval(timer);
  }, [branchId]);

  async function act(id: string, action: 'acknowledge' | 'resolve') {
    setBusy(id);
    try {
      await clientApi(`/table-requests/${id}/${action}`, {
        method: 'POST',
        body: action === 'resolve' ? { note: 'Handled by floor staff' } : {},
      });
      toast.success(action === 'acknowledge' ? 'Request acknowledged' : 'Request resolved');
      setRequests((current) => current.filter((request) => request.id !== id));
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  if (requests.length === 0) {
    return (
      <EmptyState
        title="No open requests"
        description="Guests can call a waiter or request the bill from their table menu. Requests appear here instantly."
        icon={<BellRing className="h-7 w-7" />}
      />
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {requests.map((request) => {
        const meta = TYPE_META[request.type] ?? { label: request.type, icon: BellRing };
        const Icon = meta.icon;
        const age = Math.floor((Date.now() - new Date(request.createdAt).getTime()) / 1000);
        const urgent = age > 180;
        return (
          <article
            key={request.id}
            className={cn(
              'rounded-lg border bg-surface-raised p-4',
              urgent ? 'border-danger/40' : 'border-line',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-md bg-brand-soft text-brand-deep">
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[13px] font-semibold">Table {request.table.number}</p>
                  <p className="text-[11px] text-muted">{meta.label}</p>
                </div>
              </div>
              <StatusBadge status={request.status} />
            </div>

            {request.note ? (
              <p className="mt-2 rounded bg-paper px-2 py-1 text-[11px] text-ink-soft">{request.note}</p>
            ) : null}

            <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> waiting {elapsedLabel(request.createdAt)}
              </span>
              <span>{formatTime(request.createdAt)}</span>
            </div>

            <div className="mt-3 flex gap-2">
              {request.status === 'OPEN' ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => act(request.id, 'acknowledge')}
                  loading={busy === request.id}
                >
                  Acknowledge
                </Button>
              ) : null}
              <Button size="sm" onClick={() => act(request.id, 'resolve')} loading={busy === request.id}>
                <Check className="h-3.5 w-3.5" /> Resolve
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
