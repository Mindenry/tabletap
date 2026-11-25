'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  BarChart3,
  BellRing,
  BookOpen,
  Boxes,
  ChevronDown,
  ClipboardList,
  CreditCard,
  Grid2x2,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  ReceiptText,
  ScrollText,
  Settings,
  ShieldCheck,
  Store,
  Users,
  UtensilsCrossed,
} from 'lucide-react';
import { clientApi } from '@/lib/api';
import { cn, initials } from '@/lib/utils';
import type { Me } from '@/lib/types';
import { PageTransition } from './motion/page-transition';
import { ServiceRail } from './service-rail';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  permission?: string;
}

const NAV: Array<{ group: string; items: NavItem[] }> = [
  {
    group: 'Service',
    items: [
      { href: '/app/dashboard', label: 'Overview', icon: LayoutDashboard, permission: 'analytics.read' },
      { href: '/app/tables', label: 'Floor', icon: Grid2x2, permission: 'table.read' },
      { href: '/app/requests', label: 'Guest requests', icon: BellRing, permission: 'table.read' },
      { href: '/app/orders', label: 'Orders', icon: ClipboardList, permission: 'order.read' },
      { href: '/app/kitchen', label: 'Kitchen', icon: UtensilsCrossed, permission: 'kitchen.read' },
      { href: '/app/pos', label: 'Point of sale', icon: CreditCard, permission: 'bill.create' },
      { href: '/app/bills', label: 'Bills & payments', icon: ReceiptText, permission: 'payment.read' },
    ],
  },
  {
    group: 'Restaurant',
    items: [
      { href: '/app/menu', label: 'Menu', icon: BookOpen, permission: 'menu.read' },
      { href: '/app/inventory', label: 'Inventory', icon: Boxes, permission: 'inventory.read' },
      { href: '/app/staff', label: 'Staff', icon: Users, permission: 'staff.read' },
    ],
  },
  {
    group: 'Insight',
    items: [
      { href: '/app/analytics', label: 'Analytics', icon: BarChart3, permission: 'analytics.read' },
      { href: '/app/audit-logs', label: 'Audit log', icon: ScrollText, permission: 'audit.read' },
      { href: '/app/settings', label: 'Settings', icon: Settings, permission: 'settings.manage' },
    ],
  },
];

