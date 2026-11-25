import Link from 'next/link';

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="max-w-sm text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">Offline</p>
        <h1 className="mt-2 text-[26px] font-semibold tracking-tight">No connection</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          TableTap needs a live connection to read the menu and to record orders or payments. Nothing was
          submitted while you were offline.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex h-10 items-center rounded-md bg-ink px-4 text-[13px] font-medium text-paper"
        >
          Try again
        </Link>
      </div>
    </div>
  );
}
