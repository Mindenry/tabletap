import type { ClientRequestOptions } from '../api';
import {
  DEMO_TABLE_TOKEN,
  demoBranchData,
  demoBranchId,
  demoLanding,
  demoMe,
  demoPayment,
  resolveFixture,
} from './fixtures';

type JsonObject = Record<string, unknown>;

interface DemoStore {
  version: 3;
  role: string;
  branchId: string;
  token: string;
  guestSessionId: string;
  guestBillId: string | null;
  guestPaymentId: string | null;
  table: JsonObject;
  restaurant: JsonObject;
  orders: JsonObject[];
  tickets: JsonObject[];
  bills: JsonObject[];
  requests: JsonObject[];
  paidAt: number | null;
  seq: number;
}

const STORAGE_KEY = 'tabletap-demo-v2';
const LEGACY_KEY = 'tabletap-demo-v1';
let memory: DemoStore | null = null;

class DemoError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'DemoError';
    this.status = status;
    this.code = code;
  }
}

function objects(value: unknown): JsonObject[] {
  return Array.isArray(value) ? (value as JsonObject[]) : [];
}

function object(value: unknown): JsonObject {
  return (value ?? {}) as JsonObject;
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function numeric(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nowIso(): string {
  return new Date().toISOString();
}

function money(value: number): string {
  return value.toFixed(2);
}

function mergeDetail(row: JsonObject, path: string): JsonObject {
  const detail = resolveFixture(path);
  return detail && typeof detail === 'object' && !Array.isArray(detail)
    ? { ...row, ...(detail as JsonObject) }
    : row;
}

function seedStore(): DemoStore {
  const landing = demoLanding(DEMO_TABLE_TOKEN);
  const session = object(landing.session);
  const guestSessionId = text(session.id);
  const branchId = demoBranchId();
  const branch = demoBranchData(branchId);

  const orders = objects(branch.orders).map((row): JsonObject => mergeDetail(row, `/orders/${text(row.id)}`));
  const tickets = objects(branch.tickets);
  const bills = objects(branch.bills).map((row): JsonObject => {
    const merged = mergeDetail(row, `/bills/${text(row.id)}`);
    return {
      ...merged,
      splits: objects(merged.splits),
      payments: objects(merged.payments),
    };
  });

  const guestBill =
    bills.find((bill) => text(bill.tableSessionId) === guestSessionId) ??
    bills.find((bill) => text(bill.status) === 'PARTIALLY_PAID') ??
    null;

  return {
    version: 3,
    role: 'owner',
    branchId,
    token: DEMO_TABLE_TOKEN,
    guestSessionId,
    guestBillId: guestBill ? text(guestBill.id) : null,
    guestPaymentId: null,
    table: {
      id: text(object(landing.table).id),
      number: text(object(landing.table).number),
      name: text(object(landing.table).name) || null,
    },
    restaurant: {
      name: text(object(landing.restaurant).name, 'Spice Garden'),
      branch: text(object(landing.restaurant).branch, 'Sathorn'),
    },
    orders,
    tickets,
    bills,
    requests: objects(branch.requests),
    paidAt: null,
    seq: 0,
  };
}

function loadStore(): DemoStore {
  if (typeof window === 'undefined') return memory ?? seedStore();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoStore;
      if (parsed?.version === 3) {
        memory = parsed;
        return parsed;
      }
    }
  } catch {
    // Storage can be blocked; fall back to memory.
  }
  const seeded = seedStore();
  saveStore(seeded);
  return seeded;
}

function saveStore(store: DemoStore): void {
  memory = store;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Keep the in-memory copy.
  }
}

function findBill(store: DemoStore, id: string): JsonObject | undefined {
  return store.bills.find((bill) => text(bill.id) === id);
}

function findOrder(store: DemoStore, id: string): JsonObject | undefined {
  return store.orders.find((order) => text(order.id) === id);
}

function findTicket(store: DemoStore, id: string): JsonObject | undefined {
  return store.tickets.find((ticket) => text(ticket.id) === id);
}

function findRequest(store: DemoStore, id: string): JsonObject | undefined {
  return store.requests.find((request) => text(request.id) === id);
}

function orderForBill(bill: JsonObject): JsonObject[] {
  return objects(bill.orders);
}

