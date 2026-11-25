import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Check } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

const DEMO_USERS = [
  { email: 'owner@spicegarden.local', role: 'Owner', detail: 'All three branches, full access' },
  { email: 'manager@spicegarden.local', role: 'Manager', detail: 'Sathorn + Ari only' },
  { email: 'cashier@spicegarden.local', role: 'Cashier', detail: 'Payments and bills, Sathorn' },
  { email: 'kitchen@spicegarden.local', role: 'Kitchen', detail: 'Kitchen board, no money access' },
  { email: 'waiter@spicegarden.local', role: 'Waiter', detail: 'Floor and serving' },
  { email: 'viewer@spicegarden.local', role: 'Viewer', detail: 'Read-only' },
  { email: 'owner@baanthai.local', role: 'Second tenant', detail: 'Proves tenant isolation' },
  { email: 'platform@tabletap.local', role: 'Platform admin', detail: 'No restaurant data by default' },
];

export default async function LoginPage() {
  const me = await getSession();
  if (me) redirect(me.tenant ? '/app/dashboard' : '/platform/dashboard');

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[1fr_460px]">
      <div className="hidden flex-col justify-between bg-night p-10 text-[#e8e2d6] lg:flex">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[13px] font-medium text-[#c9c2b4] hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to TableTap
        </Link>
        <div className="max-w-lg">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">Demo environment</p>
          <h1 className="mt-3 font-[family-name:var(--font-display)] text-[40px] leading-[1.08] text-white">
            One restaurant, thirty days of real trading.
          </h1>
          <p className="mt-4 text-[14px] leading-relaxed text-[#a8a194]">
            Spice Garden runs three branches with 60 tables, 34 menu items, recipes, inventory and hundreds of
            settled bills. Sign in with any role to see the same data through different permissions.
          </p>
          <ul className="mt-6 space-y-2 text-[13px] text-[#c9c2b4]">
            {[
              'Owner vs manager vs cashier permissions are enforced server-side',
              'Every bill in the dashboard came from a real order',
              'The second tenant cannot see the first',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[11px] text-[#7d7768]">
          Shared demo password: <span className="font-mono text-[#c9c2b4]">TableTap!2026</span>
        </p>
      </div>

      <div className="flex min-h-screen items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 inline-flex items-center gap-2 lg:hidden">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-brand text-white">T</span>
            <span className="text-[14px] font-semibold">TableTap</span>
          </Link>
          <h2 className="text-[24px] font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 text-[13px] text-muted">Use a demo account below, or your own credentials.</p>

          <div className="mt-6">
            <LoginForm />
          </div>

          <div className="mt-8">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
              Demo accounts
            </p>
            <div className="max-h-[280px] space-y-1 overflow-y-auto pr-1 scrollbar-thin">
              {DEMO_USERS.map((user) => (
                <div key={user.email} className="rounded-md border border-line bg-surface/70 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-medium text-ink">{user.role}</span>
                    <span className="font-mono text-[11px] text-muted">{user.email}</span>
                  </div>
                  <p className="text-[11px] text-muted">{user.detail}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted">
              The form is pre-filled with the owner. Change the email to test another role.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
