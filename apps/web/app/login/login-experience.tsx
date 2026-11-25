'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, Eye, EyeOff, LogIn, ShieldCheck, Sparkles } from 'lucide-react';
import { clientApi, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

const DEMO_USERS = [
  { email: 'owner@spicegarden.local', role: 'Owner', detail: 'All branches, full access', tone: 'brand' },
  { email: 'manager@spicegarden.local', role: 'Manager', detail: 'Sathorn + Ari only', tone: 'olive' },
  { email: 'cashier@spicegarden.local', role: 'Cashier', detail: 'Bills and payments', tone: 'gold' },
  { email: 'kitchen@spicegarden.local', role: 'Kitchen', detail: 'Kitchen board only', tone: 'default' },
  { email: 'waiter@spicegarden.local', role: 'Waiter', detail: 'Floor, serving, requests', tone: 'default' },
  { email: 'viewer@spicegarden.local', role: 'Viewer', detail: 'Read-only', tone: 'default' },
  { email: 'owner@baanthai.local', role: 'Second tenant', detail: 'Proves isolation', tone: 'olive' },
  {
    email: 'platform@tabletap.local',
    role: 'Platform admin',
    detail: 'No restaurant data by default',
    tone: 'brand',
  },
];

const PASSWORD = 'TableTap!2026';

export function LoginExperience() {
  const router = useRouter();
  const [email, setEmail] = React.useState('owner@spicegarden.local');
  const [password, setPassword] = React.useState(PASSWORD);
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [activeDemo, setActiveDemo] = React.useState('owner@spicegarden.local');

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await clientApi('/auth/login', { method: 'POST', body: { email, password } });
      const me = await clientApi<{ tenant?: unknown }>('/auth/me');
      router.push(me.tenant ? '/app/dashboard' : '/platform/dashboard');
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
      setLoading(false);
    }
  }

  function chooseDemo(candidate: (typeof DEMO_USERS)[number]) {
    setEmail(candidate.email);
    setPassword(PASSWORD);
    setActiveDemo(candidate.email);
    setError(null);
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_0.95fr]">
      {/* -------------------------------------------------- brand panel */}
      <div className="relative hidden overflow-hidden bg-night text-[#ece6da] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden className="absolute inset-0">
          <div className="absolute -left-24 top-[-10%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(180,81,44,0.34),transparent_62%)] animate-drift" />
          <div className="absolute -bottom-32 right-[-18%] h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle_at_center,rgba(83,100,74,0.30),transparent_62%)] animate-drift [animation-delay:-10s]" />
          <div className="absolute inset-0 surface-grid opacity-[0.16]" />
          <div className="absolute inset-0 grain opacity-[0.16]" />
        </div>

        <div className="relative">
          <Link href="/" className="group inline-flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-brand text-white transition-transform duration-500 group-hover:rotate-[-6deg]">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-white">TableTap</span>
          </Link>
        </div>

        <div className="relative max-w-lg">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#d9a88f]">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            Demo environment
          </p>
          <h1 className="mt-5 font-display text-[42px] leading-[1.03] tracking-[-0.03em] text-white">
            One restaurant,
            <br />
            thirty days of
            <br />
            real trading.
          </h1>
          <p className="mt-5 max-w-md text-[13.5px] leading-relaxed text-[#b3ab9c]">
            Spice Garden runs three branches with 60 tables, 34 dishes, recipes, inventory and hundreds of
            settled bills. Sign in with any role to see the same data through different permissions.
          </p>

          <ul className="mt-7 space-y-3 text-[12.5px] text-[#cfc7b8]">
            {[
              'Owner, manager and cashier permissions enforced server-side',
              'Every bill in the dashboard came from a real order',
              'The second tenant cannot see the first',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-brand/20 text-brand">
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center justify-between text-[11px] text-[#7d7768]">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            Argon2id · rotating refresh tokens · CSRF
          </span>
          <span className="font-mono">v0.1</span>
        </div>
      </div>

      {/* ---------------------------------------------------------- form */}
      <div className="relative flex items-center justify-center overflow-hidden px-5 py-9">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(180,81,44,0.10),transparent_65%)]" />
          <div className="absolute -bottom-52 -left-24 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(83,100,74,0.10),transparent_65%)]" />
          <div className="absolute inset-0 surface-grid opacity-[0.35] [mask-image:radial-gradient(circle_at_50%_40%,black,transparent_75%)]" />
        </div>

        <div className="relative w-full max-w-[400px] animate-rise">
          <Link href="/" className="mb-7 inline-flex items-center gap-2 lg:hidden">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-paper">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="text-[14px] font-semibold">TableTap</span>
          </Link>

          <h2 className="font-display text-[32px] leading-tight tracking-tight">Welcome back.</h2>
          <p className="mt-1.5 text-[13px] text-muted">
            Sign in with a demo account below, or your own credentials.
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setActiveDemo('');
                }}
                required
                aria-invalid={Boolean(error)}
                placeholder="you@restaurant.co.th"
                className="h-11 rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="password">Password</Label>
                <Link href="/forgot-password" className="text-[11px] font-medium text-muted hover:text-ink">
                  Forgot?
                </Link>
              </div>
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
                  className="h-11 rounded-xl pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted transition-colors hover:bg-paper-deep hover:text-ink"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error ? (
              <div
                role="alert"
                className="animate-scale-in rounded-xl border border-danger/25 bg-danger-soft px-3.5 py-2.5 text-[12.5px] text-danger"
              >
                {error}
              </div>
            ) : null}

            <Button
              type="submit"
              size="lg"
              loading={loading}
              className="h-11 w-full rounded-xl text-[14px] shadow-[0_14px_30px_-18px_rgba(23,21,15,0.7)]"
            >
              {!loading ? <LogIn className="h-4 w-4" /> : null}
              Sign in
            </Button>

            <p className="text-center text-[10.5px] text-muted">
              Shared demo password:{' '}
              <code className="rounded bg-paper-deep px-1.5 py-0.5 font-mono text-[10px] text-ink-soft">
                {PASSWORD}
              </code>
            </p>
          </form>

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">
                Demo accounts
              </p>
              <span className="text-[10px] text-muted-soft">Tap to fill</span>
            </div>
            <div className="space-y-1">
              {DEMO_USERS.map((user) => {
                const active = activeDemo === user.email;
                return (
                  <button
                    key={user.email}
                    type="button"
                    onClick={() => chooseDemo(user)}
                    className={cn(
                      'group flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition-all duration-300',
                      active
                        ? 'border-brand/40 bg-brand-soft/60 shadow-[var(--shadow-card)]'
                        : 'border-line bg-surface/70 hover:-translate-y-0.5 hover:border-line-strong hover:bg-surface',
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-semibold text-ink">{user.role}</span>
                        {active ? (
                          <span className="rounded-full bg-brand/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-deep">
                            selected
                          </span>
                        ) : null}
                      </div>
                      <p className="truncate text-[10.5px] text-muted">{user.detail}</p>
                    </div>
                    <span className="hidden shrink-0 font-mono text-[10px] text-muted-soft sm:block">
                      {user.email.split('@')[0]}
                    </span>
                    <ArrowRight
                      className={cn(
                        'h-3.5 w-3.5 shrink-0 transition-all duration-300',
                        active
                          ? 'text-brand'
                          : 'text-muted-soft group-hover:translate-x-0.5 group-hover:text-ink',
                      )}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