function billDetail(bill: JsonObject): JsonObject {
  const payments = objects(bill.payments);
  const total = numeric(bill.total);
  const paidTotal = numeric(bill.paidTotal);
  const pendingTotal = payments
    .filter((payment) => ['PENDING', 'AWAITING_CONFIRMATION'].includes(text(payment.status)))
    .reduce((sum, payment) => sum + numeric(payment.amount), 0);
  return {
    ...bill,
    currency: text(bill.currency, 'THB'),
    subtotal: text(bill.subtotal, money(total)),
    discountTotal: text(bill.discountTotal, '0.00'),
    serviceCharge: text(bill.serviceCharge, '0.00'),
    taxTotal: text(bill.taxTotal, '0.00'),
    taxRate: text(bill.taxRate, '7.00'),
    taxInclusive: bill.taxInclusive !== false,
    total: money(total),
    paidTotal: money(paidTotal),
    pendingTotal: money(pendingTotal),
    due: money(Math.max(0, total - paidTotal)),
    availableToPay: money(Math.max(0, total - paidTotal - pendingTotal)),
    items: objects(bill.items),
    orders: orderForBill(bill),
    splits: objects(bill.splits),
    payments,
    receipt: bill.receipt ?? null,
    createdAt: text(bill.createdAt, nowIso()),
    paidAt: bill.paidAt ?? null,
  };
}

function settlePayment(store: DemoStore, paymentId: string, amountPaid?: number): JsonObject | null {
  for (const bill of store.bills) {
    const payments = objects(bill.payments);
    const payment = payments.find((entry) => text(entry.id) === paymentId);
    if (!payment) continue;
    if (text(payment.status) === 'PAID') return bill;
    const amount = amountPaid ?? numeric(payment.amount);
    payment.status = 'PAID';
    payment.amountPaid = money(amount);
    payment.confirmedAt = nowIso();
    bill.payments = payments;
    bill.paidTotal = money(numeric(bill.paidTotal) + amount);
    bill.due = money(Math.max(0, numeric(bill.total) - numeric(bill.paidTotal)));
    bill.status = numeric(bill.due) <= 0 ? 'PAID' : 'PARTIALLY_PAID';
    if (numeric(bill.due) <= 0) bill.paidAt = nowIso();

    const splitId = text(payment.splitId);
    if (splitId) {
      bill.splits = objects(bill.splits).map((split) =>
        text(split.id) === splitId ? { ...split, status: 'PAID', paidAt: nowIso() } : split,
      );
    }

    if (text(bill.id) === store.guestBillId) {
      store.paidAt = null;
      store.guestPaymentId = null;
    }
    return bill;
  }
  return null;
}

function settleGuestPayment(store: DemoStore): void {
  if (store.guestPaymentId) settlePayment(store, store.guestPaymentId);
  store.paidAt = null;
}

function advance(store: DemoStore): void {
  const now = Date.now();
  for (const order of store.orders) {
    if (order.auto === false || text(order.source) !== 'GUEST') continue;
    const age = now - new Date(text(order.createdAt)).getTime();
    const status = age < 4000 ? 'PENDING' : age < 8000 ? 'PREPARING' : age < 12000 ? 'READY' : 'SERVED';
    order.status = status;
    for (const item of objects(order.items)) item.status = status;
    const ticket = store.tickets.find((entry) => text(object(entry.order).id) === text(order.id));
    if (ticket && ticket.auto !== false) {
      ticket.status = status === 'PREPARING' ? 'PREPARING' : status;
      for (const item of objects(ticket.items)) item.status = status;
    }
  }
  for (const request of store.requests) {
    if (request.auto === false) continue;
    const age = now - new Date(text(request.createdAt)).getTime();
    if (text(request.status) === 'OPEN' && age > 12000) {
      request.status = 'ACKNOWLEDGED';
      request.acknowledgedAt = nowIso();
    }
    if (text(request.status) === 'ACKNOWLEDGED' && age > 24000) {
      request.status = 'RESOLVED';
      request.resolvedAt = nowIso();
    }
  }
  if (store.paidAt && now >= store.paidAt && store.guestPaymentId) {
    settleGuestPayment(store);
    store.paidAt = null;
  }
}

