import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireSession, hasPermission } from '@/lib/auth';
import { serverApi } from '@/lib/api-server';
import type { StaffRow } from '@/lib/types';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, InlineError } from '@/components/ui/card';
import { StaffManager } from './staff-manager';

export const metadata: Metadata = { title: 'Staff' };
export const dynamic = 'force-dynamic';

interface InvitationRow {
  id: string;
  email: string;
  role: string;
  branchIds: string[];
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  status: string;
}

export default async function StaffPage() {
  const me = await requireSession();
  if (!me.tenant) redirect('/platform/dashboard');
  if (!hasPermission(me, 'staff.read')) return <NoAccess permission="staff.read" />;

  let staff: StaffRow[] = [];
  let invitations: InvitationRow[] = [];
  let error: string | null = null;
  try {
    [staff, invitations] = await Promise.all([
      serverApi<StaffRow[]>('/staff'),
      serverApi<InvitationRow[]>('/staff/invitations'),
    ]);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : 'Could not load staff';
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="People"
        title="Staff & permissions"
        description="Roles are enforced on the server. Branch restrictions limit what each person can see and change."
        actions={<span className="text-[12px] text-muted">{staff.length} members</span>}
      />
      {error ? <InlineError>{error}</InlineError> : null}
      <StaffManager
        staff={staff}
        invitations={invitations}
        branches={me.branches}
        canInvite={hasPermission(me, 'staff.invite')}
        canUpdate={hasPermission(me, 'staff.update')}
        canDeactivate={hasPermission(me, 'staff.deactivate')}
        currentUserId={me.user.id}
      />
    </div>
  );
}
