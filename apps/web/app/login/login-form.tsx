'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { clientApi, errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = React.useState('owner@spicegarden.local');
  const [password, setPassword] = React.useState('TableTap!2026');
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await clientApi('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      const me = await clientApi<{ tenant: unknown } | Record<string, unknown>>('/auth/me');
      const hasTenant = Boolean((me as { tenant?: unknown }).tenant);
      router.push(hasTenant ? '/app/dashboard' : '/platform/dashboard');
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          aria-invalid={Boolean(error)}
          placeholder="you@restaurant.co.th"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            aria-invalid={Boolean(error)}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted hover:bg-paper-deep hover:text-ink"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-danger/25 bg-danger-soft px-3 py-2 text-[13px] text-danger"
        >
          {error}
        </div>
      ) : null}

      <Button type="submit" className="w-full" size="lg" loading={loading}>
        {!loading ? <LogIn className="h-4 w-4" /> : null}
        Sign in
      </Button>

      <div className="flex items-center justify-between text-[12px] text-muted">
        <span>Rate limited to 10 attempts per minute.</span>
        <a href="/forgot-password" className="font-medium text-ink-soft hover:text-ink">
          Forgot password
        </a>
      </div>
    </form>
  );
}