function toGuestOrder(store: DemoStore, order: JsonObject): JsonObject {
  const ticket = store.tickets.find((entry) => text(object(entry.order).id) === text(order.id));
  const source = objects(order.items).length > 0 ? objects(order.items) : objects(ticket?.items);
  return {
    id: text(order.id),
    number: text(order.number),
    status: text(order.status, 'PENDING'),
    total: text(order.total, '0.00'),
    createdAt: text(order.createdAt, nowIso()),
    items: source.map((item, index) => ({
      id: text(item.id, `demo-item-${index}`),
      name: text(item.name, 'Dish'),
      quantity: Math.max(1, numeric(item.quantity, 1)),
      status: text(item.status, text(order.status, 'PENDING')),
      note: typeof item.note === 'string' ? item.note : null,
      modifiers: objects(item.modifiers).map((modifier) => ({ name: text(modifier.name) })),
    })),
  };
}

function guestState(store: DemoStore) {
  advance(store);
  saveStore(store);
  const bill = store.guestBillId ? findBill(store, store.guestBillId) : undefined;
  const orders = store.orders.filter((order) => text(order.tableSessionId) === store.guestSessionId);
  const requests = store.requests.filter((request) => text(request.tableSessionId) === store.guestSessionId);
  const orderTotal = orders.reduce((sum, order) => sum + numeric(order.total), 0);
  return {
    status: bill && text(bill.status) === 'PAID' ? 'PAYMENT_PENDING' : 'OPEN',
    table: store.table,
    restaurant: store.restaurant,
    orders: orders.map((order) => toGuestOrder(store, order)),
    bill: bill
      ? {
          id: text(bill.id),
          number: text(bill.number),
          status: text(bill.status),
          total: text(bill.total, '0.00'),
          due: text(bill.due, '0.00'),
        }
      : null,
    orderTotal: money(orderTotal),
    requests: requests.map((request) => ({
      id: text(request.id),
      type: text(request.type),
      status: text(request.status),
      createdAt: text(request.createdAt),
    })),
  };
}

function menuItems(): JsonObject[] {
  return objects(demoLanding().menu).flatMap((category) => objects(category.items));
}

function unitPrice(item: JsonObject, line: JsonObject): number {
  let price = numeric(item.basePrice);
  const variantId = text(line.variantId);
  if (variantId) {
    const variant = objects(item.variants).find((entry) => text(entry.id) === variantId);
    price += numeric(variant?.priceDelta);
  }
  const optionIds = Array.isArray(line.modifierOptionIds) ? line.modifierOptionIds : [];
  for (const group of objects(item.modifierGroups)) {
    for (const option of objects(group.options)) {
      if (optionIds.includes(text(option.id))) price += numeric(option.priceDelta);
    }
  }
  return price;
}

