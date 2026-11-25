import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="max-w-sm text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">404</p>
        <h1 className="mt-2 text-[26px] font-semibold tracking-tight">We could not find that page</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          The link may have expired, or the table QR may have been rotated by staff.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex h-10 items-center rounded-md bg-ink px-4 text-[13px] font-medium text-paper"
        >
          Back to TableTap
        </Link>
      </div>
    </div>
  );
}
