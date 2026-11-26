import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireSession, hasPermission } from '@/lib/auth';
import { serverApi } from '@/lib/api-server';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, InlineError } from '@/components/ui/card';
import { NoAccess } from '@/components/no-access';
import { SettingsForm } from './settings-form';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

interface TenantSettings {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxId: string | null;
  timezone: string;
  currency: string;
  subscription: { plan: string; planName: string; status: string } | null;
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
  promptPayName: string | null;
  receiptHeader: string | null;
  receiptFooter: string | null;
  status: string;
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const me = await requireSession();
  if (!me.tenant) redirect('/platform/dashboard');
  if (!hasPermission(me, 'settings.manage')) return <NoAccess permission="settings.manage" />;
  const params = await searchParams;
  const branchId = params.branch ?? me.branches[0]?.id;
  if (!branchId) return <EmptyState title="No branch" />;

  let tenant: TenantSettings | null = null;
  let branch: BranchSettings | null = null;
  let entitlements: {
    plan: string;
    status: string;
    limits: Record<string, number>;
    usage: Record<string, number>;
  } | null = null;
  let error: string | null = null;
  try {
    [tenant, branch, entitlements] = await Promise.all([
      serverApi<TenantSettings>('/tenants/current'),
      serverApi<BranchSettings>(`/branches/${branchId}`),
      serverApi<typeof entitlements>('/tenants/current/entitlements'),
    ]);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : 'Could not load settings';
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Restaurant profile, tax, service charge and PromptPay. Changes take effect for new orders immediately."
      />
      {error ? <InlineError>{error}</InlineError> : null}
      {tenant && branch ? (
        <SettingsForm tenant={tenant} branch={branch} branches={me.branches} entitlements={entitlements} />
      ) : null}
    </div>
  );
}
