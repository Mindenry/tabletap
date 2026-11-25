/**
 * Permission catalogue and default role → permission matrix.
 *
 * This file is the single source of truth for permission codes. The API seeds
 * its Permission table from it and the web app renders permission-aware UI from
 * the permissions the server returns with the session. The server always
 * re-evaluates permissions on every request; the client copy is for affordances
 * only.
 */

export const PERMISSIONS = [
  { code: 'restaurant.read', category: 'restaurant', description: 'View restaurant profile' },
  { code: 'restaurant.update', category: 'restaurant', description: 'Update restaurant profile' },
  { code: 'branch.read', category: 'branch', description: 'View branches' },
  { code: 'branch.create', category: 'branch', description: 'Create branches' },
  { code: 'branch.update', category: 'branch', description: 'Update branches' },
  { code: 'staff.read', category: 'staff', description: 'View staff' },
  { code: 'staff.invite', category: 'staff', description: 'Invite staff' },
  { code: 'staff.update', category: 'staff', description: 'Update staff and roles' },
  { code: 'staff.deactivate', category: 'staff', description: 'Deactivate staff' },
  { code: 'menu.read', category: 'menu', description: 'View menu' },
  { code: 'menu.create', category: 'menu', description: 'Create menu items' },
  { code: 'menu.update', category: 'menu', description: 'Update menu items' },
  { code: 'menu.delete', category: 'menu', description: 'Archive menu items' },
  { code: 'menu.price.update', category: 'menu', description: 'Change menu prices' },
  { code: 'order.read', category: 'order', description: 'View orders' },
  { code: 'order.create', category: 'order', description: 'Create staff orders' },
  { code: 'order.cancel', category: 'order', description: 'Cancel orders' },
  { code: 'kitchen.read', category: 'kitchen', description: 'View kitchen tickets' },
  { code: 'kitchen.update', category: 'kitchen', description: 'Update kitchen tickets' },
  { code: 'table.read', category: 'table', description: 'View tables and sessions' },
  { code: 'table.update', category: 'table', description: 'Open, close, move and merge tables' },
  { code: 'bill.create', category: 'bill', description: 'Create bills' },
  { code: 'bill.split', category: 'bill', description: 'Split bills' },
  { code: 'payment.read', category: 'payment', description: 'View payments' },
  { code: 'payment.confirm', category: 'payment', description: 'Confirm payments' },
  { code: 'payment.refund', category: 'payment', description: 'Record refunds' },
  { code: 'inventory.read', category: 'inventory', description: 'View inventory' },
  { code: 'inventory.adjust', category: 'inventory', description: 'Adjust stock' },
  { code: 'inventory.receive', category: 'inventory', description: 'Receive stock' },
  { code: 'promotion.manage', category: 'promotion', description: 'Manage promotions' },
  { code: 'analytics.read', category: 'analytics', description: 'View analytics' },
  { code: 'report.export', category: 'report', description: 'Export reports' },
  { code: 'audit.read', category: 'audit', description: 'View audit log' },
  { code: 'settings.manage', category: 'settings', description: 'Manage restaurant settings' },
] as const;

export type PermissionCode = (typeof PERMISSIONS)[number]['code'];

export const ALL_PERMISSIONS: PermissionCode[] = PERMISSIONS.map((p) => p.code);

export const ROLE_KEYS = [
  'OWNER',
  'MANAGER',
  'CASHIER',
  'KITCHEN',
  'WAITER',
  'VIEWER',
  'PLATFORM_ADMIN',
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

export const ROLE_LABELS: Record<RoleKey, { en: string; th: string }> = {
  OWNER: { en: 'Owner', th: 'เจ้าของ' },
  MANAGER: { en: 'Manager', th: 'ผู้จัดการ' },
  CASHIER: { en: 'Cashier', th: 'แคชเชียร์' },
  KITCHEN: { en: 'Kitchen', th: 'ครัว' },
  WAITER: { en: 'Waiter', th: 'พนักงานเสิร์ฟ' },
  VIEWER: { en: 'Viewer', th: 'ผู้ดู' },
  PLATFORM_ADMIN: { en: 'Platform admin', th: 'ผู้ดูแลแพลตฟอร์ม' },
};

const READ_ONLY: PermissionCode[] = [
  'restaurant.read',
  'branch.read',
  'staff.read',
  'menu.read',
  'order.read',
  'kitchen.read',
  'table.read',
  'payment.read',
  'inventory.read',
  'analytics.read',
];

/** Default permissions for each role. Owners may not be reduced. */
export const ROLE_PERMISSIONS: Record<RoleKey, PermissionCode[]> = {
  OWNER: [...ALL_PERMISSIONS],
  MANAGER: [
    ...READ_ONLY,
    'restaurant.update',
    'branch.update',
    'staff.invite',
    'staff.update',
    'menu.create',
    'menu.update',
    'menu.delete',
    'menu.price.update',
    'order.create',
    'order.cancel',
    'kitchen.update',
    'table.update',
    'bill.create',
    'bill.split',
    'payment.confirm',
    'inventory.adjust',
    'inventory.receive',
    'promotion.manage',
    'report.export',
    'audit.read',
    'settings.manage',
  ],
  CASHIER: [
    'restaurant.read',
    'branch.read',
    'menu.read',
    'order.read',
    'order.create',
    'table.read',
    'table.update',
    'bill.create',
    'bill.split',
    'payment.read',
    'payment.confirm',
    'payment.refund',
  ],
  KITCHEN: ['branch.read', 'menu.read', 'order.read', 'kitchen.read', 'kitchen.update', 'table.read'],
  WAITER: [
    'branch.read',
    'menu.read',
    'order.read',
    'order.create',
    'table.read',
    'table.update',
    'kitchen.read',
    'payment.read',
  ],
  VIEWER: READ_ONLY,
  PLATFORM_ADMIN: [],
};

export const ROLE_PERMISSION_SET: Record<RoleKey, ReadonlySet<PermissionCode>> = {
  OWNER: new Set(ROLE_PERMISSIONS.OWNER),
  MANAGER: new Set(ROLE_PERMISSIONS.MANAGER),
  CASHIER: new Set(ROLE_PERMISSIONS.CASHIER),
  KITCHEN: new Set(ROLE_PERMISSIONS.KITCHEN),
  WAITER: new Set(ROLE_PERMISSIONS.WAITER),
  VIEWER: new Set(ROLE_PERMISSIONS.VIEWER),
  PLATFORM_ADMIN: new Set(ROLE_PERMISSIONS.PLATFORM_ADMIN),
};

export function roleHasPermission(role: RoleKey, permission: PermissionCode): boolean {
  return ROLE_PERMISSION_SET[role]?.has(permission) ?? false;
}
