'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, LogIn } from 'lucide-react';
import { clientApi, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

const DEMO_USERS = [
  { email: 'owner@spicegarden.local', role: 'Owner', detail: 'All branches, full access' },
  { email: 'manager@spicegarden.local', role: 'Manager', detail: 'Sathorn and Ari only' },
  { email: 'cashier@spicegarden.local', role: 'Cashier', detail: 'Bills, payments, refunds' },
  { email: 'kitchen@spicegarden.local', role: 'Kitchen', detail: 'Kitchen board only' },
  { email: 'waiter@spicegarden.local', role: 'Waiter', detail: 'Floor, serving, requests' },
  { email: 'viewer@spicegarden.local', role: 'Viewer', detail: 'Read-only' },
  { email: 'owner@baanthai.local', role: 'Second tenant', detail: 'Proves isolation' },
  { email: 'platform@tabletap.local', role: 'Platform admin', detail: 'No restaurant data by default' },
];

const PASSWORD = 'TableTap!2026';
const fieldClass =
  'h-10 rounded-none border-0 border-b border-line bg-transparent px-0 text-[13.5px] focus:border-ink focus:ring-0';

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
    <div className="grid min-h-dvh lg:grid-cols-[0.92fr_1.08fr]">
      <div className="relative hidden flex-col justify-between border-r border-line bg-night p-10 text-[#e9e3d6] lg:flex xl:p-12">
        <Link href="/" className="flex items-baseline gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-sm border border-[#6d5a2f] font-display text-[16px] text-[#d8b978]">
            T
          </span>
          <span className="font-display text-[19px] leading-none text-white">TableTap</span>
        </Link>

        <div className="max-w-[30rem]">
          <h1 className="font-display text-[44px] leading-[0.98] text-white xl:text-[52px]">
            One restaurant,
            <br />
            thirty days of
            <br />
            real trading.
          </h1>
          <p className="mt-6 max-w-md text-[13px] leading-relaxed text-[#a49a88]">
            Spice Garden runs three branches with 60 tables, 34 dishes, recipes, inventory and hundreds of
            settled checks. Sign in as any role and the same data appears through different permissions.
          </p>

          <div className="mt-8 border-t border-[#3a3327]">
            {[
              'Owner, manager and cashier permissions enforced on the server',
              'Every check in the overview came from a real order',
              'The second tenant cannot see the first',
            ].map((item) => (
              <p key={item} className="border-b border-[#3a3327] py-2.5 text-[12px] text-[#c9c0ad]">
                {item}
              </p>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between text-[10px] text-[#7d7464]">
          <span>Argon2id · rotating refresh · CSRF</span>
          <span className="money">v0.1</span>
        </div>
      </div>

      <div className="flex items-center justify-center bg-paper px-5 py-10">
        <div className="w-full max-w-[400px] animate-rise">
          <Link href="/" className="mb-8 inline-flex items-baseline gap-2 lg:hidden">
            <span className="font-display text-[22px] leading-none text-ink">TableTap</span>
          </Link>

          <h2 className="font-display text-[34px] leading-none text-ink">Sign in</h2>
          <p className="mt-2 text-[12.5px] text-muted">Use a demo role below, or your own credentials.</p>

          <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
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
                className={fieldClass}
                placeholder="you@restaurant.co.th"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="password">Password</Label>
                <Link href="/forgot-password" className="text-[10.5px] text-muted hover:text-ink">
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
                  className={cn(fieldClass, 'pr-9')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-0 top-1/2 -translate-y-1/2 p-1.5 text-muted transition-colors hover:text-ink"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error ? (
              <div
                role="alert"
                className="animate-scale-in border border-danger/30 bg-danger-soft px-3 py-2 text-[12px] text-danger"
              >
                {error}
              </div>
            ) : null}

            <Button type="submit" size="lg" loading={loading} className="h-11 w-full rounded-sm">
              {!loading ? <LogIn className="h-4 w-4" /> : null}
              Sign in
            </Button>
            <p className="text-[10.5px] text-muted">
              Shared demo password: <code className="money text-[10.5px] text-ink-soft">{PASSWORD}</code>
            </p>
          </form>

          <div className="mt-9">
            <div className="flex items-baseline justify-between border-b border-line pb-1.5">
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted">Demo roles</p>
              <span className="text-[9.5px] text-muted-soft">Tap to fill</span>
            </div>
            <div>
              {DEMO_USERS.map((user) => {
                const active = activeDemo === user.email;
                return (
                  <button
                    key={user.email}
                    type="button"
                    onClick={() => chooseDemo(user)}
                    className={cn(
                      'group flex w-full items-center gap-2.5 border-b border-line py-2 text-left transition-colors',
                      active ? 'bg-brand-soft/50' : 'hover:bg-surface',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'h-1.5 w-1.5 shrink-0 rounded-full',
                        active ? 'bg-brand' : 'bg-line-strong',
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11.5px] font-medium text-ink">{user.role}</span>
                      <span className="block truncate text-[10px] text-muted">{user.detail}</span>
                    </span>
                    <span className="hidden shrink-0 font-mono text-[9.5px] text-muted-soft sm:block">
                      {user.email.split('@')[0]}
                    </span>
                    <ArrowRight
                      className={cn(
                        'h-3 w-3 shrink-0 transition-transform duration-200',
                        active ? 'text-brand' : 'text-muted-soft group-hover:translate-x-0.5',
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
