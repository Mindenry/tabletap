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

interface GuestBill {
  id: string;
  number: string;
  status: string;
  total: string;
  due: string;
}

interface GuestOrderItem {
  id: string;
  name: string;
  quantity: number;
  status: string;
  note: string | null;
  modifiers: Array<{ name: string }>;
}

interface GuestOrder {
  id: string;
  number: string;
  status: string;
  total: string;
  createdAt: string;
  items: GuestOrderItem[];
  simulated?: boolean;
}

interface GuestRequest {
  id: string;
  type: string;
  status: string;
  createdAt: string;
}

interface GuestStore {
  version: 1;
  token: string;
  table: JsonObject;
  restaurant: JsonObject;
  bill: GuestBill | null;
  orders: GuestOrder[];
  requests: GuestRequest[];
  paidAt: number | null;
  seq: number;
}

const STORAGE_KEY = 'tabletap-demo-v1';
let memory: GuestStore | null = null;

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

function toOrder(row: JsonObject): GuestOrder {
  const items = objects(row.items).map((item, index) => ({
    id: text(item.id, `demo-item-${index}`),
    name: text(item.name, 'Dish'),
    quantity: Math.max(1, numeric(item.quantity, 1)),
    status: text(item.status, 'SERVED'),
    note: typeof item.note === 'string' ? item.note : null,
    modifiers: objects(item.modifiers).map((modifier) => ({ name: text(modifier.name) })),
  }));

  return {
    id: text(row.id, `demo-order-${Date.now()}`),
    number: text(row.number, 'ORD-DEMO'),
    status: text(row.status, 'SERVED'),
    total: text(row.total, '0.00'),
    createdAt: text(row.createdAt, new Date().toISOString()),
    items,
  };
}

function seedStore(): GuestStore {
  const landing = demoLanding(DEMO_TABLE_TOKEN);
  const session = object(landing.session);
  const sessionId = text(session.id);
  const branch = demoBranchData(demoBranchId());

  const billRow =
    objects(branch.bills).find((bill) => text(bill.tableSessionId) === sessionId) ??
    objects(branch.bills).find((bill) => text(bill.status) === 'PARTIALLY_PAID');

  const bill: GuestBill | null = billRow
    ? {
        id: text(billRow.id),
        number: text(billRow.number),
        status: text(billRow.status, 'OPEN'),
        total: text(billRow.total, '0.00'),
        due: text(billRow.due, '0.00'),
      }
    : null;

  const orders = objects(branch.orders)
    .filter((order) => text(order.tableSessionId) === sessionId)
    .map(toOrder);

  const requests = objects(branch.requests)
    .filter((request) => text(request.tableSessionId) === sessionId)
    .slice(0, 1)
    .map((request) => ({
      id: text(request.id),
      type: text(request.type, 'REQUEST_BILL'),
      status: text(request.status, 'OPEN'),
      createdAt: text(request.createdAt, new Date().toISOString()),
    }));

  return {
    version: 1,
    token: DEMO_TABLE_TOKEN,
    table: {
      id: text(object(landing.table).id),
      number: text(object(landing.table).number),
      name: text(object(landing.table).name) || null,
    },
    restaurant: {
      name: text(object(landing.restaurant).name, 'Spice Garden'),
      branch: text(object(landing.restaurant).branch, 'Sathorn'),
    },
    bill,
    orders,
    requests,
    paidAt: null,
    seq: orders.length,
  };
}

