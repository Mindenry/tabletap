'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';

const LABELS: Record<string, string> = {
  dashboard: 'Overview',
  tables: 'Floor',
  requests: 'Guest requests',
  orders: 'Orders',
  kitchen: 'Kitchen',
  pos: 'Point of sale',
  bills: 'Bills & payments',
  menu: 'Menu',
  inventory: 'Inventory',
  staff: 'Staff',
  analytics: 'Analytics',
  'audit-logs': 'Audit log',
  settings: 'Settings',
};

export function ServiceRail({
  tenantName,
  branchName,
  role,
}: {
  tenantName: string;
  branchName: string;
  role: string;
}) {
  const pathname = usePathname();
  const [now, setNow] = React.useState<Date | null>(null);

  React.useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const segment = pathname.split('/').filter(Boolean).pop() ?? 'dashboard';
  const section = LABELS[segment] ?? 'Overview';
  const time = now
    ? new Intl.DateTimeFormat('th-TH', {
        timeZone: 'Asia/Bangkok',
        hour: '2-digit',
        minute: '2-digit',
      }).format(now)
    : '--:--';
  const date = now
    ? new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Bangkok',
        day: '2-digit',
        month: 'short',
      }).format(now)
    : '';

  return (
    <div className="sticky top-0 z-30 hidden h-10 items-center justify-between gap-4 border-b border-line bg-paper/95 px-6 lg:flex">
      <div className="flex min-w-0 items-center gap-3 text-[11px] text-muted">
        <span className="truncate font-medium text-ink-soft">{tenantName}</span>
        <span aria-hidden className="h-3 w-px bg-line-strong" />
        <span className="truncate">{branchName}</span>
        <span aria-hidden className="h-3 w-px bg-line-strong" />
        <span className="truncate">{section}</span>
      </div>
      <div className="flex items-center gap-4 text-[11px] text-muted">
        <span className="hidden items-center gap-1.5 sm:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          Service open
        </span>
        <span className="hidden text-muted-soft sm:inline">
          {role.charAt(0) + role.slice(1).toLowerCase()}
        </span>
        <span className="money text-ink-soft">
          {date} · {time}
        </span>
      </div>
    </div>
  );
}
