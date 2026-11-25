'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Printer } from 'lucide-react';
import { clientApi, errorMessage } from '@/lib/api';
import { formatTHB } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface ReceiptPayload {
  number: string;
  issuedAt: string;
  payload: {
    restaurant: { name: string; address: string | null };
    branch: { name: string; address: string | null; phone: string | null; vatRate: string };
    billNumber: string;
    table: string;
    items: Array<{ name: string; quantity: number; unitPrice: string; lineTotal: string }>;
    subtotal: string;
    discountTotal: string;
    serviceCharge: string;
    taxTotal: string;
    total: string;
    payments: Array<{ method: string; amount: string; reference: string }>;
    notice: string;
  };
}

export function BillReceiptButton({ billId, disabled }: { billId: string; disabled?: boolean }) {
  const [busy, setBusy] = React.useState(false);

  async function print() {
    setBusy(true);
    try {
      const receipt = await clientApi<ReceiptPayload>(`/bills/${billId}/receipt`);
      const p = receipt.payload;
      const win = window.open('', '_blank', 'width=420,height=700');
      if (!win) return;
      win.document.write(`<!doctype html><html><head><title>${receipt.number}</title>
        <style>
          body{font-family:ui-monospace,monospace;padding:24px;color:#111;font-size:12px}
          h1{font-size:15px;margin:0 0 2px;text-align:center}
          .muted{color:#666}.center{text-align:center}
          table{width:100%;border-collapse:collapse;margin-top:10px}
          td{padding:2px 0;vertical-align:top}.right{text-align:right}
          hr{border:none;border-top:1px dashed #bbb;margin:10px 0}
          .total{font-size:14px;font-weight:700}
          .notice{font-size:9px;color:#777;margin-top:14px}
        </style></head><body>
        <h1>${p.restaurant.name}</h1>
        <p class="center muted">${p.branch.name}${p.branch.address ? ` · ${p.branch.address}` : ''}</p>
        <p class="center muted">${p.branch.phone ?? ''}</p>
        <hr/>
        <p>Receipt ${receipt.number}</p>
        <p>Bill ${p.billNumber} · Table ${p.table}</p>
        <p>${new Date(receipt.issuedAt).toLocaleString('th-TH')}</p>
        <hr/>
        <table>${p.items.map((item) => `<tr><td>${item.quantity} × ${item.name}</td><td class="right">${formatTHB(item.lineTotal)}</td></tr>`).join('')}</table>
        <hr/>
        <table>
          <tr><td>Subtotal</td><td class="right">${formatTHB(p.subtotal)}</td></tr>
          <tr><td>Discount</td><td class="right">-${formatTHB(p.discountTotal)}</td></tr>
          <tr><td>Service charge</td><td class="right">${formatTHB(p.serviceCharge)}</td></tr>
          <tr><td>VAT (${p.branch.vatRate}%)</td><td class="right">${formatTHB(p.taxTotal)}</td></tr>
          <tr class="total"><td>Total</td><td class="right">${formatTHB(p.total)}</td></tr>
        </table>
        <hr/>
        ${p.payments.map((payment) => `<p>${payment.method} · ${payment.reference} · ${formatTHB(payment.amount)}</p>`).join('')}
        <p class="notice">${p.notice}</p>
        <script>window.onload=()=>setTimeout(()=>window.print(),300)</script>
        </body></html>`);
      win.document.close();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="secondary" size="sm" onClick={print} loading={busy} disabled={disabled}>
      <Printer className="h-3.5 w-3.5" /> Receipt
    </Button>
  );
}
