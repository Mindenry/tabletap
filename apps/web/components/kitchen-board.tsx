'use client';

import * as React from 'react';
import { io, type Socket } from 'socket.io-client';
import { toast } from 'sonner';
import {
  Bell,
  BellOff,
  Check,
  ChefHat,
  Clock,
  Flame,
  Play,
  RefreshCw,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { clientApi, errorMessage } from '@/lib/api';
import { socketBaseUrl } from '@/lib/socket';
import { cn, elapsedLabel, formatTime } from '@/lib/utils';
import type { KitchenTicket } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Label, Textarea } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/card';

const STATUS_PRIORITY: Record<string, number> = {
  PENDING: 0,
  ACCEPTED: 1,
  PREPARING: 2,
  READY: 3,
  SERVED: 4,
  REJECTED: 5,
};

function useBeep(enabled: boolean) {
  const contextRef = React.useRef<AudioContext | null>(null);

  return React.useCallback(() => {
    if (!enabled) return;
    try {
      const AudioContextCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!contextRef.current) contextRef.current = new AudioContextCtor();
      const context = contextRef.current;
      if (context.state === 'suspended') void context.resume();
      const now = context.currentTime;
      [880, 1174].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, now + index * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.16, now + index * 0.18 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.18 + 0.16);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now + index * 0.18);
        oscillator.stop(now + index * 0.18 + 0.17);
      });
    } catch {
      // Audio is a nicety; never let it break the board.
    }
  }, [enabled]);
}

