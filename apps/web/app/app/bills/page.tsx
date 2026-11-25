import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSession, hasPermission } from '@/lib/auth';
import { serverApi } from '@/lib/api-server';
import { formatDateTime, formatTHB } from '@/lib/utils';
import type { BillRow } from '@/lib/types';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, InlineError } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR, TableWrap } from '@/components/ui/table';

export const metadata: Metadata = { title: 'Bills & payments' };
export const dynamic = 'force-dynamic';

const FILTERS = ['ALL', 'OPEN', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'REFUNDED'] as const;

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; status?: string }>;
}) {
  const me = await requireSession();
  if (!me.tenant) redirect('/platform/dashboard');
  if (!hasPermission(me, 'payment.read')) return <NoAccess permission="payment.read" />;
  const params = await searchParams;
  const branchId = params.branch ?? me.branches[0]?.id;
  if (!branchId) return <EmptyState title="No branch" />;
  const status =
    params.status && FILTERS.includes(params.status as (typeof FILTERS)[number]) ? params.status : 'ALL';

  let bills: BillRow[] = [];
  let error: string | null = null;
  try {
    const query = new URLSearchParams({ branchId, limit: '100' });
    if (status !== 'ALL') query.set('status', status);
    bills = await serverApi<BillRow[]>(`/bills?${query.toString()}`);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : 'Could not load bills';
  }

  const paidTotal = bills
    .filter((bill) => bill.status === 'PAID')
    .reduce((acc, bill) => acc + Number(bill.total), 0);
  const dueTotal = bills.reduce((acc, bill) => acc + Number(bill.due), 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Money"
        title="Bills & payments"
        description={`${bills.length} bill(s) in this view · ${formatTHB(paidTotal)} settled · ${formatTHB(dueTotal)} outstanding`}
      />
      {error ? <InlineError>{error}</InlineError> : null}

      <div className="flex flex-wrap gap-1">
        {FILTERS.map((filter) => (
          <Link
            key={filter}
            href={`/app/bills?branch=${branchId}${filter === 'ALL' ? '' : `&status=${filter}`}`}
            className={
              status === filter
                ? 'rounded-full bg-ink px-3 py-1.5 text-[12px] font-medium text-paper'
                : 'rounded-full bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-soft hover:bg-paper-deep'
            }
          >
            {filter === 'ALL' ? 'All' : filter.replace(/_/g, ' ').toLowerCase()}
          </Link>
        ))}
      </div>

      {bills.length === 0 ? (
        <EmptyState title="No bills" description="Bills are created from a live table session in the POS." />
      ) : (
        <TableWrap>
          <Table>
            <THead>
              <TR>
                <TH>Bill</TH>
                <TH>Table</TH>
                <TH>Status</TH>
                <TH className="text-right">Total</TH>
                <TH className="text-right">Paid</TH>
                <TH className="text-right">Due</TH>
                <TH className="text-right">Opened</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {bills.map((bill) => (
                <TR key={bill.id}>
                  <TD className="font-medium text-ink">{bill.number}</TD>
                  <TD>Table {bill.table.number}</TD>
                  <TD>
                    <StatusBadge status={bill.status} />
                  </TD>
                  <TD className="text-right tabular">{formatTHB(bill.total)}</TD>
                  <TD className="text-right tabular text-success">{formatTHB(bill.paidTotal)}</TD>
                  <TD className="text-right tabular">{formatTHB(bill.due)}</TD>
                  <TD className="text-right text-[12px] text-muted">{formatDateTime(bill.createdAt)}</TD>
                  <TD className="text-right">
                    <Link
                      href={`/app/bills/${bill.id}?branch=${branchId}`}
                      className="text-[12px] font-medium text-brand hover:underline"
                    >
                      Open
                    </Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      )}
    </div>
  );
}
