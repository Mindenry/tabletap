'use client';

import Link from 'next/link';
import { ArrowLeft, Printer } from 'lucide-react';
import { cn } from '@/lib/utils';

export function PrintControls({
  billId,
  format,
  receiptNumber,
}: {
  billId: string;
  format: 'a4' | 'thermal';
  receiptNumber: string;
}) {
  return (
    <div className="no-print mx-auto mb-5 flex w-full max-w-[820px] flex-wrap items-center justify-between gap-3 px-4">
      <div className="flex items-center gap-3">
        <Link
          href={`/app/bills/${billId}`}
          className="inline-flex h-9 items-center gap-1.5 border border-line bg-surface-raised px-3 text-[12px] font-medium text-ink hover:bg-paper-deep"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to bill
        </Link>
        <span className="hidden text-[11px] text-muted sm:inline">Receipt {receiptNumber}</span>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex border border-line bg-surface-raised">
          <Link
            href={`/receipt/${billId}?format=a4`}
            className={cn(
              'px-3 py-1.5 text-[11.5px] font-medium transition-colors',
              format === 'a4' ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-paper-deep',
            )}
          >
            A4 check
          </Link>
          <Link
            href={`/receipt/${billId}?format=thermal`}
            className={cn(
              'border-l border-line px-3 py-1.5 text-[11.5px] font-medium transition-colors',
              format === 'thermal' ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-paper-deep',
            )}
          >
            80 mm
          </Link>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-9 items-center gap-1.5 bg-ink px-4 text-[12px] font-semibold text-paper transition-colors hover:bg-ink-soft"
        >
          <Printer className="h-3.5 w-3.5" /> Print
        </button>
      </div>
    </div>
  );
}
