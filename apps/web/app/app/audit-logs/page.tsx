import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireSession, hasPermission } from '@/lib/auth';
import { serverApi } from '@/lib/api-server';
import { formatDateTime } from '@/lib/utils';
import type { AuditRow, Paginated } from '@/lib/types';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, InlineError } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR, TableEmpty, TableWrap } from '@/components/ui/table';

export const metadata: Metadata = { title: 'Audit log' };
export const dynamic = 'force-dynamic';

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string }>;
}) {
  const me = await requireSession();
  if (!me.tenant) redirect('/platform/dashboard');
  if (!hasPermission(me, 'audit.read')) return <NoAccess permission="audit.read" />;
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));

  let result: Paginated<AuditRow> | null = null;
  let error: string | null = null;
  try {
    const query = new URLSearchParams({ page: String(page), pageSize: '40' });
    if (params.search) query.set('search', params.search);
    result = await serverApi<Paginated<AuditRow>>(`/audit-logs?${query.toString()}`);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : 'Could not load the audit log';
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Governance"
        title="Audit log"
        description="Append-only record of security- and money-relevant actions. Passwords, tokens and payment secrets are never stored here."
      />
      {error ? <InlineError>{error}</InlineError> : null}

      <form action="/app/audit-logs" className="flex items-center gap-2">
        <input
          name="search"
          defaultValue={params.search}
          placeholder="Action, resource or actor"
          aria-label="Search audit log"
          className="h-9 w-72 rounded-md border border-line bg-surface px-3 text-[12px] focus:border-brand focus:outline-none"
        />
        <button
          type="submit"
          className="h-9 rounded-md border border-line-strong bg-surface px-3 text-[12px] font-medium hover:bg-paper-deep"
        >
          Search
        </button>
      </form>

      {!result || result.items.length === 0 ? (
        <EmptyState
          title="No audit entries"
          description="Actions such as price changes, cancellations and payment confirmations appear here."
        />
      ) : (
        <>
          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH>When</TH>
                  <TH>Actor</TH>
                  <TH>Action</TH>
                  <TH>Resource</TH>
                  <TH>Reason</TH>
                  <TH>Request</TH>
                </TR>
              </THead>
              <TBody>
                {result.items.map((row) => (
                  <TR key={row.id}>
                    <TD className="whitespace-nowrap text-[12px] text-muted">
                      {formatDateTime(row.createdAt)}
                    </TD>
                    <TD className="text-[12px]">
                      {row.actor ? (
                        <span>
                          {row.actor.name}
                          <span className="block text-[11px] text-muted">{row.actor.email}</span>
                        </span>
                      ) : (
                        <span className="text-muted">{row.actorType.toLowerCase()}</span>
                      )}
                    </TD>
                    <TD className="font-mono text-[11px] text-ink">{row.action}</TD>
                    <TD className="text-[12px]">
                      {row.resourceType}
                      {row.resourceId ? (
                        <span className="block truncate text-[10px] text-muted">{row.resourceId}</span>
                      ) : null}
                    </TD>
                    <TD className="max-w-[220px] text-[11px] text-muted">{row.reason ?? '—'}</TD>
                    <TD className="font-mono text-[10px] text-muted">{row.requestId ?? '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
          <div className="flex items-center justify-between text-[12px] text-muted">
            <span>
              Page {result.page} of {result.totalPages} · {result.total} entries
            </span>
            <div className="flex gap-2">
              {result.page > 1 ? (
                <a
                  href={`/app/audit-logs?page=${result.page - 1}${params.search ? `&search=${params.search}` : ''}`}
                  className="rounded-md border border-line-strong bg-surface px-3 py-1.5 hover:bg-paper-deep"
                >
                  Previous
                </a>
              ) : null}
              {result.page < result.totalPages ? (
                <a
                  href={`/app/audit-logs?page=${result.page + 1}${params.search ? `&search=${params.search}` : ''}`}
                  className="rounded-md border border-line-strong bg-surface px-3 py-1.5 hover:bg-paper-deep"
                >
                  Next
                </a>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
