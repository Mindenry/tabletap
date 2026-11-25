import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ShieldCheck, Store } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { PlatformSignOut } from './platform-sign-out';

export const metadata: Metadata = { title: 'Platform administration' };

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const me = await requireSession();
  if (!me.user.platformAdmin) redirect(me.tenant ? '/app/dashboard' : '/login');

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-night text-[#e8e2d6]">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-brand text-white">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-white">TableTap platform</p>
              <p className="text-[11px] text-[#a8a194]">{me.user.email}</p>
            </div>
          </div>
          <nav className="flex items-center gap-3 text-[12px]">
            <Link href="/platform/dashboard" className="text-[#c9c2b4] hover:text-white">
              Dashboard
            </Link>
            <Link href="/platform/dashboard#tenants" className="text-[#c9c2b4] hover:text-white">
              Tenants
            </Link>
            {me.tenant ? (
              <Link
                href="/app/dashboard"
                className="inline-flex items-center gap-1 text-[#c9c2b4] hover:text-white"
              >
                <Store className="h-3.5 w-3.5" /> Restaurant view
              </Link>
            ) : null}
            <PlatformSignOut />
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-5 py-7">{children}</main>
    </div>
  );
}
