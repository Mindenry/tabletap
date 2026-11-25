'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ReceiptText, Save, Store } from 'lucide-react';
import { clientApi, errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface TenantSettings {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxId: string | null;
}

interface BranchSettings {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  vatRate: string;
  vatInclusive: boolean;
  serviceChargeEnabled: boolean;
  serviceChargeType: string;
  serviceChargeValue: string;
  promptPayId: string | null;
  receiptHeader: string | null;
  receiptFooter: string | null;
  status: string;
}

export function SettingsForm({
  tenant,
  branch,
  branches,
  entitlements,
}: {
  tenant: TenantSettings;
  branch: BranchSettings;
  branches: Array<{ id: string; name: string }>;
  entitlements: {
    plan: string;
    status: string;
    limits: Record<string, number>;
    usage: Record<string, number>;
  } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [branchId, setBranchId] = React.useState(branch.id);

  const [tenantName, setTenantName] = React.useState(tenant.name);
  const [tenantPhone, setTenantPhone] = React.useState(tenant.phone ?? '');
  const [tenantEmail, setTenantEmail] = React.useState(tenant.email ?? '');
  const [tenantAddress, setTenantAddress] = React.useState(tenant.address ?? '');
  const [taxId, setTaxId] = React.useState(tenant.taxId ?? '');

  const [branchName, setBranchName] = React.useState(branch.name);
  const [branchPhone, setBranchPhone] = React.useState(branch.phone ?? '');
  const [branchAddress, setBranchAddress] = React.useState(branch.address ?? '');
  const [vatRate, setVatRate] = React.useState(branch.vatRate);
  const [vatInclusive, setVatInclusive] = React.useState(branch.vatInclusive);
  const [serviceEnabled, setServiceEnabled] = React.useState(branch.serviceChargeEnabled);
  const [serviceType, setServiceType] = React.useState(branch.serviceChargeType);
  const [serviceValue, setServiceValue] = React.useState(branch.serviceChargeValue);
  const [promptPayId, setPromptPayId] = React.useState(branch.promptPayId ?? '');
  const [receiptHeader, setReceiptHeader] = React.useState(branch.receiptHeader ?? '');
  const [receiptFooter, setReceiptFooter] = React.useState(branch.receiptFooter ?? '');

  async function saveTenant(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await clientApi('/tenants/current', {
        method: 'PATCH',
        body: {
          name: tenantName.trim(),
          phone: tenantPhone.trim() || undefined,
          email: tenantEmail.trim() || undefined,
          address: tenantAddress.trim() || undefined,
          taxId: taxId.trim() || undefined,
        },
      });
      toast.success('Restaurant profile saved');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveBranch(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await clientApi(`/branches/${branch.id}`, {
        method: 'PATCH',
        body: {
          name: branchName.trim(),
          phone: branchPhone.trim() || undefined,
          address: branchAddress.trim() || undefined,
          vatRate: Number(vatRate),
          vatInclusive,
          serviceChargeEnabled: serviceEnabled,
          serviceChargeType: serviceType,
          serviceChargeValue: Number(serviceValue || 0),
          promptPayId: promptPayId.replace(/\D/g, '') || undefined,
          receiptHeader: receiptHeader.trim() || undefined,
          receiptFooter: receiptFooter.trim() || undefined,
        },
      });
      toast.success('Branch settings saved');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Tabs defaultValue="branch">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList>
          <TabsTrigger value="branch">
            <Store className="mr-1.5 inline h-3.5 w-3.5" /> Branch & tax
          </TabsTrigger>
          <TabsTrigger value="restaurant">
            <ReceiptText className="mr-1.5 inline h-3.5 w-3.5" /> Restaurant
          </TabsTrigger>
          <TabsTrigger value="subscription">Plan</TabsTrigger>
        </TabsList>
        {branches.length > 1 ? (
          <Select
            value={branchId}
            onChange={(event) => setBranchId(event.target.value)}
            className="w-44"
            aria-label="Branch"
          >
            {branches.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </Select>
        ) : null}
      </div>

      <TabsContent value="branch">
        <form onSubmit={saveBranch} className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Branch profile</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 pt-2">
              <div className="grid gap-1.5">
                <Label htmlFor="branch-name">Name</Label>
                <Input
                  id="branch-name"
                  value={branchName}
                  onChange={(event) => setBranchName(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="branch-phone">Phone</Label>
                <Input
                  id="branch-phone"
                  value={branchPhone}
                  onChange={(event) => setBranchPhone(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="branch-address">Address</Label>
                <Input
                  id="branch-address"
                  value={branchAddress}
                  onChange={(event) => setBranchAddress(event.target.value)}
                />
              </div>
              <p className="text-[11px] text-muted">
                Branch code {branch.code} · status {branch.status.toLowerCase()}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tax & service charge</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="vat-rate">VAT rate (%)</Label>
                  <Input
                    id="vat-rate"
                    inputMode="decimal"
                    value={vatRate}
                    onChange={(event) => setVatRate(event.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="vat-mode">Pricing</Label>
                  <Select
                    id="vat-mode"
                    value={vatInclusive ? 'inclusive' : 'exclusive'}
                    onChange={(event) => setVatInclusive(event.target.value === 'inclusive')}
                  >
                    <option value="inclusive">VAT inclusive</option>
                    <option value="exclusive">VAT exclusive</option>
                  </Select>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="service-enabled">Service charge</Label>
                <Select
                  id="service-enabled"
                  value={serviceEnabled ? 'on' : 'off'}
                  onChange={(event) => setServiceEnabled(event.target.value === 'on')}
                >
                  <option value="off">Disabled</option>
                  <option value="on">Enabled</option>
                </Select>
              </div>
              {serviceEnabled ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="service-type">Type</Label>
                    <Select
                      id="service-type"
                      value={serviceType}
                      onChange={(event) => setServiceType(event.target.value)}
                    >
                      <option value="PERCENT">Percentage</option>
                      <option value="FIXED">Fixed (THB)</option>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="service-value">Value</Label>
                    <Input
                      id="service-value"
                      inputMode="decimal"
                      value={serviceValue}
                      onChange={(event) => setServiceValue(event.target.value)}
                    />
                  </div>
                </div>
              ) : null}
              <div className="grid gap-1.5">
                <Label htmlFor="promptpay" hint="10 digits mobile / 13 digits ID">
                  PromptPay ID
                </Label>
                <Input
                  id="promptpay"
                  value={promptPayId}
                  onChange={(event) => setPromptPayId(event.target.value)}
                  placeholder="0812345678"
                />
                <p className="text-[11px] text-muted">
                  Used to build a real EMVCo PromptPay payload. A QR only requests payment; a cashier still
                  confirms it.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Receipt</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 pt-2 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="receipt-header">Header</Label>
                <Input
                  id="receipt-header"
                  value={receiptHeader}
                  onChange={(event) => setReceiptHeader(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="receipt-footer">Footer</Label>
                <Input
                  id="receipt-footer"
                  value={receiptFooter}
                  onChange={(event) => setReceiptFooter(event.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <div className="lg:col-span-2">
            <Button type="submit" loading={busy}>
              <Save className="h-4 w-4" /> Save branch settings
            </Button>
          </div>
        </form>
      </TabsContent>

      <TabsContent value="restaurant">
        <form onSubmit={saveTenant} className="max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle>Restaurant profile</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 pt-2">
              <div className="grid gap-1.5">
                <Label htmlFor="tenant-name">Business name</Label>
                <Input
                  id="tenant-name"
                  value={tenantName}
                  onChange={(event) => setTenantName(event.target.value)}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="tenant-phone">Phone</Label>
                  <Input
                    id="tenant-phone"
                    value={tenantPhone}
                    onChange={(event) => setTenantPhone(event.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="tenant-email">Email</Label>
                  <Input
                    id="tenant-email"
                    type="email"
                    value={tenantEmail}
                    onChange={(event) => setTenantEmail(event.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="tenant-address">Address</Label>
                <Input
                  id="tenant-address"
                  value={tenantAddress}
                  onChange={(event) => setTenantAddress(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="tenant-tax" hint="optional">
                  Tax identification
                </Label>
                <Input id="tenant-tax" value={taxId} onChange={(event) => setTaxId(event.target.value)} />
              </div>
              <p className="text-[11px] text-muted">
                Slug: {tenant.slug} · currency THB · timezone Asia/Bangkok
              </p>
              <Button type="submit" loading={busy} className="w-fit">
                <Save className="h-4 w-4" /> Save profile
              </Button>
            </CardContent>
          </Card>
        </form>
      </TabsContent>

      <TabsContent value="subscription">
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Plan & usage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-2 text-[12px]">
            {entitlements ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted">Plan</span>
                  <span className="font-medium">{entitlements.plan}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Status</span>
                  <span className="font-medium">{entitlements.status}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Branches</span>
                  <span className="font-medium">
                    {entitlements.usage.branches} / {entitlements.limits.branches}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Staff</span>
                  <span className="font-medium">
                    {entitlements.usage.staff} / {entitlements.limits.staff}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Orders this month</span>
                  <span className="font-medium">
                    {entitlements.usage.monthlyOrders} / {entitlements.limits.monthlyOrders}
                  </span>
                </div>
                <p className="pt-2 text-[11px] text-muted">
                  Limits are enforced by the API when SUBSCRIPTION_MODE=enforced. Development mode keeps every
                  feature available so the whole product can be demonstrated.
                </p>
              </>
            ) : (
              <p className="text-muted">No subscription information.</p>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
