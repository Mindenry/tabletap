import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { PermissionCode } from '@tabletap/shared';
import type { Principal, StaffPrincipal, CustomerPrincipal } from './principal';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const PERMISSIONS_KEY = 'auth:permissions';
export const ANY_PERMISSIONS_KEY = 'auth:anyPermissions';
export const PLATFORM_ADMIN_KEY = 'auth:platformAdmin';
export const ALLOW_CUSTOMER_KEY = 'auth:allowCustomer';

/** Skip staff authentication entirely (login, public menu, health...). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/** Authenticated staff must hold every listed permission. */
export const RequirePermissions = (...permissions: PermissionCode[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Authenticated staff must hold at least one of the listed permissions. */
export const RequireAnyPermission = (...permissions: PermissionCode[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ANY_PERMISSIONS_KEY, permissions);

/** Requires the platform-admin flag on the user record. */
export const PlatformAdminOnly = (): MethodDecorator & ClassDecorator =>
  SetMetadata(PLATFORM_ADMIN_KEY, true);

/**
 * Marks a public route as accepting either a staff principal or a customer
 * session (used by shared read endpoints).
 */
export const AllowCustomer = (): MethodDecorator & ClassDecorator => SetMetadata(ALLOW_CUSTOMER_KEY, true);

export const CurrentPrincipal = createParamDecorator((_data: unknown, ctx: ExecutionContext): Principal => {
  const request = ctx.switchToHttp().getRequest<{ principal: Principal }>();
  return request.principal;
});

export const CurrentStaff = createParamDecorator((_data: unknown, ctx: ExecutionContext): StaffPrincipal => {
  const request = ctx.switchToHttp().getRequest<{ principal: Principal }>();
  return request.principal as StaffPrincipal;
});

export const CurrentCustomer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CustomerPrincipal => {
    const request = ctx.switchToHttp().getRequest<{ principal: Principal }>();
    return request.principal as CustomerPrincipal;
  },
);

export const RequestId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string | undefined => {
  const request = ctx.switchToHttp().getRequest<{ requestId?: string }>();
  return request.requestId;
});
