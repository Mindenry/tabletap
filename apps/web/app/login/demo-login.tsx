'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Banknote, Briefcase, ChefHat, Crown, Eye, Utensils } from 'lucide-react';

const DEMO_TABLE = 'demo-sathorn-t02-4f8c2a91';

const ROLES = [
  {
    key: 'owner',
    label: 'Owner',
    description: 'All three branches, analytics, settings and the audit log.',
    icon: Crown,
  },
  {
    key: 'manager',
    label: 'Manager',
    description: 'Sathorn and Ari, with the floor, kitchen and reports.',
    icon: Briefcase,
  },
  {
    key: 'cashier',
    label: 'Cashier',
    description: 'Point of sale, bills, payments and refunds.',
    icon: Banknote,
  },
  {
    key: 'kitchen',
    label: 'Kitchen',
    description: 'The station board only: accept, prepare and ready.',
    icon: ChefHat,
  },
  {
    key: 'waiter',
    label: 'Waiter',
    description: 'Floor, serving and guest requests.',
    icon: Utensils,
  },
  {
    key: 'viewer',
    label: 'Viewer',
    description: 'Read-only access across the restaurant.',
    icon: Eye,
  },
];

export function DemoLogin() {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);

  function choose(role: string) {
    setPending(role);
    document.cookie = `demo_role=${role}; path=/; max-age=604800; samesite=lax`;
    router.push('/app/dashboard');
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-paper px-5 py-10 text-ink">
      <div className="mx-auto w-full max-w-4xl">
        <p className="text-[10px] uppercase tracking-[0.3em] text-gold">TableTap · Demo</p>
        <h1 className="mt-2 font-display text-[38px] leading-none sm:text-[44px]">Choose a role</h1>
        <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-muted">
          There is no password in the demo. Each role opens the same seeded restaurant with the permissions
          that role has. Guest ordering is interactive; staff changes stay in this browser.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ROLES.map((role) => {
            const Icon = role.icon;
            const active = pending === role.key;
            return (
              <button
                key={role.key}
                type="button"
                onClick={() => choose(role.key)}
                disabled={pending !== null}
                className="group flex items-start gap-3 border border-line bg-surface-raised p-4 text-left transition-colors hover:border-gold disabled:opacity-70"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center border border-line bg-paper text-gold">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[14px] font-semibold">{active ? 'Opening…' : role.label}</span>
                    <ArrowRight className="h-4 w-4 text-muted-soft transition-transform group-hover:translate-x-0.5" />
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted">
                    {role.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-line pt-4 text-[11px] text-muted">
          <a href={`/menu/${DEMO_TABLE}`} className="text-ink underline underline-offset-4">
            Open the guest menu
          </a>
          <span>Demo data resets from the badge inside the app.</span>
        </div>
      </div>
    </main>
  );
}