function loadStore(): GuestStore {
  if (typeof window === 'undefined') return memory ?? seedStore();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as GuestStore;
      if (parsed?.version === 1) {
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

function saveStore(store: GuestStore): void {
  memory = store;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Keep the in-memory copy.
  }
}

function advance(store: GuestStore): void {
  const now = Date.now();
  for (const order of store.orders) {
    if (!order.simulated) continue;
    const age = now - new Date(order.createdAt).getTime();
    const status = age < 4000 ? 'PENDING' : age < 8000 ? 'PREPARING' : age < 12000 ? 'READY' : 'SERVED';
    order.status = status;
    for (const item of order.items) item.status = status;
  }
  for (const request of store.requests) {
    const age = now - new Date(request.createdAt).getTime();
    if (request.status === 'OPEN' && age > 12000) request.status = 'ACKNOWLEDGED';
    if (request.status === 'ACKNOWLEDGED' && age > 24000) request.status = 'RESOLVED';
  }
  if (store.paidAt && now >= store.paidAt && store.bill) {
    store.bill.status = 'PAID';
    store.bill.due = '0.00';
    store.paidAt = null;
  }
}

function guestState() {
  const store = loadStore();
  advance(store);
  saveStore(store);
  const orderTotal = store.orders.reduce((sum, order) => sum + numeric(order.total), 0);
  return {
    status: store.bill?.status === 'PAID' ? 'PAYMENT_PENDING' : 'OPEN',
    table: store.table,
    restaurant: store.restaurant,
    orders: store.orders,
    bill: store.bill,
    orderTotal: orderTotal.toFixed(2),
    requests: store.requests,
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
  if (optionIds.length > 0) {
    for (const group of objects(item.modifierGroups)) {
      for (const option of objects(group.options)) {
        if (optionIds.includes(text(option.id))) price += numeric(option.priceDelta);
      }
    }
  }
  return price;
}

function createOrder(body: unknown): { id: string; number: string; total: string } {
  const input = object(body);
  const lines = objects(input.items);
  const store = loadStore();
  store.seq += 1;

  const items: GuestOrderItem[] = [];
  let total = 0;

  for (const line of lines) {
    const item = menuItems().find((entry) => text(entry.id) === text(line.menuItemId));
    if (!item) continue;
    const quantity = Math.max(1, numeric(line.quantity, 1));
    const lineTotal = unitPrice(item, line) * quantity;
    total += lineTotal;
    const variant = objects(item.variants).find((entry) => text(entry.id) === text(line.variantId));
    const modifiers: Array<{ name: string }> = [];
    for (const group of objects(item.modifierGroups)) {
      for (const option of objects(group.options)) {
        const selected =
          Array.isArray(line.modifierOptionIds) && line.modifierOptionIds.includes(text(option.id));
        if (selected) modifiers.push({ name: text(option.name) });
      }
    }
    items.push({
      id: `demo-line-${store.seq}-${items.length}`,
      name: text(item.name, 'Dish'),
      quantity,
      status: 'PENDING',
      note: typeof line.note === 'string' ? line.note : null,
      modifiers: variant ? [{ name: text(variant.name) }, ...modifiers] : modifiers,
    });
  }

  if (items.length === 0) {
    throw new DemoError(400, 'EMPTY_ORDER', 'This demo could not match the selected dishes.');
  }

  const order: GuestOrder = {
    id: `demo-order-${Date.now()}-${store.seq}`,
    number: `ORD-DEMO-${String(store.seq).padStart(4, '0')}`,
    status: 'PENDING',
    total: total.toFixed(2),
    createdAt: new Date().toISOString(),
    items,
    simulated: true,
  };
  store.orders = [...store.orders, order];
  saveStore(store);
  return { id: order.id, number: order.number, total: order.total };
}

function addRequest(type: string): GuestRequest {
  const store = loadStore();
  const request: GuestRequest = {
    id: `demo-request-${Date.now()}`,
    type: type || 'CALL_WAITER',
    status: 'OPEN',
    createdAt: new Date().toISOString(),
  };
  store.requests = [...store.requests, request];
  saveStore(store);
  return request;
}

function startPayment() {
  const store = loadStore();
  if (!store.bill) {
    throw new DemoError(404, 'BILL_NOT_ISSUED', 'This table has no bill in the demo.');
  }
  if (numeric(store.bill.due) <= 0) {
    throw new DemoError(409, 'NOTHING_DUE', 'This bill is already paid.');
  }
  store.paidAt = Date.now() + 9000;
  saveStore(store);
  return {
    paymentId: 'demo-payment',
    amount: store.bill.due,
    qrDataUrl: demoPayment.qrDataUrl,
    reference: demoPayment.reference,
    accountName: demoPayment.accountName,
    promptPayTarget: demoPayment.promptPayTarget,
  };
}

export async function demoClientApi<T>(path: string, options: ClientRequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const [pathname = ''] = path.split('?');

  if (method === 'GET') {
    if (pathname === '/public/customer-session') return guestState() as T;
    if (pathname === '/public/customer-session/menu') {
      return { menu: objects(demoLanding().menu) } as T;
    }
    return resolveFixture(path) as T;
  }

  if (pathname.startsWith('/public/qr/') && pathname.endsWith('/session')) {
    loadStore();
    return { ok: true } as T;
  }
  if (pathname === '/public/customer-session/orders') return createOrder(options.body) as T;
  if (pathname === '/public/customer-session/requests') {
    return addRequest(text(object(options.body).type)) as T;
  }
  if (pathname === '/public/customer-session/payments/promptpay') return startPayment() as T;
  if (pathname === '/auth/login') return demoMe as T;

  throw new DemoError(
    200,
    'DEMO_READ_ONLY',
    'Demo mode: this screen is read-only. Place an order from the guest menu to see the full flow.',
  );
}

export function resetDemo(): void {
  memory = null;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing else to clear.
  }
}