export function AppShell({ me, children }: { me: Me; children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [userOpen, setUserOpen] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);

  const permissionSet = new Set(me.permissions);
  const activeBranch = searchParams.get('branch') ?? me.branches[0]?.id ?? '';
  const branchName = me.branches.find((branch) => branch.id === activeBranch)?.name ?? 'All branches';

  const groups = NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => (item.permission ? permissionSet.has(item.permission) : true)),
  })).filter((group) => group.items.length > 0);

  async function signOut() {
    setSigningOut(true);
    try {
      await clientApi('/auth/logout', { method: 'POST' });
    } finally {
      router.push('/login');
      router.refresh();
    }
  }

  function changeBranch(branchId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('branch', branchId);
    router.push(`${pathname}?${params.toString()}`);
  }

  const sidebar = (
    <div className="flex h-full flex-col bg-night text-[#e9e3d6]">
      <div className="flex items-center gap-2.5 px-4 pb-4 pt-4">
        <span className="grid h-8 w-8 place-items-center rounded-sm border border-[#6d5a2f] font-display text-[16px] leading-none text-[#d8b978]">
          T
        </span>
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-semibold tracking-[-0.01em] text-white">TableTap</p>
          <p className="truncate text-[10.5px] text-[#8f8778]">{me.tenant?.name ?? 'Platform'}</p>
        </div>
      </div>

      {me.branches.length > 1 ? (
        <div className="px-3 pb-3">
          <label htmlFor="branch-switcher" className="sr-only">
            Active branch
          </label>
          <div className="relative">
            <select
              id="branch-switcher"
              value={activeBranch}
              onChange={(event) => changeBranch(event.target.value)}
              className="h-8 w-full appearance-none rounded-sm border border-[#332d23] bg-[#191610] px-2.5 pr-7 text-[11.5px] text-[#e9e3d6] focus:border-[#6d5a2f] focus:outline-none"
            >
              {me.branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden
              className="pointer-events-none absolute right-2 top-2.5 h-3 w-3 text-[#7d7566]"
            />
          </div>
        </div>
      ) : null}

      <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-2 pb-3 scrollbar-thin">
        {groups.map((group) => (
          <div key={group.group}>
            <p className="px-2 pb-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#6f6759]">
              {group.group}
            </p>
            <ul className="space-y-px">
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={`${item.href}?${searchParams.toString()}`}
                      onClick={() => setMobileOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'group relative flex items-center gap-2.5 rounded-sm px-2 py-[7px] text-[12.5px] transition-colors duration-150',
                        active
                          ? 'bg-[#221d15] font-medium text-white'
                          : 'text-[#b8b0a0] hover:bg-[#1c1812] hover:text-[#efe9dd]',
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'h-[5px] w-[5px] shrink-0 rounded-full transition-colors',
                          active ? 'bg-[#d8b978]' : 'bg-transparent',
                        )}
                      />
                      <Icon
                        className={cn(
                          'h-[15px] w-[15px] transition-colors',
                          active ? 'text-[#d8b978]' : 'text-[#7d7566] group-hover:text-[#b8b0a0]',
                        )}
                      />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {me.user.platformAdmin ? (
          <div>
            <p className="px-2 pb-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#6f6759]">
              Platform
            </p>
            <Link
              href="/platform/dashboard"
              className="flex items-center gap-2.5 rounded-sm px-2 py-[7px] text-[12.5px] text-[#b8b0a0] transition-colors hover:bg-[#1c1812] hover:text-[#efe9dd]"
            >
              <span aria-hidden className="h-[5px] w-[5px] rounded-full bg-transparent" />
              <ShieldCheck className="h-[15px] w-[15px] text-[#7d7566]" />
              Platform admin
            </Link>
          </div>
        ) : null}
      </nav>

      <div className="border-t border-[#2a251c] p-2.5">
        <div className="relative">
          <button
            type="button"
            onClick={() => setUserOpen((open) => !open)}
            aria-expanded={userOpen}
            className="flex w-full items-center gap-2.5 rounded-sm px-1.5 py-1.5 text-left transition-colors hover:bg-[#1c1812]"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#3a3327] bg-[#221d15] text-[10px] font-semibold text-[#e9e3d6]">
              {initials(me.user.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11.5px] font-medium text-white">{me.user.name}</span>
              <span className="block truncate text-[10px] text-[#8f8778]">{me.role ?? 'Platform admin'}</span>
            </span>
            <ChevronDown className="h-3 w-3 text-[#7d7566]" />
          </button>
          {userOpen ? (
            <div className="absolute bottom-full left-0 right-0 mb-2 animate-scale-in rounded-sm border border-[#332d23] bg-[#191610] p-1 shadow-[var(--shadow-overlay)]">
              <p className="truncate px-2 py-1 text-[10.5px] text-[#8f8778]">{me.user.email}</p>
              <button
                type="button"
                onClick={signOut}
                disabled={signingOut}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[11.5px] text-[#e9e3d6] transition-colors hover:bg-[#221d15]"
              >
                <LogOut className="h-3.5 w-3.5" />
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-paper">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] border-r border-[#2a251c] lg:block">
        {sidebar}
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-night/60"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[264px] animate-fade">{sidebar}</div>
        </div>
      ) : null}

      <div className="lg:pl-[232px]">
        <header className="sticky top-0 z-20 flex h-12 items-center justify-between gap-3 border-b border-line bg-paper px-4 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-sm p-1.5 text-ink hover:bg-paper-deep"
            aria-label="Open navigation"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
          <span className="truncate text-[12px] font-medium">{me.tenant?.name ?? 'TableTap'}</span>
          <Link
            href="/app/dashboard"
            className="rounded-sm p-1.5 text-ink hover:bg-paper-deep"
            aria-label="Overview"
          >
            <LayoutDashboard className="h-5 w-5" />
          </Link>
        </header>

        <ServiceRail
          tenantName={me.tenant?.name ?? 'TableTap'}
          branchName={branchName}
          role={me.role ?? 'Platform admin'}
        />

        <main className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8 lg:py-7">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
