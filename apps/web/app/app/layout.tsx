import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { requireSession } from '@/lib/auth';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireSession();
  if (!me.tenant) redirect('/platform/dashboard');
  return <AppShell me={me}>{children}</AppShell>;
}
