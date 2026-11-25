import type { PermissionCode, RoleKey } from '@tabletap/shared';

export interface StaffPrincipal {
  kind: 'staff';
  userId: string;
  userEmail: string;
  userName: string;
  tenantId: string;
  tenantSlug: string;
  membershipId: string;
  role: RoleKey;
  permissions: ReadonlySet<PermissionCode>;
  /** Empty array means "all branches in this tenant". */
  branchIds: string[];
  sessionId: string;
  isPlatformAdmin: boolean;
}

export interface CustomerPrincipal {
  kind: 'customer';
  customerSessionId: string;
  tableSessionId: string;
  tenantId: string;
  branchId: string;
  tableId: string;
  expiresAt: Date;
}

export interface PlatformPrincipal {
  kind: 'platform';
  userId: string;
  userEmail: string;
  userName: string;
  sessionId: string;
}

export type Principal = StaffPrincipal | CustomerPrincipal | PlatformPrincipal;

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  tid: string;
  typ: 'staff';
}

export interface CustomerTokenPayload {
  typ: 'customer';
  csid: string;
  tsid: string;
  tid: string;
  bid: string;
  tbl: string;
}

export function isStaff(principal: Principal | undefined): principal is StaffPrincipal {
  return principal?.kind === 'staff';
}

export function isCustomer(principal: Principal | undefined): principal is CustomerPrincipal {
  return principal?.kind === 'customer';
}

export function isPlatform(principal: Principal | undefined): principal is PlatformPrincipal {
  return principal?.kind === 'platform';
}
