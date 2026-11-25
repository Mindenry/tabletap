import type { Metadata } from 'next';
import Link from 'next/link';
import { ResetPasswordForm } from './reset-form';

export const metadata: Metadata = { title: 'Choose a new password' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 inline-flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-brand text-white">T</span>
          <span className="text-[14px] font-semibold">TableTap</span>
        </Link>
        <h1 className="text-[24px] font-semibold tracking-tight">Choose a new password</h1>
        <p className="mt-1 mb-6 text-[13px] text-muted">This also signs you out of every other device.</p>
        <ResetPasswordForm token={params.token ?? ''} />
      </div>
    </div>
  );
}
