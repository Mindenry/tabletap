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
  X,
} from 'lucide-react';
import { clientApi } from '@/lib/api';
import { cn, initials } from '@/lib/utils';
import type { Me } from '@/lib/types';
import { Button } from './ui/button';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  permission?: string;
  any?: string[];
}

const NAV: Array<{ group: string; items: NavItem[] }> = [
  {
    group: 'Service',
    items: [
      { href: '/app/dashboard', label: 'Overview', icon: LayoutDashboard, permission: 'analytics.read' },
      { href: '/app/tables', label: 'Floor', icon: Grid2x2, permission: 'table.read' },
      { href: '/app/orders', label: 'Orders', icon: ClipboardList, permission: 'order.read' },
      { href: '/app/kitchen', label: 'Kitchen', icon: UtensilsCrossed, permission: 'kitchen.read' },
      { href: '/app/requests', label: 'Guest requests', icon: BellRing, permission: 'table.read' },
      { href: '/app/pos', label: 'POS', icon: CreditCard, permission: 'bill.create' },
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
    <div className="flex h-full flex-col bg-night text-[#e8e2d6]">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="grid h-8 w-8 place-items-center rounded-md bg-brand text-white">
          <Store className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold tracking-tight text-white">TableTap</p>
          <p className="truncate text-[11px] text-[#a8a194]">{me.tenant?.name ?? 'Platform'}</p>
        </div>
      </div>

      {me.branches.length > 1 ? (
        <div className="px-4 pb-3">
          <label htmlFor="branch-switcher" className="sr-only">
            Active branch
          </label>
          <div className="relative">
            <select
              id="branch-switcher"
              value={activeBranch}
              onChange={(event) => changeBranch(event.target.value)}
              className="h-9 w-full appearance-none rounded-md border border-white/10 bg-night-soft px-3 pr-8 text-[12px] text-[#e8e2d6] focus:border-brand focus:outline-none"
            >
              {me.branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden
              className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-[#a8a194]"
            />
          </div>
        </div>
      ) : null}

      <nav aria-label="Main" className="flex-1 space-y-6 overflow-y-auto px-3 pb-4 scrollbar-thin">
        {groups.map((group) => (
          <div key={group.group}>
            <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7d7768]">
              {group.group}
            </p>
            <ul className="space-y-0.5">
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
                        'group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors',
                        active
                          ? 'bg-white/[0.09] font-medium text-white'
                          : 'text-[#c9c2b4] hover:bg-white/[0.05] hover:text-white',
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-4 w-4',
                          active ? 'text-brand' : 'text-[#8b8475] group-hover:text-[#c9c2b4]',
                        )}
                      />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {me.user.platformAdmin ? (
          <div>
            <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7d7768]">
              Platform
            </p>
            <Link
              href="/platform/dashboard"
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-[#c9c2b4] transition-colors hover:bg-white/[0.05] hover:text-white"
            >
              <ShieldCheck className="h-4 w-4 text-[#8b8475]" />
              Platform admin
            </Link>
          </div>
        ) : null}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="relative">
          <button
            type="button"
            onClick={() => setUserOpen((open) => !open)}
            aria-expanded={userOpen}
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-white/[0.05]"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#3a352b] text-[11px] font-semibold text-[#e8e2d6]">
              {initials(me.user.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium text-white">{me.user.name}</span>
              <span className="block truncate text-[11px] text-[#a8a194]">{me.role ?? 'Platform admin'}</span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-[#8b8475]" />
          </button>
          {userOpen ? (
            <div className="absolute bottom-full left-0 right-0 mb-2 rounded-md border border-white/10 bg-night-soft p-1.5 shadow-pop">
              <p className="truncate px-2 py-1 text-[11px] text-[#a8a194]">{me.user.email}</p>
              <button
                type="button"
                onClick={signOut}
                disabled={signingOut}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-[#e8e2d6] hover:bg-white/[0.06]"
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
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[236px] lg:block">{sidebar}</aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-night/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[264px] animate-fade">{sidebar}</div>
        </div>
      ) : null}

      <div className="lg:pl-[236px]">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line bg-paper/85 px-4 backdrop-blur-md lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-2 text-ink hover:bg-paper-deep"
            aria-label="Open navigation"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
          <span className="text-[13px] font-semibold">{me.tenant?.name ?? 'TableTap'}</span>
          <Link
            href="/app/dashboard"
            className="rounded-md p-2 text-ink hover:bg-paper-deep"
            aria-label="Overview"
          >
            <LayoutDashboard className="h-5 w-5" />
          </Link>
        </header>

        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

export function ShellCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon" onClick={onClick} aria-label="Close">
      <X className="h-4 w-4" />
    </Button>
  );
}
