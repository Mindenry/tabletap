import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

/**
 * Page-level authorization. Navigation hiding is not authorization: every
 * protected page renders this instead of its content when the role lacks the
 * permission, even though the API would also reject the underlying requests.
 */
export function NoAccess({ permission }: { permission: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="max-w-md rounded-lg border border-line bg-surface-raised p-8 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-brand" />
        <h1 className="mt-3 text-[18px] font-semibold tracking-tight">You do not have access</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          This page requires the{' '}
          <code className="rounded bg-paper-deep px-1 py-0.5 text-[11px]">{permission}</code> permission. Ask
          an owner or manager if you need it.
        </p>
        <Link
          href="/app/dashboard"
          className="mt-4 inline-flex h-9 items-center rounded-md bg-ink px-4 text-[13px] font-medium text-paper"
        >
          Back to overview
        </Link>
      </div>
    </div>
  );
}
