import raw from './fixtures.json';

/**
 * The public demo ships a snapshot of the seeded restaurant. Server renders and
 * client reads resolve from this file instead of an API.
 */
type JsonObject = Record<string, unknown>;

export interface DemoBranch {
  id: string;
  name: string;
  code: string;
  [key: string]: unknown;
}

export interface DemoMe {
  user: { id: string; email: string; name: string; platformAdmin: boolean };
  tenant: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    currency: string;
    status: string;
  } | null;
  role: string | null;
  permissions: string[];
  branches: DemoBranch[];
  membershipId: string | null;
  subscription: Record<string, unknown>;
}

export interface DemoPayment {
  amount: string;
  accountName: string;
  promptPayTarget: string;
  reference: string;
  qrDataUrl: string;
}

const data = raw as unknown as JsonObject;

export const demoMe = data.me as unknown as DemoMe;
export const demoBranches = data.branches as unknown as DemoBranch[];
export const demoPayment = data.demoPayment as unknown as DemoPayment;
const meByRole = data.meByRole as unknown as Record<string, DemoMe>;

export function demoMeFor(role?: string | null): DemoMe {
  return (role && meByRole[role]) || demoMe;
}

export const DEMO_TABLE_TOKEN = 'demo-sathorn-t02-4f8c2a91';
export const DEMO_EMPTY_TABLE_TOKEN = 'demo-sathorn-t03-4f8c2a91';

const byBranch = data.byBranch as unknown as Record<string, JsonObject>;
const details = data.details as unknown as {
  bills: Record<string, JsonObject>;
  orders: Record<string, JsonObject>;
  receipts: Record<string, unknown>;
};
const shared = data.shared as unknown as JsonObject;
const publicQr = data.publicQr as unknown as Record<string, JsonObject>;

function objects(value: unknown): JsonObject[] {
  return Array.isArray(value) ? (value as JsonObject[]) : [];
}

function object(value: unknown): JsonObject {
  return (value ?? {}) as JsonObject;
}

export function demoBranchId(): string {
  return demoBranches[0]?.id ?? '';
}

export function demoBranchData(branchId = demoBranchId()): JsonObject {
  return byBranch[branchId] ?? byBranch[demoBranchId()] ?? {};
}

export function demoLanding(token = DEMO_TABLE_TOKEN): JsonObject {
  return publicQr[token] ?? {};
}

function findBill(branch: JsonObject, id: string): JsonObject | undefined {
  return objects(branch.bills).find((bill) => bill.id === id);
}

function synthBill(branch: JsonObject, id: string): unknown {
  const bill = findBill(branch, id);
  if (!bill) return undefined;
  return {
    ...bill,
    splits: [],
    payments: Array.isArray(bill.payments) ? bill.payments : [],
    availableToPay: typeof bill.due === 'string' ? bill.due : '0.00',
  };
}

function findOrder(branch: JsonObject, id: string): JsonObject | undefined {
  return objects(branch.orders).find((order) => order.id === id);
}

function limitRows(rows: JsonObject[], params: URLSearchParams): JsonObject[] {
  const limit = Number(params.get('limit') ?? '0');
  return limit > 0 ? rows.slice(0, limit) : rows;
}

/**
 * Resolves a `GET /api/v1/...` path against the bundled snapshot. Query strings
 * are only used for branch selection, table sessions, status and limits.
 */
export function resolveFixture(path: string, role?: string | null): unknown {
  const [pathname = '', search = ''] = path.split('?');
  const params = new URLSearchParams(search);
  const branchId = params.get('branchId') || demoBranchId();
  const branch = demoBranchData(branchId);
  const segments = pathname.split('/').filter(Boolean);

  if (pathname === '/auth/me') return demoMeFor(role);
  if (pathname === '/branches') return demoBranches;

  if (segments[0] === 'branches') {
    const id = segments[1];
    const branchData = demoBranchData(id);
    if (segments.length === 2) {
      return branchData.branch ?? demoBranches.find((item) => item.id === id) ?? null;
    }
    if (segments[2] === 'tables') return objects(branchData.tables);
    if (segments[2] === 'zones') return objects(branchData.zones);
  }

  if (pathname === '/menu/items') return objects(shared.menu);
  if (pathname === '/menu/categories') return objects(shared.categories);
  if (pathname === '/menu/modifier-groups') return objects(shared.modifierGroups);

  if (segments[0] === 'bills') {
    const billId = segments[1] ?? '';
    if (segments.length >= 3 && segments[2] === 'receipt') {
      return details.receipts[billId] ?? null;
    }
    if (segments.length === 2) {
      return details.bills[billId] ?? synthBill(branch, billId);
    }
    return objects(branch.bills);
  }

  if (segments[0] === 'orders') {
    const orderId = segments[1] ?? '';
    if (segments.length === 2) {
      return details.orders[orderId] ?? findOrder(branch, orderId);
    }
    let rows = objects(branch.orders);
    const sessionId = params.get('tableSessionId');
    if (sessionId) rows = rows.filter((order) => order.tableSessionId === sessionId);
    const status = params.get('status');
    if (status) rows = rows.filter((order) => order.status === status);
    return limitRows(rows, params);
  }

  if (pathname === '/kitchen/tickets') return objects(branch.tickets);
  if (pathname === '/kitchen/stations') return objects(branch.stations);

  if (pathname === '/table-requests') {
    let rows = objects(branch.requests);
    const status = params.get('status');
    if (status && status !== 'ALL') {
      rows =
        status === 'ACTIVE'
          ? rows.filter((request) => request.status !== 'RESOLVED')
          : rows.filter((request) => request.status === status);
    }
    return limitRows(rows, params);
  }

  if (pathname === '/inventory/ingredients') return objects(branch.ingredients);
  if (pathname === '/inventory/low-stock') return objects(branch.lowStock);
  if (pathname === '/inventory/movements') return objects(branch.movements);

  if (segments[0] === 'analytics') {
    const analytics = object(branch.analytics);
    const key = (segments[1] ?? '').replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    return analytics[key] ?? null;
  }

  if (pathname === '/promotions') return objects(branch.promotions);
  if (pathname === '/recipes') return shared.recipes ?? [];
  if (pathname === '/staff') return shared.staff ?? [];
  if (pathname === '/staff/invitations') return shared.invitations ?? [];
  if (pathname === '/audit-logs')
    return shared.auditLogs ?? { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 };
  if (pathname === '/tenants/current') return shared.tenant ?? null;
  if (pathname === '/tenants/current/entitlements') return shared.entitlements ?? {};
  if (pathname === '/public/customer-session/menu') {
    return { menu: objects(demoLanding().menu) };
  }

  if (segments[0] === 'public' && segments[1] === 'qr' && segments[2]) {
    return publicQr[segments[2]] ?? null;
  }

  if (segments[0] === 'platform') return null;

  if (
    pathname.startsWith('/analytics') ||
    pathname.startsWith('/orders') ||
    pathname.startsWith('/bills') ||
    pathname.startsWith('/kitchen') ||
    pathname.startsWith('/inventory') ||
    pathname.startsWith('/menu') ||
    pathname.startsWith('/staff') ||
    pathname.startsWith('/promotions') ||
    pathname.startsWith('/table-requests')
  ) {
    return [];
  }

  return {};
}