export function KitchenBoard({
  branchId,
  stations,
  initialTickets,
  canUpdate,
  fullscreen = false,
}: {
  branchId: string;
  stations: Array<{ id: string; name: string; code: string }>;
  initialTickets: KitchenTicket[];
  canUpdate: boolean;
  fullscreen?: boolean;
}) {
  const [tickets, setTickets] = React.useState(initialTickets);
  const [station, setStation] = React.useState('ALL');
  const [sound, setSound] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [rejecting, setRejecting] = React.useState<KitchenTicket | null>(null);
  const [rejectReason, setRejectReason] = React.useState('');
  const [connected, setConnected] = React.useState(false);
  const [tick, setTick] = React.useState(0);
  const knownIds = React.useRef(new Set(initialTickets.map((ticket) => ticket.id)));
  const beep = useBeep(sound);

  const refresh = React.useCallback(async () => {
    try {
      const fresh = await clientApi<KitchenTicket[]>(`/kitchen/tickets?branchId=${branchId}`);
      const hasNew = fresh.some((ticket) => !knownIds.current.has(ticket.id));
      knownIds.current = new Set(fresh.map((ticket) => ticket.id));
      setTickets(fresh);
      if (hasNew) beep();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }, [branchId, beep]);

  React.useEffect(() => {
    setTickets(initialTickets);
    knownIds.current = new Set(initialTickets.map((ticket) => ticket.id));
  }, [initialTickets]);

  React.useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 1000);
    const poll = setInterval(() => void refresh(), 20_000);
    return () => {
      clearInterval(timer);
      clearInterval(poll);
    };
  }, [refresh]);

  React.useEffect(() => {
    const apiUrl = socketBaseUrl();
    const socket: Socket = io(`${apiUrl}/realtime`, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('ready', () => setConnected(true));
    const onChange = () => void refresh();
    for (const event of [
      'kitchen.ticket.created',
      'kitchen.ticket.updated',
      'kitchen.item.ready',
      'order.created',
      'order.accepted',
      'order.updated',
    ]) {
      socket.on(event, onChange);
    }
    return () => {
      socket.disconnect();
    };
  }, [refresh]);

  async function act(ticket: KitchenTicket, action: 'accept' | 'start' | 'ready' | 'served') {
    setBusyId(ticket.id);
    try {
      await clientApi(`/kitchen/tickets/${ticket.id}/${action}`, { method: 'POST' });
      toast.success(`Ticket ${ticket.number} ${action === 'ready' ? 'ready' : action}`);
      await refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  async function markItemReady(ticket: KitchenTicket, itemId: string) {
    setBusyId(ticket.id);
    try {
      await clientApi(`/kitchen/items/${itemId}/ready`, { method: 'POST' });
      await refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  async function reject() {
    if (!rejecting) return;
    if (rejectReason.trim().length < 3) {
      toast.error('Give a reason so the floor can explain it to the guest.');
      return;
    }
    setBusyId(rejecting.id);
    try {
      await clientApi(`/kitchen/tickets/${rejecting.id}/reject`, {
        method: 'POST',
        body: { reason: rejectReason.trim() },
      });
      toast.success('Ticket rejected and stock returned');
      setRejecting(null);
      setRejectReason('');
      await refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusyId(null);
    }
  }

  const visible = (
    station === 'ALL' ? tickets : tickets.filter((ticket) => ticket.station.id === station)
  ).sort(
    (a, b) =>
      (STATUS_PRIORITY[a.status] ?? 9) - (STATUS_PRIORITY[b.status] ?? 9) ||
      +new Date(a.createdAt) - +new Date(b.createdAt),
  );

  const counts = {
    pending: tickets.filter((ticket) => ticket.status === 'PENDING').length,
    preparing: tickets.filter((ticket) => ticket.status === 'PREPARING' || ticket.status === 'ACCEPTED')
      .length,
    ready: tickets.filter((ticket) => ticket.status === 'READY').length,
  };

  return (
    <div className={cn('space-y-4', fullscreen && 'space-y-5')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex max-w-full flex-wrap items-center border border-line bg-surface-raised">
          <button
            type="button"
            onClick={() => setStation('ALL')}
            aria-pressed={station === 'ALL'}
            className={cn(
              'border-r border-line px-3 py-1.5 text-[11.5px] font-semibold transition-colors',
              station === 'ALL' ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-paper-deep',
            )}
          >
            All stations
          </button>
          {stations.map((candidate, index) => (
            <button
              key={candidate.id}
              type="button"
              onClick={() => setStation(candidate.id)}
              aria-pressed={station === candidate.id}
              className={cn(
                'px-3 py-1.5 text-[11.5px] font-medium transition-colors',
                index < stations.length - 1 && 'border-r border-line',
                station === candidate.id ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-paper-deep',
              )}
            >
              {candidate.name}
              <span className="ml-1.5 text-[10px] tabular opacity-60">
                {tickets.filter((ticket) => ticket.station.id === candidate.id).length}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 border px-2 py-1 text-[10.5px] font-medium',
              connected
                ? 'border-success/30 bg-success-soft text-success'
                : 'border-line bg-paper-deep text-muted',
            )}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', connected ? 'bg-success' : 'bg-muted')} />
            {connected ? 'Live' : 'Polling'}
          </span>
          <Button variant="outline" size="sm" onClick={() => setSound((value) => !value)}>
            {sound ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
            {sound ? 'Sound on' : 'Sound off'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void refresh()}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-line border-y border-line">
        {[
          { label: 'New', value: counts.pending, tone: 'text-brand' },
          { label: 'In progress', value: counts.preparing, tone: 'text-gold' },
          { label: 'Ready to serve', value: counts.ready, tone: 'text-success' },
        ].map((stat) => (
          <div key={stat.label} className="px-1 py-2.5 sm:px-3">
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted">{stat.label}</p>
            <p className={cn('money mt-1 text-[22px] leading-none', stat.tone)}>{stat.value}</p>
          </div>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="No open tickets"
          description="New orders appear here the moment they are placed. Keep this screen open during service."
          icon={<ChefHat className="h-7 w-7" />}
        />
      ) : (
        <div
          className={cn(
            'grid gap-3',
            fullscreen ? 'xl:grid-cols-3 lg:grid-cols-2' : 'lg:grid-cols-2 xl:grid-cols-3',
          )}
        >
          {visible.map((ticket) => {
            const ageSeconds = Math.floor((Date.now() - new Date(ticket.createdAt).getTime()) / 1000);
            const late = ageSeconds > 12 * 60 && ticket.status !== 'READY';
            const lines = ticket.items;
            const allReady = lines.every((line) => line.status === 'READY' || line.status === 'SERVED');
            return (
              <article
                key={ticket.id}
                className={cn(
                  'flex flex-col rounded-sm border bg-surface-raised',
                  ticket.status === 'PENDING' && 'border-brand/40',
                  ticket.status === 'READY' && 'border-success/40',
                  late && 'border-danger/60',
                )}
              >
                <header className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-[16px] font-semibold leading-none">
                        Table {ticket.order.table.number}
                      </h3>
                      <StatusBadge status={ticket.status} />
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
                      <span className="font-mono">{ticket.order.number}</span>
                      <span className="rounded-full bg-paper-deep px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-soft">
                        {ticket.station.name}
                      </span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={cn(
                        'inline-flex items-center gap-1 tabular text-[13px] font-semibold',
                        late ? 'text-danger' : 'text-ink-soft',
                      )}
                    >
                      <Clock className="h-3.5 w-3.5" />
                      {Math.floor(ageSeconds / 60)}:{String(ageSeconds % 60).padStart(2, '0')}
                    </p>
                    <p className="text-[10px] text-muted">{formatTime(ticket.createdAt)}</p>
                  </div>
                </header>

                <ul className="flex-1 divide-y divide-line/60 px-4">
                  {lines.map((line) => (
                    <li key={line.id} className="flex items-start gap-3 py-2.5">
                      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded bg-paper-deep text-[11px] font-semibold">
                        {line.quantity}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            'text-[13px] font-medium leading-snug',
                            line.status === 'READY' && 'text-muted line-through',
                          )}
                        >
                          {line.name}
                          {line.variantName ? (
                            <span className="text-muted"> · {line.variantName}</span>
                          ) : null}
                        </p>
                        {line.modifiers.length > 0 ? (
                          <p className="text-[11px] text-muted">
                            {line.modifiers.map((modifier) => modifier.name).join(' · ')}
                          </p>
                        ) : null}
                        {line.note ? (
                          <p className="mt-0.5 inline-flex items-center gap-1 rounded bg-gold-soft px-1.5 py-0.5 text-[10px] font-medium text-gold">
                            <Flame className="h-2.5 w-2.5" /> {line.note}
                          </p>
                        ) : null}
                      </div>
                      {canUpdate &&
                      line.status !== 'READY' &&
                      line.status !== 'SERVED' &&
                      (ticket.status === 'ACCEPTED' || ticket.status === 'PREPARING') ? (
                        <button
                          type="button"
                          onClick={() => void markItemReady(ticket, line.id)}
                          disabled={busyId === ticket.id}
                          className="shrink-0 rounded border border-line-strong px-2 py-1 text-[10px] font-medium text-muted hover:border-success/50 hover:text-success"
                        >
                          Ready
                        </button>
                      ) : line.status === 'READY' || line.status === 'SERVED' ? (
                        <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-success" />
                      ) : null}
                    </li>
                  ))}
                </ul>

                {ticket.order.note ? (
                  <p className="border-t border-line bg-paper/60 px-4 py-2 text-[11px] text-muted">
                    Order note: {ticket.order.note}
                  </p>
                ) : null}

                {canUpdate ? (
                  <footer className="flex flex-wrap gap-2 border-t border-line px-3 py-3">
                    {ticket.status === 'PENDING' ? (
                      <>
                        <Button
                          size="sm"
                          onClick={() => void act(ticket, 'accept')}
                          loading={busyId === ticket.id}
                        >
                          <Check className="h-3.5 w-3.5" /> Accept
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setRejecting(ticket)}>
                          <X className="h-3.5 w-3.5" /> Reject
                        </Button>
                      </>
                    ) : null}
                    {ticket.status === 'ACCEPTED' ? (
                      <Button
                        size="sm"
                        onClick={() => void act(ticket, 'start')}
                        loading={busyId === ticket.id}
                      >
                        <Play className="h-3.5 w-3.5" /> Start cooking
                      </Button>
                    ) : null}
                    {ticket.status === 'PREPARING' ? (
                      <Button
                        size="sm"
                        variant={allReady ? 'primary' : 'secondary'}
                        onClick={() => void act(ticket, 'ready')}
                        loading={busyId === ticket.id}
                      >
                        <UtensilsCrossed className="h-3.5 w-3.5" /> Ticket ready
                      </Button>
                    ) : null}
                    {ticket.status === 'READY' ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void act(ticket, 'served')}
                        loading={busyId === ticket.id}
                      >
                        <Check className="h-3.5 w-3.5" /> Mark served
                      </Button>
                    ) : null}
                    {ticket.status === 'PREPARING' || ticket.status === 'ACCEPTED' ? (
                      <Button size="sm" variant="ghost" onClick={() => setRejecting(ticket)}>
                        <X className="h-3.5 w-3.5" /> Reject
                      </Button>
                    ) : null}
                  </footer>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      <Dialog open={Boolean(rejecting)} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent
          title="Reject ticket"
          description="The guest is told the item is unavailable, the item is cancelled, and its ingredients are returned to stock."
        >
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Reason</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder="Out of prawns — supplier delivery late"
              maxLength={300}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejecting(null)}>
              Keep ticket
            </Button>
            <Button
              variant="danger"
              onClick={() => void reject()}
              loading={Boolean(rejecting && busyId === rejecting.id)}
            >
              Reject and reverse stock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="border-t border-line pt-2 text-[10.5px] text-muted">
        {tick >= 0 ? 'Timers tick every second; the board resyncs every 20 seconds.' : ''} Rejecting a ticket
        reverses only that station&apos;s stock movements.
      </p>
    </div>
  );
}
