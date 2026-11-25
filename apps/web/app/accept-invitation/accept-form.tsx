'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { clientApi, errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

export function AcceptInvitationForm({ token }: { token: string }) {
  const router = useRouter();
  const [name, setName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await clientApi('/auth/accept-invitation', { method: 'POST', body: { token, name, password } });
      router.push('/app/dashboard');
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="rounded-md border border-danger/25 bg-danger-soft px-3 py-3 text-[13px] text-danger">
        This invitation link is incomplete. Ask your manager to send a new one.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="invite-name">Your name</Label>
        <Input
          id="invite-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          minLength={2}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="invite-password" hint="10+ characters, letters and a number">
          Choose a password
        </Label>
        <Input
          id="invite-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={10}
        />
      </div>
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      <Button type="submit" className="w-full" loading={busy}>
        Join the restaurant
      </Button>
      <p className="text-[11px] text-muted">The invitation is single-use and expires after seven days.</p>
    </form>
  );
}
