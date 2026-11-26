'use client';

import * as React from 'react';
import type { Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { BellRing, Check, Clock, Receipt, Utensils } from 'lucide-react';
import { clientApi, errorMessage } from '@/lib/api';
import { socketBaseUrl } from '@/lib/socket';
import { connectRealtime } from '@/lib/realtime';
import { cn, elapsedLabel, formatDateTime, formatTime } from '@/lib/utils';
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

type StatusFilter = 'ACTIVE' | 'RESOLVED' | 'ALL';

const TABS: Array<{ key: StatusFilter; label: string; query: string }> = [
  { key: 'ACTIVE', label: 'Active', query: '' },
  { key: 'RESOLVED', label: 'Resolved', query: '&status=RESOLVED' },
  { key: 'ALL', label: 'All', query: '&status=ALL' },
];

export function RequestsBoard({
  initialRequests,
  branchId,
}: {
  initialRequests: TableRequestRow[];
  branchId: string;
}) {
  const [requests, setRequests] = React.useState(initialRequests);
  const [status, setStatus] = React.useState<StatusFilter>('ACTIVE');
  const [busy, setBusy] = React.useState<string | null>(null);
  const [live, setLive] = React.useState(false);
  const statusRef = React.useRef<StatusFilter>('ACTIVE');
  const previousCount = React.useRef(initialRequests.length);

  statusRef.current = status;

  const load = React.useCallback(
    async (next: StatusFilter, notify = false) => {
      const query = TABS.find((tab) => tab.key === next)?.query ?? '';
      try {
        const fresh = await clientApi<TableRequestRow[]>(`/table-requests?branchId=${branchId}${query}`);
        setRequests(fresh);
        if (next === 'ACTIVE' && notify && fresh.length > previousCount.current) {
          const newest = fresh[fresh.length - 1];
          if (newest) toast.info(`New request · Table ${newest.table.number}`);
        }
        previousCount.current = fresh.length;
      } catch {
        // silent; the next poll retries
      }
    },
    [branchId],
  );

  React.useEffect(() => {
    void load(status);
    const timer = setInterval(() => void load(statusRef.current, true), 15_000);
    return () => clearInterval(timer);
  }, [status, load]);

  React.useEffect(() => {
    const socket: Socket = connectRealtime(`${socketBaseUrl()}/realtime`, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });
    const refresh = () => {
      setLive(true);
      void load(statusRef.current, true);
    };
    socket.on('connect', () => setLive(true));
    socket.on('disconnect', () => setLive(false));
    socket.on('table.request.created', refresh);
    socket.on('table.request.updated', refresh);
    socket.on('table.updated', refresh);
    return () => {
      socket.disconnect();
    };
  }, [load]);

  async function act(id: string, action: 'acknowledge' | 'resolve') {
    setBusy(id);
    try {
      await clientApi(`/table-requests/${id}/${action}`, {
        method: 'POST',
        body: action === 'resolve' ? { note: 'Handled by floor staff' } : {},
      });
      toast.success(action === 'acknowledge' ? 'Request acknowledged' : 'Request resolved');
      if (status === 'ACTIVE') {
        setRequests((current) => current.filter((request) => request.id !== id));
      } else {
        await load(status);
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex max-w-full flex-wrap border border-line bg-surface-raised">
          {TABS.map((tab, index) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatus(tab.key)}
              aria-pressed={status === tab.key}
              className={cn(
                'border-line px-3 py-1.5 text-[11.5px] font-medium transition-colors',
                index < TABS.length - 1 && 'border-r',
                status === tab.key ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-paper-deep hover:text-ink',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 border px-2 py-1 text-[10.5px] font-medium',
            live ? 'border-success/30 bg-success-soft text-success' : 'border-line bg-paper-deep text-muted',
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', live ? 'bg-success' : 'bg-muted')} />
          {live ? 'Live' : 'Polling'}
        </span>
      </div>

      {requests.length === 0 ? (
        <EmptyState
          title={status === 'RESOLVED' ? 'Nothing resolved yet' : 'No open requests'}
          description={
            status === 'RESOLVED'
              ? 'Resolved and acknowledged requests stay here as a record of the shift.'
              : 'Guests can call a waiter or request the bill from their table menu. New requests appear here instantly.'
          }
          icon={<BellRing className="h-7 w-7" />}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {requests.map((request) => {
            const meta = TYPE_META[request.type] ?? { label: request.type, icon: BellRing };
            const Icon = meta.icon;
            const age = Math.floor((Date.now() - new Date(request.createdAt).getTime()) / 1000);
            const urgent = request.status !== 'RESOLVED' && age > 180;
            const closed = request.status === 'RESOLVED' || request.status === 'CANCELLED';
            return (
              <article
                key={request.id}
                className={cn(
                  'border bg-surface-raised p-4',
                  urgent ? 'border-danger/40' : 'border-line',
                  closed && 'opacity-80',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <span className="grid h-8 w-8 place-items-center border border-line bg-paper-deep text-ink-soft">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-[13px] font-semibold text-ink">Table {request.table.number}</p>
                      <p className="text-[11px] text-muted">{meta.label}</p>
                    </div>
                  </div>
                  <StatusBadge status={request.status} />
                </div>

                {request.note ? (
                  <p className="mt-2 border border-line bg-paper px-2 py-1 text-[11px] text-ink-soft">
                    {request.note}
                  </p>
                ) : null}

                <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {closed
                      ? request.resolvedAt
                        ? `closed ${elapsedLabel(request.resolvedAt)} ago`
                        : 'closed'
                      : `waiting ${elapsedLabel(request.createdAt)}`}
                  </span>
                  <span>{formatTime(request.createdAt)}</span>
                </div>

                {request.assignedTo ? (
                  <p className="mt-1 text-[10.5px] text-muted">claimed by {request.assignedTo.name}</p>
                ) : null}

                {closed ? (
                  <p className="mt-2 border-t border-line pt-2 text-[10.5px] text-muted">
                    {request.resolutionNote ?? 'No note recorded'} ·{' '}
                    {request.resolvedAt ? formatDateTime(request.resolvedAt) : ''}
                  </p>
                ) : (
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
                    <Button
                      size="sm"
                      onClick={() => act(request.id, 'resolve')}
                      loading={busy === request.id}
                    >
                      <Check className="h-3.5 w-3.5" /> Resolve
                    </Button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