function createGuestOrder(store: DemoStore, body: unknown): JsonObject {
  const input = object(body);
  const lines = objects(input.items);
  store.seq += 1;
  const items: JsonObject[] = [];
  let total = 0;

  for (const line of lines) {
    const item = menuItems().find((entry) => text(entry.id) === text(line.menuItemId));
    if (!item) continue;
    const quantity = Math.max(1, numeric(line.quantity, 1));
    total += unitPrice(item, line) * quantity;
    const variant = objects(item.variants).find((entry) => text(entry.id) === text(line.variantId));
    const modifiers: JsonObject[] = [];
    for (const group of objects(item.modifierGroups)) {
      for (const option of objects(group.options)) {
        const selected =
          Array.isArray(line.modifierOptionIds) && line.modifierOptionIds.includes(text(option.id));
        if (selected) modifiers.push({ groupName: text(group.name), name: text(option.name) });
      }
    }
    if (variant) modifiers.unshift({ groupName: 'Size', name: text(variant.name) });
    items.push({
      id: `demo-line-${store.seq}-${items.length}`,
      name: text(item.name, 'Dish'),
      variantName: variant ? text(variant.name) : null,
      quantity,
      status: 'PENDING',
      note: typeof line.note === 'string' ? line.note : null,
      modifiers,
    });
  }

  if (items.length === 0) {
    throw new DemoError(400, 'EMPTY_ORDER', 'This demo could not match the selected dishes.');
  }

  const createdAt = nowIso();
  const number = `ORD-DEMO-${String(store.seq).padStart(4, '0')}`;
  const order: JsonObject = {
    id: `demo-order-${Date.now()}`,
    number,
    status: 'PENDING',
    source: 'GUEST',
    table: store.table,
    tableSessionId: store.guestSessionId,
    total: money(total),
    itemCount: items.length,
    bill: null,
    createdAt,
    acceptedAt: null,
    readyAt: null,
    servedAt: null,
    cancelledAt: null,
    items,
    auto: true,
  };

  const stations = objects(demoBranchData(store.branchId).stations);
  const station = stations[0] ?? { id: 'demo-station', name: 'Hot kitchen', code: 'HOT_KITCHEN' };
  const ticket: JsonObject = {
    id: `demo-ticket-${Date.now()}`,
    number: `KOT-DEMO-${String(store.seq).padStart(4, '0')}`,
    status: 'PENDING',
    priority: 0,
    station: {
      id: text(station.id),
      name: text(station.name, 'Hot kitchen'),
      code: text(station.code, 'HOT_KITCHEN'),
    },
    order: {
      id: text(order.id),
      number,
      status: 'PENDING',
      note: null,
      createdAt,
      table: store.table,
      tableSessionId: store.guestSessionId,
    },
    createdAt,
    acceptedAt: null,
    readyAt: null,
    items: items.map((item) => ({
      ...item,
      id: `demo-ticket-item-${Math.random().toString(36).slice(2, 8)}`,
    })),
    auto: true,
  };

  store.orders = [...store.orders, order];
  store.tickets = [...store.tickets, ticket];
  return { id: text(order.id), number, total: money(total) };
}

function createGuestRequest(store: DemoStore, type: string): JsonObject {
  const createdAt = nowIso();
  const request: JsonObject = {
    id: `demo-request-${Date.now()}`,
    type: type || 'CALL_WAITER',
    status: 'OPEN',
    note: null,
    table: store.table,
    tableSessionId: store.guestSessionId,
    sessionOpenedAt: createdAt,
    assignedTo: null,
    createdAt,
    acknowledgedAt: null,
    resolvedAt: null,
    resolutionNote: null,
    auto: true,
  };
  store.requests = [...store.requests, request];
  return { id: text(request.id), type: text(request.type), status: 'OPEN', createdAt };
}

function startGuestPayment(store: DemoStore): JsonObject {
  const bill = store.guestBillId ? findBill(store, store.guestBillId) : undefined;
  if (!bill) throw new DemoError(404, 'BILL_NOT_ISSUED', 'This table has no bill in the demo.');
  const due = Math.max(0, numeric(bill.total) - numeric(bill.paidTotal));
  if (due <= 0) throw new DemoError(409, 'NOTHING_DUE', 'This bill is already paid.');

  const payments = objects(bill.payments);
  let payment = payments.find(
    (entry) => text(entry.status) === 'AWAITING_CONFIRMATION' && numeric(entry.amount) === due,
  );
  if (!payment) {
    payment = {
      id: `demo-payment-${Date.now()}`,
      reference: `PAY-DEMO-${String(store.seq + 1).padStart(4, '0')}`,
      method: 'PROMPTPAY',
      status: 'AWAITING_CONFIRMATION',
      amount: money(due),
      amountPaid: '0.00',
      promptPayPayload: demoPayment.qrDataUrl,
      expiresAt: null,
      confirmedAt: null,
    };
    bill.payments = [...payments, payment];
  }
  store.guestPaymentId = text(payment.id);
  store.paidAt = Date.now() + 4000;
  return {
    paymentId: text(payment.id),
    amount: money(due),
    qrDataUrl: demoPayment.qrDataUrl,
    reference: text(payment.reference),
    accountName: demoPayment.accountName,
    promptPayTarget: demoPayment.promptPayTarget,
  };
}

