'use client';

import { Printer } from 'lucide-react';

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-9 items-center gap-1.5 border border-line px-3 text-[12px] font-medium text-ink transition-colors hover:border-line-strong hover:bg-paper-deep"
    >
      <Printer className="h-3.5 w-3.5" /> Print
    </button>
  );
}
