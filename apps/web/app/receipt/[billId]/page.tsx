import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireSession, hasPermission } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { serverApi } from '@/lib/api-server';
import { cn, formatTHB } from '@/lib/utils';
import { PrintControls } from './print-controls';

export const metadata: Metadata = { title: 'Receipt' };
export const dynamic = 'force-dynamic';

interface SnapshotPayload {
  restaurant: { name: string; taxId: string | null; address: string | null };
  branch: {
    name: string;
    address: string | null;
    phone: string | null;
    vatRate: string;
    vatInclusive: boolean;
  };
  billNumber: string;
  receiptNumber: string;
  orderNumbers: string[];
  table: string;
  issuedAt: string;
  currency: string;
  items: Array<{
    name: string;
    variantName: string | null;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
    lineTax: string;
  }>;
  subtotal: string;
  discountTotal: string;
  serviceCharge: string;
  taxTotal: string;
  total: string;
  payments: Array<{
    method: string;
    status: string;
    amount: string;
    amountPaid: string;
    reference: string;
  }>;
  refunds: Array<{ amount: string; reason: string | null; createdAt: string }>;
  notice: string;
}

interface ReceiptSnapshot {
  number: string;
  issuedAt: string;
  /** Prisma JSON is typed loosely; it may arrive as an object or a string. */
  payload: unknown;
}

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  PROMPTPAY: 'PromptPay',
  OTHER: 'Other',
};