function staffGet(path: string, store: DemoStore): unknown {
  const [pathname = '', search = ''] = path.split('?');
  const params = new URLSearchParams(search);
  const branchId = params.get('branchId');
  if (branchId && branchId !== store.branchId) return undefined;
  const segments = pathname.split('/').filter(Boolean);

  if (pathname === '/bills') return store.bills;
  if (segments[0] === 'bills' && segments.length >= 3 && segments[2] === 'receipt') {
    return resolveFixture(path);
  }
  if (segments[0] === 'bills' && segments.length === 2) {
    const bill = findBill(store, segments[1] ?? '');
    return bill ? billDetail(bill) : undefined;
  }

  if (pathname === '/orders') {
    let rows = store.orders;
    const sessionId = params.get('tableSessionId');
    if (sessionId) rows = rows.filter((order) => text(order.tableSessionId) === sessionId);
    const status = params.get('status');
    if (status) rows = rows.filter((order) => text(order.status) === status);
    const limit = Number(params.get('limit') ?? '0');
    return limit > 0 ? rows.slice(0, limit) : rows;
  }
  if (segments[0] === 'orders' && segments.length === 2) {
    return findOrder(store, segments[1] ?? '');
  }

  if (pathname === '/kitchen/tickets') return store.tickets;

  if (pathname === '/table-requests') {
    let rows = store.requests;
    const status = params.get('status');
    if (status && status !== 'ALL') {
      rows =
        status === 'ACTIVE'
          ? rows.filter((request) => text(request.status) !== 'RESOLVED')
          : rows.filter((request) => text(request.status) === status);
    }
    const limit = Number(params.get('limit') ?? '0');
    return limit > 0 ? rows.slice(0, limit) : rows;
  }

  return undefined;
}

function createBill(store: DemoStore, tableSessionId: string): JsonObject {
  const existing = store.bills.find(
    (bill) =>
      text(bill.tableSessionId) === tableSessionId && ['OPEN', 'PARTIALLY_PAID'].includes(text(bill.status)),
  );
  if (existing) return billDetail(existing);

  const orders = store.orders.filter((order) => text(order.tableSessionId) === tableSessionId);
  const total = orders.reduce((sum, order) => sum + numeric(order.total), 0);
  const table = object(orders[0]?.table);
  const createdAt = nowIso();
  const sequence = store.bills.length + 1;
  const bill: JsonObject = {
    id: `demo-bill-${Date.now()}`,
    number: `BILL-DEMO-${String(sequence).padStart(4, '0')}`,
    status: 'OPEN',
    tableSessionId,
    table,
    total: money(total),
    paidTotal: '0.00',
    due: money(total),
    items: orders.flatMap((order) => objects(order.items)),
    orders: orders.map((order) => ({
      id: text(order.id),
      number: text(order.number),
      status: text(order.status),
    })),
    payments: [],
    splits: [],
    taxInclusive: true,
    createdAt,
    paidAt: null,
  };
  store.bills = [...store.bills, bill];
  return billDetail(bill);
}

function splitBill(store: DemoStore, billId: string, body: unknown): JsonObject {
  const bill = findBill(store, billId);
  if (!bill) throw new DemoError(404, 'BILL_NOT_FOUND', 'This bill is not in the demo.');
  const parts = Math.max(2, Math.min(20, numeric(object(body).parts, 2)));
  const total = numeric(bill.total);
  const base = Math.floor((total / parts) * 100) / 100;
  const remainder = Math.round((total - base * parts) * 100) / 100;
  bill.splits = Array.from({ length: parts }, (_, index) => ({
    id: `demo-split-${Date.now()}-${index}`,
    label: `Guest ${index + 1}`,
    amount: money(index === parts - 1 ? base + remainder : base),
    status: 'OPEN',
    paidAt: null,
  }));
  return billDetail(bill);
}

function createPayment(store: DemoStore, body: unknown): JsonObject {
  const input = object(body);
  const billId = text(input.billId);
  const bill = findBill(store, billId);
  if (!bill) throw new DemoError(404, 'BILL_NOT_FOUND', 'This bill is not in the demo.');
  const amount = numeric(input.amount, Math.max(0, numeric(bill.total) - numeric(bill.paidTotal)));
  const method = text(input.method, 'CASH');
  const splitId = text(input.splitId);
  const payment: JsonObject = {
    id: `demo-payment-${Date.now()}`,
    reference: `PAY-DEMO-${String(store.bills.length + store.orders.length + 1).padStart(4, '0')}`,
    method,
    status: method === 'PROMPTPAY' ? 'AWAITING_CONFIRMATION' : 'PENDING',
    amount: money(amount),
    amountPaid: '0.00',
    promptPayPayload: null,
    expiresAt: null,
    confirmedAt: null,
    ...(splitId ? { splitId } : {}),
  };
  bill.payments = [...objects(bill.payments), payment];
  return payment;
}

