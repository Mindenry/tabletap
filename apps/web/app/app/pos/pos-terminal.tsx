'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Banknote,
  Check,
  CreditCard,
  Plus,
  Printer,
  QrCode,
  ReceiptText,
  Search,
  Split,
  Undo2,
  Users,
  Wand2,
} from 'lucide-react';
import { clientApi, errorMessage } from '@/lib/api';
import { cn, elapsedLabel, formatDateTime, formatTHB, plural } from '@/lib/utils';
import type { BillDetail, BillRow, MenuItemRow, OrderRow, TableRow } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Label, Select } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/card';

interface PosProps {
  branchId: string;
  initialTables: TableRow[];
  initialBills: BillRow[];
  menu: MenuItemRow[];
  canCreateBill: boolean;
  canSplit: boolean;
  canConfirm: boolean;
  canRefund: boolean;
  canCreateOrder: boolean;
  canCloseTable: boolean;
  initialSessionId?: string;
}

export function PosTerminal({
  branchId,
  initialTables,
  initialBills,
  menu,
  canCreateBill,
  canSplit,
  canConfirm,
  canRefund,
  canCreateOrder,
  canCloseTable,
  initialSessionId,
}: PosProps) {
  const router = useRouter();
  const tables = initialTables.filter((table) => table.session);
  const [search, setSearch] = React.useState('');
  const [selectedTable, setSelectedTable] = React.useState<TableRow | null>(
    tables.find((table) => table.session?.id === initialSessionId) ?? tables[0] ?? null,
  );
  const [bill, setBill] = React.useState<BillDetail | null>(null);
  const [sessionOrders, setSessionOrders] = React.useState<OrderRow[]>([]);
  const [loadingBill, setLoadingBill] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const [splitOpen, setSplitOpen] = React.useState(false);
  const [parts, setParts] = React.useState('2');

  const [paymentOpen, setPaymentOpen] = React.useState(false);
  const [paymentSplitId, setPaymentSplitId] = React.useState<string | null>(null);
  const [method, setMethod] = React.useState<'CASH' | 'PROMPTPAY' | 'CARD'>('CASH');
  const [amount, setAmount] = React.useState('');
  const [promptPay, setPromptPay] = React.useState<{
    paymentId: string;
    payload: string;
    dataUrl: string;
    accountName: string | null;
    promptPayTarget: string | null;
  } | null>(null);
  const [paymentId, setPaymentId] = React.useState<string | null>(null);

  const [addOpen, setAddOpen] = React.useState(false);
  const [addSearch, setAddSearch] = React.useState('');
  const [addLines, setAddLines] = React.useState<Record<string, number>>({});

  const [refundOpen, setRefundOpen] = React.useState(false);
  const [refundPaymentId, setRefundPaymentId] = React.useState<string | null>(null);
  const [refundAmount, setRefundAmount] = React.useState('');

  const existingBill = selectedTable?.session
    ? initialBills.find((candidate) => candidate.tableSessionId === selectedTable.session?.id)
    : undefined;

  const loadBill = React.useCallback(async (billId: string) => {
    setLoadingBill(true);
    try {
      setBill(await clientApi<BillDetail>(`/bills/${billId}`));
    } catch (error) {
      toast.error(errorMessage(error));
      setBill(null);
    } finally {
      setLoadingBill(false);
    }
  }, []);

  React.useEffect(() => {
    if (existingBill) void loadBill(existingBill.id);
    else setBill(null);
  }, [existingBill?.id, loadBill, existingBill]);

  // When a session has no bill yet, show the orders it will be built from.
  React.useEffect(() => {
    const sessionId = selectedTable?.session?.id;
    if (!sessionId || existingBill) {
      setSessionOrders([]);
      return;
    }
    let cancelled = false;
    clientApi<OrderRow[]>(`/orders?branchId=${branchId}&tableSessionId=${sessionId}`)
      .then((rows) => {
        if (!cancelled) setSessionOrders(rows);
      })
      .catch(() => {
        if (!cancelled) setSessionOrders([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTable?.session?.id, existingBill, branchId]);

  const filteredTables = tables.filter((table) =>
    search.trim() ? table.number.toLowerCase().includes(search.trim().toLowerCase()) : true,
  );

  async function createBill() {
    if (!selectedTable?.session) return;
    setBusy(true);
    try {
      const created = await clientApi<BillDetail>('/bills', {
        method: 'POST',
        body: { tableSessionId: selectedTable.session.id },
      });
      setBill(created);
      toast.success(`Bill ${created.number} created`);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function splitBill() {
    if (!bill) return;
    setBusy(true);
    try {
      const result = await clientApi<BillDetail>(`/bills/${bill.id}/split`, {
        method: 'POST',
        body: { mode: 'EQUAL', parts: Number(parts) },
      });
      setBill(result);
      setSplitOpen(false);
      toast.success(`Split into ${result.splits.length} shares`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function openPayment(split?: { id: string; amount: string }) {
    if (!bill) return;
    setPaymentSplitId(split?.id ?? null);
    setAmount(split?.amount ?? bill.availableToPay);
    setPaymentId(null);
    setPromptPay(null);
    setMethod('CASH');
    setPaymentOpen(true);
  }

  async function startPayment() {
    if (!bill) return;
    setBusy(true);
    try {
      const created = await clientApi<{ id: string; status: string; amount: string }>('/payments', {
        method: 'POST',
        body: {
          billId: bill.id,
          method,
          amount: Number(amount),
          ...(paymentSplitId ? { splitId: paymentSplitId } : {}),
        },
        idempotencyKey: crypto.randomUUID(),
      });
      setPaymentId(created.id);
      if (method === 'PROMPTPAY') {
        const qr = await clientApi<{
          paymentId?: string;
          id: string;
          promptPayPayload: string;
          qrPngDataUrl: string;
          accountName: string | null;
          promptPayTarget: string | null;
        }>(`/payments/${created.id}/promptpay`, { method: 'POST' });
        setPromptPay({
          paymentId: created.id,
          payload: qr.promptPayPayload,
          dataUrl: qr.qrPngDataUrl,
          accountName: qr.accountName,
          promptPayTarget: qr.promptPayTarget,
        });
        toast.success('PromptPay QR ready — payment awaits confirmation');
      } else {
        toast.success('Payment request created. Confirm once the money is in hand.');
      }
      await loadBill(bill.id);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function simulateProvider() {
    if (!paymentId || !bill) return;
    setBusy(true);
    try {
      await clientApi(`/payments/${paymentId}/simulate-provider`, { method: 'POST' });
      toast.success('Provider webhook confirmed the payment');
      setPaymentOpen(false);
      setPromptPay(null);
      await loadBill(bill.id);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function confirmPayment() {
    if (!paymentId || !bill) return;
    setBusy(true);
    try {
      await clientApi(`/payments/${paymentId}/confirm`, {
        method: 'POST',
        body: { amountPaid: Number(amount) },
      });
      toast.success('Payment confirmed');
      setPaymentOpen(false);
      setPromptPay(null);
      await loadBill(bill.id);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function printReceipt() {
    if (!bill) return;
    // The receipt is a real page with print styles; the browser's popup blocker
    // cannot interfere with a route that the cashier can also open later.
    window.open(`/receipt/${bill.id}?format=thermal`, '_blank', 'noopener');
  }

  async function closeSession() {
    if (!selectedTable) return;
    setBusy(true);
    try {
      await clientApi(`/tables/${selectedTable.id}/close-session`, { method: 'POST', body: {} });
      toast.success(`Table ${selectedTable.number} closed`);
      setSelectedTable(null);
      setBill(null);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitAddOrder() {
    if (!selectedTable?.session) return;
    const items = Object.entries(addLines)
      .filter(([, quantity]) => quantity > 0)
      .map(([menuItemId, quantity]) => ({ menuItemId, quantity }));
    if (items.length === 0) {
      toast.error('Add at least one item');
      return;
    }
    setBusy(true);
    try {
      await clientApi('/orders', {
        method: 'POST',
        body: { tableSessionId: selectedTable.session.id, items },
        idempotencyKey: `pos-${selectedTable.session.id}-${Date.now()}`,
      });
      toast.success('Order sent to the kitchen');
      setAddOpen(false);
      setAddLines({});
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitRefund() {
    if (!refundPaymentId || !bill) return;
    setBusy(true);
    try {
      await clientApi(`/payments/${refundPaymentId}/refund`, {
        method: 'POST',
        body: { amount: Number(refundAmount), reason: 'Recorded at POS' },
      });
      toast.success('Refund recorded. Complete the transfer with your bank.');
      setRefundOpen(false);
      await loadBill(bill.id);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const menuResults = menu
    .filter((item) => item.status !== 'ARCHIVED')
    .filter((item) =>
      addSearch.trim()
        ? `${item.name} ${item.nameEn ?? ''}`.toLowerCase().includes(addSearch.toLowerCase())
        : true,
    )
    .slice(0, 40);

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr] xl:grid-cols-[320px_1fr]">
      <aside className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a table"
            className="pl-9"
            aria-label="Search tables"
          />
        </div>
        <div className="space-y-1.5">
          {filteredTables.length === 0 ? (
            <EmptyState
              title="No seated tables"
              description="Open a table from the floor plan or scan a QR."
            />
          ) : (
            filteredTables.map((table) => {
              const tableBill = initialBills.find(
                (candidate) => candidate.tableSessionId === table.session?.id,
              );
              return (
                <button
                  key={table.id}
                  type="button"
                  onClick={() => setSelectedTable(table)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2.5 text-left transition-colors',
                    selectedTable?.id === table.id
                      ? 'border-brand bg-brand-soft/70'
                      : 'border-line bg-surface-raised hover:border-line-strong',
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold">Table {table.number}</p>
                    <p className="truncate text-[11px] text-muted">
                      {elapsedLabel(table.session!.openedAt)} · {plural(table.session!.orderCount, 'order')}
                      {tableBill ? ` · ${tableBill.number}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tabular text-[12px] font-semibold">
                      {formatTHB(table.session!.outstandingTotal)}
                    </p>
                    {tableBill ? (
                      <StatusBadge status={tableBill.status} />
                    ) : (
                      <span className="inline-flex rounded-full bg-paper-deep px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted">
                        Unbilled
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <section className="min-w-0">
        {!selectedTable ? (
          <EmptyState
            title="Select a table"
            description="Bills are created from the orders on a live table session."
            icon={<ReceiptText className="h-7 w-7" />}
          />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-line bg-surface-raised p-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-[18px] font-semibold tracking-tight">Table {selectedTable.number}</h2>
                  <StatusBadge status={selectedTable.status} />
                </div>
                <p className="mt-1 text-[12px] text-muted">
                  {selectedTable.zone?.name ?? 'Unzoned'} · seated{' '}
                  {elapsedLabel(selectedTable.session!.openedAt)} ago · <Users className="inline h-3 w-3" />{' '}
                  {selectedTable.session!.guestCount || '—'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canCreateOrder ? (
                  <Button variant="secondary" size="sm" onClick={() => setAddOpen(true)}>
                    <Plus className="h-3.5 w-3.5" /> Add items
                  </Button>
                ) : null}
                {!bill && canCreateBill ? (
                  <Button size="sm" onClick={createBill} loading={busy}>
                    <ReceiptText className="h-3.5 w-3.5" /> Create bill
                  </Button>
                ) : null}
                {bill ? (
                  <Button variant="secondary" size="sm" onClick={printReceipt}>
                    <Printer className="h-3.5 w-3.5" /> Print receipt
                  </Button>
                ) : null}
                {canCloseTable && selectedTable.status === 'PAYMENT_PENDING' ? (
                  <Button variant="primary" size="sm" onClick={closeSession} loading={busy}>
                    <Check className="h-3.5 w-3.5" /> Close table
                  </Button>
                ) : null}
              </div>
            </div>

            {!bill ? (
              <div className="rounded-lg border border-dashed border-line-strong bg-surface/60 p-6">
                <p className="text-[14px] font-medium">No bill yet</p>
                <p className="mt-1 text-[12px] text-muted">
                  {plural(selectedTable.session!.orderCount, 'order')} are unbilled. Creating a bill snapshots
                  every item and the tax/service charge that applied at the time.
                </p>
                <p className="mt-3 text-[20px] font-semibold tabular">
                  {formatTHB(selectedTable.session!.outstandingTotal)}
                </p>
                {sessionOrders.length > 0 ? (
                  <ul className="mt-4 divide-y divide-line rounded-lg border border-line bg-surface">
                    {sessionOrders.map((order) => (
                      <li key={order.id} className="flex items-start justify-between gap-3 px-3 py-2">
                        <div className="min-w-0">
                          <p className="money break-all text-[11.5px] font-medium text-ink">{order.number}</p>
                          <p className="text-[11px] text-muted">
                            {plural(order.itemCount, 'item')} ·{' '}
                            {order.source === 'CUSTOMER_QR' ? 'Guest QR' : 'Staff POS'} ·{' '}
                            {formatDateTime(order.createdAt)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <StatusBadge status={order.status} />
                          <span className="tabular text-[12px] font-semibold">{formatTHB(order.total)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : loadingBill || !bill ? (
              <div className="h-64 animate-pulse rounded-lg bg-paper-deep" />
            ) : (
              <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
                <div className="rounded-lg border border-line bg-surface-raised">
                  <div className="flex items-center justify-between border-b border-line px-4 py-3">
                    <div>
                      <p className="text-[13px] font-semibold">{bill.number}</p>
                      <p className="text-[11px] text-muted">
                        {plural(bill.items.length, 'line')} · {plural(bill.orders?.length ?? 0, 'order')}
                      </p>
                    </div>
                    <StatusBadge status={bill.status} />
                  </div>
                  <div className="max-h-[320px] overflow-y-auto scrollbar-thin">
                    <table className="w-full text-[12px]">
                      <tbody className="divide-y divide-line/70">
                        {bill.items.map((item) => (
                          <tr key={item.id}>
                            <td className="px-4 py-2">
                              <span className="font-medium">
                                {item.quantity} × {item.name}
                              </span>
                              {item.variantName ? (
                                <span className="text-muted"> · {item.variantName}</span>
                              ) : null}
                              <p className="text-[11px] text-muted">{formatTHB(item.unitPrice)} each</p>
                            </td>
                            <td className="px-4 py-2 text-right tabular">{formatTHB(item.lineTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <dl className="space-y-1 border-t border-line px-4 py-3 text-[12px]">
                    <div className="flex justify-between">
                      <dt className="text-muted">Subtotal</dt>
                      <dd className="tabular">{formatTHB(bill.subtotal)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted">Discount</dt>
                      <dd className="tabular">−{formatTHB(bill.discountTotal)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted">Service charge</dt>
                      <dd className="tabular">{formatTHB(bill.serviceCharge)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted">
                        VAT {bill.taxRate}% {bill.taxInclusive ? '(incl.)' : '(excl.)'}
                      </dt>
                      <dd className="tabular">{formatTHB(bill.taxTotal)}</dd>
                    </div>
                    <div className="flex justify-between border-t border-line pt-2 text-[15px] font-semibold">
                      <dt>Total</dt>
                      <dd className="tabular">{formatTHB(bill.total)}</dd>
                    </div>
                    <div className="flex justify-between text-[12px]">
                      <dt className="text-muted">Paid</dt>
                      <dd className="tabular text-success">{formatTHB(bill.paidTotal)}</dd>
                    </div>
                    <div className="flex justify-between text-[13px] font-semibold">
                      <dt>Balance due</dt>
                      <dd className="tabular text-brand">{formatTHB(bill.due)}</dd>
                    </div>
                  </dl>
                </div>

                <div className="space-y-3">
                  <div className="rounded-lg border border-line bg-surface-raised p-4">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">Settle</p>
                    <p className="mt-1 text-[22px] font-semibold tabular">{formatTHB(bill.availableToPay)}</p>
                    <p className="text-[11px] text-muted">Available to pay now</p>
                    <div className="mt-3 grid gap-2">
                      {canConfirm ? (
                        <Button
                          onClick={() => openPayment()}
                          disabled={Number(bill.availableToPay) <= 0}
                          className="w-full"
                        >
                          <CreditCard className="h-4 w-4" /> Take payment
                        </Button>
                      ) : null}
                      {canSplit ? (
                        <Button
                          variant="secondary"
                          className="w-full"
                          onClick={() => {
                            setParts('2');
                            setSplitOpen(true);
                          }}
                          disabled={bill.splits.length > 0 || bill.paidTotal !== '0.00'}
                        >
                          <Split className="h-4 w-4" /> Split equally
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {bill.splits.length > 0 ? (
                    <div className="rounded-lg border border-line bg-surface-raised p-4">
                      <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">
                        Shares
                      </p>
                      <ul className="mt-2 divide-y divide-line/70">
                        {bill.splits.map((split) => (
                          <li
                            key={split.id}
                            className="flex items-center justify-between gap-3 py-1.5 text-[12px]"
                          >
                            <div>
                              <p className="text-ink">{split.label}</p>
                              <p className="text-[10px] text-muted">{split.status.toLowerCase()}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="tabular font-medium">{formatTHB(split.amount)}</span>
                              {split.status === 'PAID' ? (
                                <StatusBadge status="PAID" />
                              ) : (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => openPayment({ id: split.id, amount: split.amount })}
                                >
                                  Take payment
                                </Button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="rounded-lg border border-line bg-surface-raised p-4">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">
                      Payments
                    </p>
                    {bill.payments.length === 0 ? (
                      <p className="mt-2 text-[12px] text-muted">Nothing taken yet.</p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {bill.payments.map((payment) => (
                          <li key={payment.id} className="rounded-md border border-line px-3 py-2">
                            <div className="flex items-center justify-between text-[12px]">
                              <span className="font-medium">{payment.method}</span>
                              <span className="tabular">{formatTHB(payment.amount)}</span>
                            </div>
                            <div className="mt-0.5 flex items-center justify-between text-[11px] text-muted">
                              <span>{payment.reference}</span>
                              <StatusBadge status={payment.status} />
                            </div>
                            {canRefund && payment.status === 'PAID' ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setRefundPaymentId(payment.id);
                                  setRefundAmount(payment.amount);
                                  setRefundOpen(true);
                                }}
                                className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-danger hover:underline"
                              >
                                <Undo2 className="h-3 w-3" /> Record refund
                              </button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {bill.paidTotal === bill.total ? (
                    <p className="rounded-md bg-success-soft px-3 py-2 text-[12px] text-success">
                      Bill settled. Close the table once guests leave.
                    </p>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <Dialog open={splitOpen} onOpenChange={setSplitOpen}>
        <DialogContent
          title="Split the bill equally"
          description="Every share is rounded so the parts add up exactly to the bill total."
        >
          <div className="space-y-2">
            <Label htmlFor="parts">Number of shares</Label>
            <Input
              id="parts"
              type="number"
              min={2}
              max={50}
              value={parts}
              onChange={(event) => setParts(event.target.value)}
            />
            {bill ? (
              <p className="text-[12px] text-muted">
                {formatTHB(bill.total)} ÷ {Number(parts) || 0} — remainder distributed one satang at a time.
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSplitOpen(false)}>
              Cancel
            </Button>
            <Button onClick={splitBill} loading={busy}>
              Create shares
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent
          title={paymentSplitId ? 'Take payment for a share' : 'Take payment'}
          description="A payment is only marked paid after this confirmation step. A PromptPay QR requests money; it does not prove it arrived."
        >
          <div className="space-y-4">
            {paymentSplitId ? (
              <p className="border border-line bg-paper-deep/50 px-2.5 py-1.5 text-[11px] text-ink-soft">
                This payment settles one share of the split; the others stay open until they are paid.
              </p>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="method">Method</Label>
              <Select
                id="method"
                value={method}
                onChange={(event) => setMethod(event.target.value as 'CASH' | 'PROMPTPAY' | 'CARD')}
              >
                <option value="CASH">Cash</option>
                <option value="PROMPTPAY">PromptPay</option>
                <option value="CARD">Card terminal</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                disabled={Boolean(paymentId)}
              />
              {bill ? <p className="text-[11px] text-muted">Balance due {formatTHB(bill.due)}</p> : null}
            </div>

            {promptPay ? (
              <div className="flex flex-col items-center gap-2 rounded-md border border-line bg-paper/60 p-3">
                <img src={promptPay.dataUrl} alt="PromptPay QR" className="h-44 w-44 rounded bg-white p-1" />
                {promptPay.accountName ? (
                  <p className="text-[11px] font-medium text-ink">{promptPay.accountName}</p>
                ) : null}
                {promptPay.promptPayTarget ? (
                  <p className="money text-[10px] text-muted">
                    {formatPromptPayTarget(promptPay.promptPayTarget)}
                  </p>
                ) : null}
                <p className="text-[11px] text-muted">
                  Ask the guest to scan, then confirm once you see the transfer. In the demo, “Simulate
                  provider paid” sends a signed webhook as if the bank had confirmed it.
                </p>
                <code className="max-w-full truncate text-[10px] text-muted">{promptPay.payload}</code>
              </div>
            ) : null}

            <div className="rounded-md bg-paper-deep/70 px-3 py-2 text-[11px] text-muted">
              Cash received is recorded against the payment. Change is not stored as revenue.
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPaymentOpen(false)}>
              Cancel
            </Button>
            {!paymentId ? (
              <Button onClick={startPayment} loading={busy}>
                {method === 'PROMPTPAY' ? <QrCode className="h-4 w-4" /> : <Banknote className="h-4 w-4" />}
                {method === 'PROMPTPAY' ? 'Generate QR' : 'Create payment'}
              </Button>
            ) : (
              <>
                {promptPay ? (
                  <Button variant="secondary" onClick={simulateProvider} loading={busy}>
                    <Wand2 className="h-4 w-4" /> Simulate provider paid
                  </Button>
                ) : null}
                <Button onClick={confirmPayment} loading={busy}>
                  <Check className="h-4 w-4" /> Confirm received
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent
          title="Add items"
          description="Staff orders go through the same server pricing and station routing as guest orders."
          className="max-w-2xl"
        >
          <div className="space-y-3">
            <Input
              value={addSearch}
              onChange={(event) => setAddSearch(event.target.value)}
              placeholder="Search the menu"
              aria-label="Search menu"
            />
            <div className="max-h-[340px] space-y-1 overflow-y-auto scrollbar-thin">
              {menuResults.map((item) => {
                const quantity = addLines[item.id] ?? 0;
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-medium">{item.name}</p>
                      <p className="text-[11px] text-muted">
                        {formatTHB(item.basePrice)} · {item.availableInBranch ? 'available' : 'sold out'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="icon"
                        variant="outline"
                        aria-label={`Remove one ${item.name}`}
                        onClick={() =>
                          setAddLines((current) => ({
                            ...current,
                            [item.id]: Math.max(0, (current[item.id] ?? 0) - 1),
                          }))
                        }
                      >
                        −
                      </Button>
                      <span className="w-6 text-center text-[12px] font-semibold tabular">{quantity}</span>
                      <Button
                        size="icon"
                        variant="outline"
                        aria-label={`Add one ${item.name}`}
                        disabled={!item.availableInBranch}
                        onClick={() =>
                          setAddLines((current) => ({ ...current, [item.id]: (current[item.id] ?? 0) + 1 }))
                        }
                      >
                        +
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-muted">
              Items with required modifiers are better added from the guest menu, where the chooser is
              enforced.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitAddOrder} loading={busy}>
              Send to kitchen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent
          title="Record a refund"
          description="TableTap records the refund and the audit trail. It does not move money — complete the transfer in your bank or PSP."
        >
          <div className="space-y-2">
            <Label htmlFor="refund-amount">Amount</Label>
            <Input
              id="refund-amount"
              inputMode="decimal"
              value={refundAmount}
              onChange={(event) => setRefundAmount(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRefundOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={submitRefund} loading={busy}>
              Record refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {bill ? (
        <p className="text-[11px] text-muted lg:col-span-2">
          Bill {bill.number} opened {formatDateTime(bill.createdAt)} · totals are the sum of the linked order
          snapshots.
        </p>
      ) : null}
    </div>
  );
}

function formatPromptPayTarget(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 13) {
    return `${digits[0]}-${digits.slice(1, 5)}-${digits.slice(5, 10)}-${digits.slice(10, 12)}-${digits[12]}`;
  }
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return value;
}
