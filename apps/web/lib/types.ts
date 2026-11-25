export interface PermissionList extends Array<string> {}

export interface SessionBranch {
  id: string;
  name: string;
  code: string;
  status: string;
  vatRate: string;
  vatInclusive: boolean;
}

export interface Me {
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
  branches: SessionBranch[];
  membershipId: string | null;
  subscription: {
    status: string;
    plan: string;
    planName: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    limits: Record<string, number>;
  } | null;
}

export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

export interface Overview {
  period: { from: string; to: string };
  branch: { id: string; name: string };
  grossSales: string;
  refunds: string;
  netSales: string;
  vatTotal: string;
  serviceChargeTotal: string;
  discountTotal: string;
  paidBills: number;
  averageOrderValue: string;
  orders: number;
  cancelledOrders: number;
  cancellationRate: string;
  tableSessions: number;
  itemsSold: number;
}

export interface SalesPoint {
  bucket: string;
  gross: string;
  vat: string;
  bills: number;
}

export interface MenuItemRow {
  id: string;
  name: string;
  nameEn: string | null;
  slug: string;
  description: string | null;
  descriptionEn: string | null;
  imageUrl: string | null;
  sku: string | null;
  basePrice: string;
  costEstimate: string;
  prepMinutes: number;
  status: string;
  isFeatured: boolean;
  isPopular: boolean;
  category: { id: string; name: string; nameEn: string | null };
  availableInBranch: boolean;
  variants: Array<{ id: string; name: string; priceDelta: string; isDefault: boolean }>;
  modifierGroups: Array<{
    id: string;
    name: string;
    nameEn: string | null;
    required: boolean;
    minSelect: number;
    maxSelect: number;
    options: Array<{ id: string; name: string; nameEn: string | null; priceDelta: string }>;
  }>;
  allergens: Array<{ code: string; name: string }>;
  stationIds: string[];
}

export interface CategoryRow {
  id: string;
  name: string;
  nameEn: string | null;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  displayOrder: number;
  isActive: boolean;
  itemCount: number;
}

export interface TableRow {
  id: string;
  number: string;
  name: string | null;
  capacity: number;
  zone: { id: string; name: string } | null;
  status: string;
  posX: number;
  posY: number;
  width: number;
  height: number;
  qr: { id: string; prefix: string } | null;
  session: {
    id: string;
    status: string;
    openedAt: string;
    guestCount: number;
    orderCount: number;
    unpaidOrders: string;
    outstandingBills: string;
    outstandingTotal: string;
    openRequests: number;
  } | null;
}

export interface OrderRow {
  id: string;
  number: string;
  status: string;
  source: string;
  table: { id: string; number: string; name: string | null };
  tableSessionId: string;
  total: string;
  itemCount: number;
  bill: { id: string; number: string; status: string } | null;
  createdAt: string;
  acceptedAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
  cancelledAt: string | null;
}

export interface KitchenTicket {
  id: string;
  number: string;
  status: string;
  priority: number;
  station: { id: string; name: string; code: string };
  order: {
    id: string;
    number: string;
    status: string;
    note: string | null;
    createdAt: string;
    table: { id: string; number: string; name: string | null };
    tableSessionId: string;
  };
  createdAt: string;
  acceptedAt: string | null;
  readyAt: string | null;
  items: Array<{
    id: string;
    name: string;
    variantName: string | null;
    quantity: number;
    status: string;
    note: string | null;
    modifiers: Array<{ groupName: string; name: string }>;
  }>;
}

export interface BillDetail {
  id: string;
  number: string;
  status: string;
  table: { id: string; number: string; name: string | null };
  tableSessionId: string;
  currency: string;
  subtotal: string;
  discountTotal: string;
  serviceCharge: string;
  taxTotal: string;
  total: string;
  paidTotal: string;
  pendingTotal: string;
  due: string;
  availableToPay: string;
  taxRate: string;
  taxInclusive: boolean;
  items: Array<{
    id: string;
    name: string;
    variantName: string | null;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
    lineTax: string;
    lineDiscount: string;
  }>;
  orders: Array<{ id: string; number: string; status: string }>;
  splits: Array<{ id: string; label: string; amount: string; status: string; paidAt: string | null }>;
  payments: Array<{
    id: string;
    reference: string;
    method: string;
    status: string;
    amount: string;
    amountPaid: string;
    promptPayPayload: string | null;
    expiresAt: string | null;
    confirmedAt: string | null;
  }>;
  receipt: { id: string; number: string; issuedAt: string } | null;
  createdAt: string;
  paidAt: string | null;
}

export interface BillRow {
  id: string;
  number: string;
  status: string;
  tableSessionId: string;
  table: { id: string; number: string; name: string | null };
  total: string;
  paidTotal: string;
  due: string;
  itemCount: number;
  orderCount: number;
  paymentCount: number;
  createdAt: string;
  paidAt: string | null;
  payments: Array<{ id: string; method: string; status: string; amount: string }>;
}

export interface IngredientRow {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  unit: string;
  costPerUnit: string;
  minStock: string;
  currentStock: string;
  storageLocation: string | null;
  isActive: boolean;
  lowStock: boolean;
  stockValue: string;
}

export interface StaffRow {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  accountStatus: string;
  status: string;
  role: string;
  roleName: string;
  branches: Array<{ id: string; name: string }>;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AuditRow {
  id: string;
  action: string;
  actorType: string;
  actor: { id: string; name: string; email: string } | null;
  resourceType: string;
  resourceId: string | null;
  branchId: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  requestId: string | null;
  createdAt: string;
}

export interface MenuPerformanceRow {
  menuItemId: string;
  name: string;
  quantity: number;
  revenue: string;
  estimatedCost: string;
  grossMargin: string;
  marginPercent: string | null;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