function attachPromptPay(store: DemoStore, paymentId: string): JsonObject {
  for (const bill of store.bills) {
    const payment = objects(bill.payments).find((entry) => text(entry.id) === paymentId);
    if (!payment) continue;
    payment.promptPayPayload = demoPayment.qrDataUrl;
    payment.status = 'AWAITING_CONFIRMATION';
    return {
      id: text(payment.id),
      promptPayPayload: demoPayment.qrDataUrl,
      qrPngDataUrl: demoPayment.qrDataUrl,
      accountName: demoPayment.accountName,
      promptPayTarget: demoPayment.promptPayTarget,
    };
  }
  throw new DemoError(404, 'PAYMENT_NOT_FOUND', 'This payment is not in the demo.');
}

function kitchenAction(store: DemoStore, ticketId: string, action: string): JsonObject {
  const ticket = findTicket(store, ticketId);
  if (!ticket) throw new DemoError(404, 'TICKET_NOT_FOUND', 'This ticket is not in the demo.');
  const map: Record<string, string> = {
    accept: 'ACCEPTED',
    start: 'PREPARING',
    ready: 'READY',
    served: 'SERVED',
    reject: 'REJECTED',
  };
  const status = map[action] ?? 'PENDING';
  ticket.status = status;
  ticket.auto = false;
  if (status === 'ACCEPTED') ticket.acceptedAt = nowIso();
  if (status === 'READY') ticket.readyAt = nowIso();
  const itemStatus = status === 'ACCEPTED' ? 'PREPARING' : status;
  ticket.items = objects(ticket.items).map((item) => ({ ...item, status: itemStatus }));

  const orderId = text(object(ticket.order).id);
  const order = findOrder(store, orderId);
  if (order) {
    order.status = status === 'ACCEPTED' ? 'PREPARING' : status;
    order.auto = false;
    for (const item of objects(order.items)) item.status = itemStatus;
    if (status === 'READY') order.readyAt = nowIso();
    if (status === 'SERVED') order.servedAt = nowIso();
  }
  return ticket;
}

function kitchenItemReady(store: DemoStore, itemId: string): JsonObject {
  for (const ticket of store.tickets) {
    const items = objects(ticket.items);
    const found = items.find((item) => text(item.id) === itemId);
    if (!found) continue;
    ticket.items = items.map((item) => (text(item.id) === itemId ? { ...item, status: 'READY' } : item));
    if (objects(ticket.items).every((item) => text(item.status) === 'READY')) {
      ticket.status = 'READY';
      ticket.readyAt = nowIso();
      ticket.auto = false;
      const order = findOrder(store, text(object(ticket.order).id));
      if (order) {
        order.status = 'READY';
        order.auto = false;
      }
    }
    return ticket;
  }
  throw new DemoError(404, 'ITEM_NOT_FOUND', 'This item is not in the demo.');
}

function requestAction(store: DemoStore, requestId: string, action: string): JsonObject {
  const request = findRequest(store, requestId);
  if (!request) throw new DemoError(404, 'REQUEST_NOT_FOUND', 'This request is not in the demo.');
  request.auto = false;
  if (action === 'acknowledge') {
    request.status = 'ACKNOWLEDGED';
    request.acknowledgedAt = nowIso();
    request.assignedTo = { id: 'demo-staff', name: 'Demo staff' };
  }
  if (action === 'resolve') {
    request.status = 'RESOLVED';
    request.resolvedAt = nowIso();
  }
  return request;
}

function orderAction(store: DemoStore, orderId: string, action: string): JsonObject {
  const order = findOrder(store, orderId);
  if (!order) throw new DemoError(404, 'ORDER_NOT_FOUND', 'This order is not in the demo.');
  const map: Record<string, string> = {
    accept: 'PREPARING',
    preparing: 'PREPARING',
    ready: 'READY',
    served: 'SERVED',
    cancel: 'CANCELLED',
  };
  const status = map[action] ?? text(order.status, 'PENDING');
  order.status = status;
  order.auto = false;
  const ticket = store.tickets.find((entry) => text(object(entry.order).id) === orderId);
  if (ticket) {
    ticket.status = status === 'PREPARING' ? 'PREPARING' : status;
    ticket.auto = false;
  }
  return order;
}

