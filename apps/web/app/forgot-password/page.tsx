import type { Metadata } from 'next';
import Link from 'next/link';
import { ForgotPasswordForm } from './forgot-form';

export const metadata: Metadata = { title: 'Reset your password' };

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 inline-flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-brand text-white">T</span>
          <span className="text-[14px] font-semibold">TableTap</span>
        </Link>
        <h1 className="text-[24px] font-semibold tracking-tight">Reset your password</h1>
        <p className="mt-1 mb-6 text-[13px] text-muted">
          We will email a single-use link. Nothing is revealed about whether an account exists.
        </p>
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
