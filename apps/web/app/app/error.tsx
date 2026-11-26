'use client';

import { RotateCcw, TriangleAlert } from 'lucide-react';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <span className="border border-danger/30 bg-danger-soft p-3 text-danger">
        <TriangleAlert className="h-5 w-5" />
      </span>
      <h1 className="mt-4 font-display text-[26px] leading-tight text-ink">This screen could not load</h1>
      <p className="mt-2 max-w-md text-[12.5px] leading-relaxed text-muted">
        The API did not answer this request. Nothing was written, so it is safe to retry once the connection
        is back. If it keeps failing, check the API process and the database.
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-[10px] text-muted-soft">reference {error.digest}</p>
      ) : null}
      <button
        type="button"
        onClick={reset}
        className="mt-6 inline-flex h-9 items-center gap-1.5 bg-ink px-4 text-[12px] font-semibold text-paper transition-colors hover:bg-ink-soft"
      >
        <RotateCcw className="h-3.5 w-3.5" /> Try again
      </button>
    </div>
  );
}