export function settleDemoPayment(): void {
  const store = loadStore();
  if (!store.guestPaymentId) return;
  settleGuestPayment(store);
  saveStore(store);
}

export async function demoClientApi<T>(path: string, options: ClientRequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const [pathname = ''] = path.split('?');
  const store = loadStore();

  if (method === 'GET') {
    if (pathname === '/public/customer-session') return guestState(store) as T;
    if (pathname === '/public/customer-session/menu') {
      return { menu: objects(demoLanding().menu) } as T;
    }
    const staff = staffGet(path, store);
    return (staff === undefined ? resolveFixture(path) : staff) as T;
  }

  if (pathname.startsWith('/public/qr/') && pathname.endsWith('/session')) {
    saveStore(store);
    return { ok: true } as T;
  }
  if (pathname === '/public/customer-session/orders') {
    const result = createGuestOrder(store, options.body);
    saveStore(store);
    return result as T;
  }
  if (pathname === '/public/customer-session/requests') {
    const result = createGuestRequest(store, text(object(options.body).type));
    saveStore(store);
    return result as T;
  }
  if (pathname === '/public/customer-session/payments/promptpay') {
    const result = startGuestPayment(store);
    saveStore(store);
    return result as T;
  }
  if (pathname === '/auth/login') return demoMe as T;

  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] === 'bills') {
    if (pathname === '/bills') {
      const result = createBill(store, text(object(options.body).tableSessionId));
      saveStore(store);
      return result as T;
    }
    if (segments[2] === 'split') {
      const result = splitBill(store, segments[1] ?? '', options.body);
      saveStore(store);
      return result as T;
    }
    if (segments[2] === 'cancel') {
      const bill = findBill(store, segments[1] ?? '');
      if (bill) bill.status = 'CANCELLED';
      saveStore(store);
      return { ok: true } as T;
    }
  }

  if (segments[0] === 'payments') {
    if (pathname === '/payments') {
      const result = createPayment(store, options.body);
      saveStore(store);
      return result as T;
    }
    if (segments[2] === 'promptpay') {
      const result = attachPromptPay(store, segments[1] ?? '');
      saveStore(store);
      return result as T;
    }
    if (segments[2] === 'confirm' || segments[2] === 'simulate-provider') {
      const reported = object(options.body).amountPaid;
      settlePayment(store, segments[1] ?? '', reported === undefined ? undefined : numeric(reported));
      saveStore(store);
      return { simulated: true, received: true, status: 'confirmed' } as T;
    }
    if (segments[2] === 'refund') {
      for (const bill of store.bills) {
        const payment = objects(bill.payments).find((entry) => text(entry.id) === (segments[1] ?? ''));
        if (payment) payment.status = 'REFUNDED';
      }
      saveStore(store);
      return { ok: true } as T;
    }
  }

  if (segments[0] === 'kitchen') {
    if (segments[1] === 'tickets' && segments[3]) {
      const result = kitchenAction(store, segments[2] ?? '', segments[3]);
      saveStore(store);
      return result as T;
    }
    if (segments[1] === 'items' && segments[3] === 'ready') {
      const result = kitchenItemReady(store, segments[2] ?? '');
      saveStore(store);
      return result as T;
    }
  }

  if (segments[0] === 'table-requests' && segments[2]) {
    const result = requestAction(store, segments[1] ?? '', segments[2]);
    saveStore(store);
    return result as T;
  }

  if (segments[0] === 'orders' && segments[2]) {
    const result = orderAction(store, segments[1] ?? '', segments[2]);
    saveStore(store);
    return result as T;
  }

  if (segments[0] === 'tables') {
    saveStore(store);
    return { ok: true } as T;
  }

  throw new DemoError(
    200,
    'DEMO_NOT_AVAILABLE',
    'Demo: this action is not part of the sandbox. Try the guest menu, POS, kitchen or requests.',
  );
}

export function resetDemo(): void {
  memory = null;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Nothing else to clear.
  }
}
