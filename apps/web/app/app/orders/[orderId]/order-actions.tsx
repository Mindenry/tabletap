'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, ChefHat, Play, UtensilsCrossed, X } from 'lucide-react';
import { clientApi, errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Label, Textarea } from '@/components/ui/input';

export function OrderActions({
  orderId,
  status,
  branchId,
  canKitchen,
  canServe,
  canCancel,
}: {
  orderId: string;
  status: string;
  branchId: string;
  canKitchen: boolean;
  canServe: boolean;
  canCancel: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');

  async function act(path: string, success: string) {
    setBusy(true);
    try {
      await clientApi(path, { method: 'POST' });
      toast.success(success);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (reason.trim().length < 3) {
      toast.error('Give a reason');
      return;
    }
    setBusy(true);
    try {
      await clientApi(`/orders/${orderId}/cancel`, { method: 'POST', body: { reason: reason.trim() } });
      toast.success('Order cancelled; stock reversed where deducted');
      setCancelOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-3">
        {canKitchen && status === 'PENDING' ? (
          <Button
            className="w-full"
            onClick={() => act(`/orders/${orderId}/accept`, 'Order accepted')}
            loading={busy}
          >
            <Check className="h-4 w-4" /> Accept order
          </Button>
        ) : null}
        {canKitchen && status === 'ACCEPTED' ? (
          <Button
            className="w-full"
            onClick={() => act(`/orders/${orderId}/preparing`, 'Preparation started')}
            loading={busy}
          >
            <Play className="h-4 w-4" /> Start preparing
          </Button>
        ) : null}
        {canKitchen && status === 'PREPARING' ? (
          <Button
            className="w-full"
            onClick={() => act(`/orders/${orderId}/ready`, 'Order marked ready')}
            loading={busy}
          >
            <ChefHat className="h-4 w-4" /> Mark ready
          </Button>
        ) : null}
        {canServe && status === 'READY' ? (
          <Button
            className="w-full"
            onClick={() => act(`/orders/${orderId}/served`, 'Order served')}
            loading={busy}
          >
            <UtensilsCrossed className="h-4 w-4" /> Mark served
          </Button>
        ) : null}
        {canCancel && ['PENDING', 'ACCEPTED', 'PREPARING'].includes(status) ? (
          <Button variant="danger" className="w-full" onClick={() => setCancelOpen(true)}>
            <X className="h-4 w-4" /> Cancel order
          </Button>
        ) : null}
        <p className="pt-1 text-[11px] text-muted">
          Order status is derived from its items and tickets; invalid transitions are rejected by the API.
        </p>
        <a
          href={`/app/pos?branch=${branchId}`}
          className="inline-flex text-[11px] font-medium text-brand hover:underline"
        >
          Go to POS
        </a>
      </CardContent>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent
          title="Cancel this order"
          description="The kitchen is notified, items are cancelled, and any stock already deducted is returned exactly once."
        >
          <div className="space-y-2">
            <Label htmlFor="cancel-reason">Reason</Label>
            <Textarea
              id="cancel-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Guest changed their mind"
              maxLength={300}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              Keep order
            </Button>
            <Button variant="danger" onClick={cancel} loading={busy}>
              Cancel order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
