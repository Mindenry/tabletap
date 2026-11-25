'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Settings2 } from 'lucide-react';
import { clientApi, errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Label, Select } from '@/components/ui/input';

export function TenantActions({
  tenantId,
  tenantName,
  status,
  plan,
  plans,
}: {
  tenantId: string;
  tenantName: string;
  status: string;
  plan: string;
  plans: Array<{ key: string; name: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [nextPlan, setNextPlan] = React.useState(plan);

  async function setTenantStatus(next: 'ACTIVE' | 'SUSPENDED') {
    setBusy(true);
    try {
      await clientApi(`/platform/tenants/${tenantId}/status`, {
        method: 'POST',
        body: {
          status: next,
          reason: next === 'SUSPENDED' ? 'Suspended from platform console' : 'Reactivated',
        },
      });
      toast.success(next === 'SUSPENDED' ? 'Tenant suspended; sessions revoked' : 'Tenant reactivated');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function changePlan() {
    setBusy(true);
    try {
      await clientApi(`/platform/subscriptions/${tenantId}`, {
        method: 'PATCH',
        body: { planKey: nextPlan },
      });
      toast.success('Plan updated');
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          <Settings2 className="h-3.5 w-3.5" /> Manage
        </Button>
        {status === 'ACTIVE' ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-danger"
            onClick={() => setTenantStatus('SUSPENDED')}
            disabled={busy}
          >
            Suspend
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="text-success"
            onClick={() => setTenantStatus('ACTIVE')}
            disabled={busy}
          >
            Activate
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title={`Manage ${tenantName}`}
          description="Plan changes take effect on the next entitlement check."
        >
          <div className="space-y-2">
            <Label htmlFor="plan">Plan</Label>
            <Select id="plan" value={nextPlan} onChange={(event) => setNextPlan(event.target.value)}>
              {plans.map((candidate) => (
                <option key={candidate.key} value={candidate.key}>
                  {candidate.name}
                </option>
              ))}
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={changePlan} loading={busy}>
              Save plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