function issuedLabel(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ billId: string }>;
  searchParams: Promise<{ format?: string }>;
}) {
  const me = await requireSession();
  if (!me.tenant) redirect('/platform/dashboard');
  if (!hasPermission(me, 'payment.read')) redirect('/app/dashboard');
  const { billId } = await params;
  const { format } = await searchParams;
  const thermal = format === 'thermal';

  let snapshot: ReceiptSnapshot;
  try {
    snapshot = await serverApi<ReceiptSnapshot>(`/bills/${billId}/receipt`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      return (
        <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
          <p className="text-[9px] uppercase tracking-[0.22em] text-muted-soft">Receipt</p>
          <h1 className="mt-2 font-display text-[26px] text-ink">Available once the bill is paid</h1>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
            A receipt is a snapshot of a settled bill. Take the payment first, then print it from the bill.
          </p>
          <Link
            href={`/app/bills/${billId}`}
            className="mt-5 inline-flex h-9 items-center bg-ink px-4 text-[12px] font-semibold text-paper"
          >
            Back to the bill
          </Link>
        </div>
      );
    }
    notFound();
  }

  const parsed = typeof snapshot.payload === 'string' ? JSON.parse(snapshot.payload) : snapshot.payload;
  const p = parsed as SnapshotPayload;
  const items = Array.isArray(p.items) ? p.items : [];
  const payments = Array.isArray(p.payments) ? p.payments : [];
  const refunds = Array.isArray(p.refunds) ? p.refunds : [];
  const orderNumbers = Array.isArray(p.orderNumbers) ? p.orderNumbers : [];
  const totalQty = items.reduce((acc, item) => acc + item.quantity, 0);
  const paid = payments.reduce((acc, payment) => acc + Number(payment.amountPaid), 0);

  return (
    <div className="receipt-page min-h-dvh bg-paper-deep/70 py-6">
      <style>{`@page { size: ${thermal ? '80mm auto' : 'A4'}; margin: ${thermal ? '3mm' : '12mm'}; }
        @media print {
          body { background: #fff !important; }
          .receipt-page { background: #fff !important; padding: 0 !important; }
          .receipt-sheet { box-shadow: none !important; border: 0 !important; margin: 0 auto !important; max-width: none !important; }
          .receipt-sheet.thermal { width: auto !important; }
        }`}</style>

      <PrintControls billId={billId} format={thermal ? 'thermal' : 'a4'} receiptNumber={snapshot.number} />

      <article
        className={cn(
          'receipt-sheet relative mx-auto bg-white text-ink shadow-[0_24px_70px_-40px_rgba(22,19,14,0.55)]',
          thermal ? 'thermal w-[78mm] px-[5mm] py-[6mm]' : 'w-full max-w-[188mm] px-[14mm] py-[14mm]',
        )}
      >
        {!thermal ? (
          <span className="absolute right-[14mm] top-[16mm] -rotate-6 border-2 border-brand/60 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.3em] text-brand/80">
            Paid
          </span>
        ) : null}

        <header className={cn('text-center', thermal ? 'pb-3' : 'pb-5')}>
          <p
            className={cn(
              'font-semibold uppercase text-muted-soft',
              thermal ? 'text-[7px] tracking-[0.22em]' : 'text-[8.5px] tracking-[0.32em]',
            )}
          >
            Sales receipt
          </p>
          <h1
            className={cn(
              'font-display leading-none text-ink',
              thermal ? 'mt-1.5 text-[20px]' : 'mt-2.5 text-[34px]',
            )}
          >
            {p.restaurant.name}
          </h1>
          <div className={cn('text-muted', thermal ? 'mt-1 text-[8.5px]' : 'mt-2 text-[11px]')}>
            <p>
              {p.branch.name}
              {p.branch.address ? ` · ${p.branch.address}` : ''}
            </p>
            <p>
              {p.branch.phone ? `โทร ${p.branch.phone}` : ''}
              {p.restaurant.taxId ? ` · เลขผู้เสียภาษี ${p.restaurant.taxId}` : ''}
            </p>
          </div>
        </header>

        <div className="border-t-[3px] border-double border-ink/70" />

        {thermal ? (
          <section className="divide-y divide-line/60 py-1 text-[8.5px]">
            {[
              ['Receipt', snapshot.number],
              ['Bill', p.billNumber],
              ['Table', `${p.table} · ${issuedLabel(p.issuedAt)}`],
              ['Orders', orderNumbers.join(', ') || '—'],
              ['Items', String(totalQty)],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-3 py-1">
                <span className="uppercase tracking-[0.14em] text-muted-soft">{label}</span>
                <span className="money break-all text-right text-ink">{value}</span>
              </div>
            ))}
          </section>
        ) : (
          <section className="grid grid-cols-2 gap-x-10 gap-y-3 py-4 text-[10.5px]">
            {[
              ['Receipt', snapshot.number],
              ['Bill', p.billNumber],
              ['Issued', issuedLabel(p.issuedAt)],
              ['Table', p.table],
              ['Orders', orderNumbers.join(', ') || '—'],
              ['Items', String(totalQty)],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="font-semibold uppercase tracking-[0.14em] text-muted-soft">{label}</p>
                <p className="money mt-0.5 break-words text-ink">{value}</p>
              </div>
            ))}
          </section>
        )}

        <div className="border-t border-line" />

        <table className={cn('w-full', thermal ? 'my-2 text-[9.5px]' : 'my-4 text-[12px]')}>
          <thead>
            <tr className="border-b border-line">
              <th className="pb-1.5 text-left text-[8.5px] font-semibold uppercase tracking-[0.14em] text-muted-soft">
                Item
              </th>
              <th className="pb-1.5 text-right text-[8.5px] font-semibold uppercase tracking-[0.14em] text-muted-soft">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={`${item.name}-${index}`} className="border-b border-line/60 align-top">
                <td className={thermal ? 'py-1.5 pr-2' : 'py-2.5 pr-4'}>
                  <p className="font-medium leading-snug text-ink">
                    <span className="money mr-1.5 text-muted">{item.quantity}×</span>
                    {item.name}
                    {item.variantName ? <span className="text-muted"> · {item.variantName}</span> : null}
                  </p>
                  <p className={cn('text-muted', thermal ? 'text-[7.5px]' : 'text-[9.5px]')}>
                    {formatTHB(item.unitPrice)} each · VAT {formatTHB(item.lineTax)}
                  </p>
                </td>
                <td className="money whitespace-nowrap text-right text-ink">{formatTHB(item.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className={cn('ml-auto', thermal ? 'w-full' : 'w-[74mm]')}>
          {[
            ['Subtotal', formatTHB(p.subtotal)],
            ...(Number(p.discountTotal) !== 0
              ? ([['Discount', `− ${formatTHB(p.discountTotal)}`]] as Array<[string, string]>)
              : []),
            ...(Number(p.serviceCharge) !== 0
              ? ([['Service charge', formatTHB(p.serviceCharge)]] as Array<[string, string]>)
              : []),
            [`VAT ${p.branch.vatRate}%${p.branch.vatInclusive ? ' (incl.)' : ''}`, formatTHB(p.taxTotal)],
          ].map(([label, value]) => (
            <div
              key={label}
              className={cn('flex items-baseline gap-2', thermal ? 'py-0.5 text-[9px]' : 'py-1 text-[11px]')}
            >
              <span className="text-muted">{label}</span>
              <span className="flex-1 border-b border-dotted border-line-strong/70" />
              <span className="money text-ink">{value}</span>
            </div>
          ))}

          <div
            className={cn(
              'mt-1.5 flex items-baseline justify-between border-t-[3px] border-double border-ink/70',
              thermal ? 'pt-1.5' : 'pt-3',
            )}
          >
            <span
              className={cn(
                'font-semibold uppercase tracking-[0.16em] text-ink',
                thermal ? 'text-[9px]' : 'text-[10.5px]',
              )}
            >
              Total
            </span>
            <span className={cn('money font-medium text-ink', thermal ? 'text-[16px]' : 'text-[24px]')}>
              {formatTHB(p.total)}
            </span>
          </div>
        </section>

        <section className={cn(thermal ? 'mt-2' : 'mt-5')}>
          <div className="flex items-baseline gap-2">
            <span className="text-[8.5px] font-semibold uppercase tracking-[0.16em] text-muted-soft">
              Payments
            </span>
            <span className="flex-1 border-b border-line" />
          </div>
          <ul className={cn('mt-1.5 space-y-1', thermal ? 'text-[8.5px]' : 'text-[10.5px]')}>
            {payments.map((payment) => (
              <li key={payment.reference} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0">
                  <span className="font-medium text-ink">
                    {METHOD_LABEL[payment.method] ?? payment.method}
                  </span>
                  <span className="ml-2 break-all font-mono text-[8.5px] text-muted">
                    {payment.reference}
                  </span>
                </span>
                <span className="money shrink-0 text-ink">{formatTHB(payment.amountPaid)}</span>
              </li>
            ))}
            {refunds.map((refund) => (
              <li key={refund.createdAt} className="flex items-baseline justify-between gap-3 text-danger">
                <span>Refund{refund.reason ? ` · ${refund.reason}` : ''}</span>
                <span className="money">− {formatTHB(refund.amount)}</span>
              </li>
            ))}
            <li className="flex items-baseline justify-between gap-3 border-t border-line pt-1">
              <span className="text-muted">Received</span>
              <span className="money text-ink">{formatTHB(paid.toFixed(2))}</span>
            </li>
          </ul>
        </section>

        <footer className={cn('text-center', thermal ? 'mt-3' : 'mt-6')}>
          <div className="mx-auto mb-2 w-10 border-t border-line" />
          <p className={cn('font-display text-ink', thermal ? 'text-[12px]' : 'text-[15px]')}>
            ขอบคุณที่ใช้บริการ
          </p>
          <p className={cn('italic text-muted', thermal ? 'text-[8px]' : 'text-[10px]')}>
            Thank you for dining with us.
          </p>
          <p
            className={cn(
              'mx-auto mt-2 max-w-[62ch] leading-relaxed text-muted-soft',
              thermal ? 'text-[7px]' : 'text-[8px]',
            )}
          >
            {p.notice}
          </p>
          <p className="mt-2 text-[7px] uppercase tracking-[0.3em] text-muted-soft">
            TableTap · {snapshot.number}
          </p>
        </footer>
      </article>

      <p className="no-print mx-auto mt-4 max-w-[188mm] px-4 text-center text-[10.5px] text-muted">
        {thermal
          ? 'The 80 mm layout is sized for a thermal roll printer. Choose “Save as PDF” to keep a copy.'
          : 'The A4 layout prints as a folded check. Choose “Save as PDF” to keep a copy.'}
      </p>
    </div>
  );
}
