import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { LoginExperience } from './login-experience';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage() {
  const me = await getSession();
  if (me) redirect(me.tenant ? '/app/dashboard' : '/platform/dashboard');
  return <LoginExperience />;
}
