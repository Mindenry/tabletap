'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, MailPlus, Shield, UserRound } from 'lucide-react';
import { clientApi, errorMessage } from '@/lib/api';
import { cn, formatDate, initials } from '@/lib/utils';
import type { StaffRow } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Checkbox, Input, Label, Select } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, EmptyState } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const ROLES = ['OWNER', 'MANAGER', 'CASHIER', 'KITCHEN', 'WAITER', 'VIEWER'] as const;
const ROLE_HINTS: Record<string, string> = {
  OWNER: 'Everything, including settings and staff.',
  MANAGER: 'Operations, menu, inventory, reports.',
  CASHIER: 'Bills, payments, refunds.',
  KITCHEN: 'Kitchen tickets only.',
  WAITER: 'Floor and serving.',
  VIEWER: 'Read-only.',
};

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

export function StaffManager({
  staff,
  invitations,
  branches,
  canInvite,
  canUpdate,
  canDeactivate,
  currentUserId,
}: {
  staff: StaffRow[];
  invitations: InvitationRow[];
  branches: Array<{ id: string; name: string; code: string }>;
  canInvite: boolean;
  canUpdate: boolean;
  canDeactivate: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [role, setRole] = React.useState('WAITER');
  const [selectedBranches, setSelectedBranches] = React.useState<string[]>(
    branches.map((branch) => branch.id),
  );
  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState<StaffRow | null>(null);
  const [editRole, setEditRole] = React.useState('WAITER');
  const [editBranches, setEditBranches] = React.useState<string[]>([]);

  async function invite() {
    if (!email.trim()) {
      toast.error('Email is required');
      return;
    }
    if (selectedBranches.length === 0) {
      toast.error('Choose at least one branch');
      return;
    }
    setBusy(true);
    try {
      const result = await clientApi<{ acceptUrl?: string; emailDelivered: boolean }>('/staff/invitations', {
        method: 'POST',
        body: { email: email.trim().toLowerCase(), role, branchIds: selectedBranches },
      });
      toast.success(result.emailDelivered ? 'Invitation emailed' : 'Invitation created');
      if (result.acceptUrl) {
        await navigator.clipboard.writeText(result.acceptUrl).catch(() => undefined);
        toast.message('Development mode: invitation link copied to clipboard.');
      }
      setInviteOpen(false);
      setEmail('');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function startEdit(member: StaffRow) {
    setEditing(member);
    setEditRole(member.role);
    setEditBranches(member.branches.map((branch) => branch.id));
  }

  async function saveEdit(status?: 'ACTIVE' | 'DEACTIVATED') {
    if (!editing) return;
    setBusy(true);
    try {
      await clientApi(`/staff/${editing.id}`, {
        method: 'PATCH',
        body: {
          role: editRole,
          branchIds: editBranches,
          ...(status ? { status } : {}),
        },
      });
      toast.success(status === 'DEACTIVATED' ? 'Access revoked immediately' : 'Staff updated');
      setEditing(null);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function revokeInvitation(id: string) {
    setBusy(true);
    try {
      await clientApi(`/staff/invitations/${id}`, { method: 'DELETE' });
      toast.success('Invitation revoked');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="team">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="team">Team · {staff.length}</TabsTrigger>
            <TabsTrigger value="invitations">
              Invitations · {invitations.filter((i) => i.status === 'PENDING').length}
            </TabsTrigger>
            <TabsTrigger value="roles">Roles</TabsTrigger>
          </TabsList>
          {canInvite ? (
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <MailPlus className="h-3.5 w-3.5" /> Invite staff
            </Button>
          ) : null}
        </div>

        <TabsContent value="team">
          <div className="overflow-hidden rounded-lg border border-line bg-surface-raised">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead className="border-b border-line bg-paper/60">
                <tr>
                  <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Member
                  </th>
                  <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Role
                  </th>
                  <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Branches
                  </th>
                  <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Status
                  </th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Last login
                  </th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {staff.map((member) => (
                  <tr key={member.id} className="hover:bg-paper/40">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-8 w-8 place-items-center rounded-full bg-paper-deep text-[11px] font-semibold">
                          {initials(member.name)}
                        </span>
                        <div>
                          <p className="font-medium text-ink">
                            {member.name}
                            {member.userId === currentUserId ? (
                              <span className="ml-1.5 text-[10px] text-muted">(you)</span>
                            ) : null}
                          </p>
                          <p className="text-[11px] text-muted">{member.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-[12px]">{member.role}</td>
                    <td className="px-4 py-2.5 text-[11px] text-muted">
                      {member.branches.length === 0
                        ? 'All branches'
                        : member.branches.map((branch) => branch.name).join(', ')}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge
                        status={member.status === 'ACTIVE' ? 'ACTIVE' : 'DEACTIVATED'}
                        label={member.status.toLowerCase()}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right text-[11px] text-muted">
                      {member.lastLoginAt ? formatDate(member.lastLoginAt) : 'Never'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {canUpdate ? (
                        <Button variant="ghost" size="sm" onClick={() => startEdit(member)}>
                          Manage
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="invitations">
          {invitations.length === 0 ? (
            <EmptyState
              title="No invitations"
              description="Invite a manager, cashier or kitchen lead."
              icon={<MailPlus className="h-7 w-7" />}
            />
          ) : (
            <div className="space-y-2">
              {invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-raised px-4 py-3"
                >
                  <div>
                    <p className="text-[13px] font-medium">{invitation.email}</p>
                    <p className="text-[11px] text-muted">
                      {invitation.role} · expires {formatDate(invitation.expiresAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={invitation.status} />
                    {invitation.status === 'PENDING' && canInvite ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => revokeInvitation(invitation.id)}
                        disabled={busy}
                      >
                        Revoke
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="roles">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ROLES.map((roleKey) => (
              <Card key={roleKey}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-brand" />
                    <CardTitle className="text-[13px]">{roleKey}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pt-2 text-[12px] text-muted">{ROLE_HINTS[roleKey]}</CardContent>
              </Card>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted">
            Permissions are stored per role in the database and checked on every request. Deactivating a
            member revokes their sessions immediately.
          </p>
        </TabsContent>
      </Tabs>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent
          title="Invite a team member"
          description="The invitation expires after 7 days and can be revoked at any time."
        >
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="invite-role">Role</Label>
              <Select id="invite-role" value={role} onChange={(event) => setRole(event.target.value)}>
                {ROLES.map((roleKey) => (
                  <option key={roleKey} value={roleKey}>
                    {roleKey}
                  </option>
                ))}
              </Select>
              <p className="text-[11px] text-muted">{ROLE_HINTS[role]}</p>
            </div>
            <div className="grid gap-1.5">
              <Label>Branches</Label>
              <div className="space-y-1">
                {branches.map((branch) => (
                  <label
                    key={branch.id}
                    className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-[12px]"
                  >
                    <Checkbox
                      checked={selectedBranches.includes(branch.id)}
                      onChange={(event) =>
                        setSelectedBranches((current) =>
                          event.target.checked
                            ? [...current, branch.id]
                            : current.filter((id) => id !== branch.id),
                        )
                      }
                    />
                    {branch.name}
                    <span className="text-muted">({branch.code})</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button onClick={invite} loading={busy}>
              <MailPlus className="h-4 w-4" /> Send invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        {editing ? (
          <DialogContent title={`Manage ${editing.name}`} description={editing.email}>
            <div className="space-y-3">
              <div className="grid gap-1.5">
                <Label htmlFor="edit-role">Role</Label>
                <Select id="edit-role" value={editRole} onChange={(event) => setEditRole(event.target.value)}>
                  {ROLES.map((roleKey) => (
                    <option key={roleKey} value={roleKey}>
                      {roleKey}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Branches</Label>
                <div className="space-y-1">
                  {branches.map((branch) => (
                    <label
                      key={branch.id}
                      className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-[12px]"
                    >
                      <Checkbox
                        checked={editBranches.includes(branch.id)}
                        onChange={(event) =>
                          setEditBranches((current) =>
                            event.target.checked
                              ? [...current, branch.id]
                              : current.filter((id) => id !== branch.id),
                          )
                        }
                      />
                      {branch.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className={cn('rounded-md bg-paper-deep/60 px-3 py-2 text-[11px] text-muted')}>
                <UserRound className="mr-1 inline h-3 w-3" />
                Deactivating this member revokes every active session immediately.
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              {canDeactivate && editing.status === 'ACTIVE' ? (
                <Button variant="danger" onClick={() => saveEdit('DEACTIVATED')} loading={busy}>
                  Deactivate
                </Button>
              ) : null}
              <Button onClick={() => saveEdit()} loading={busy}>
                <Check className="h-4 w-4" /> Save changes
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
