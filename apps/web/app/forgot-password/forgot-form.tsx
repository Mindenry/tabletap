'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail } from 'lucide-react';
import { clientApi, errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

export function ForgotPasswordForm() {
  const [email, setEmail] = React.useState('');
  const [sent, setSent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await clientApi('/auth/forgot-password', { method: 'POST', body: { email } });
      setSent(true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-success/25 bg-success-soft px-3 py-3 text-[13px] text-success">
          If that email belongs to an account, a reset link is on its way. It expires in 60 minutes.
        </div>
        <p className="text-[12px] text-muted">
          In development, open Mailpit at{' '}
          <a
            href="http://localhost:8125"
            className="font-medium text-ink underline"
            target="_blank"
            rel="noreferrer"
          >
            localhost:8125
          </a>{' '}
          to read the message.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="forgot-email">Email</Label>
        <Input
          id="forgot-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      <Button type="submit" className="w-full" loading={busy}>
        <Mail className="h-4 w-4" /> Send reset link
      </Button>
      <Link
        href="/login"
        className="inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
      </Link>
    </form>
  );
}
