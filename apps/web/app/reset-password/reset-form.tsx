'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { clientApi, errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await clientApi('/auth/reset-password', { method: 'POST', body: { token, newPassword: password } });
      router.push('/login');
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
        This link is missing its token. Request a new reset email.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="new-password" hint="10+ characters, letters and a number">
          New password
        </Label>
        <Input
          id="new-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={10}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm-password">Confirm password</Label>
        <Input
          id="confirm-password"
          type="password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          required
        />
      </div>
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      <Button type="submit" className="w-full" loading={busy}>
        <KeyRound className="h-4 w-4" /> Set new password
      </Button>
      <Link href="/login" className="text-[12px] font-medium text-brand hover:underline">
        Back to sign in
      </Link>
    </form>
  );
}
