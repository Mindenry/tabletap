import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { PermissionCode, RoleKey } from '@tabletap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { env } from '../../config/env';
import { readAccessToken } from './cookies';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY, ANY_PERMISSIONS_KEY, PLATFORM_ADMIN_KEY } from './decorators';
import type { AccessTokenPayload, Principal, StaffPrincipal } from './principal';

type RequestWithPrincipal = Request & { principal?: Principal };

function unauthenticated(message: string, code = 'UNAUTHENTICATED'): UnauthorizedException {
  return new UnauthorizedException({ message, code });
}

@Injectable()
export class StaffAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const token = readAccessToken(request);
    if (!token) throw unauthenticated('Authentication required');

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, { secret: env.accessSecret });
    } catch {
      throw unauthenticated('Session expired', 'TOKEN_EXPIRED');
    }
    if (payload.typ !== 'staff' || !payload.sid || !payload.sub) {
      throw unauthenticated('Invalid session token');
    }

    // The session row is checked on every request so that revocation takes
    // effect immediately, even though the access token has not expired yet.
    const session = await this.prisma.userSession.findUnique({
      where: { id: payload.sid },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
      throw unauthenticated('Session revoked', 'SESSION_REVOKED');
    }
    if (session.user.status !== 'ACTIVE') {
      throw unauthenticated('Account is not active', 'ACCOUNT_DISABLED');
    }

    const membership = payload.tid
      ? await this.prisma.membership.findFirst({
          where: {
            userId: session.userId,
            tenantId: payload.tid,
            status: 'ACTIVE',
            tenant: { status: 'ACTIVE' },
          },
          include: {
            role: { include: { permissions: true } },
            branches: true,
            tenant: { select: { id: true, slug: true } },
          },
        })
      : null;

    if (!membership) {
      if (session.user.platformAdmin) {
        request.principal = {
          kind: 'platform',
          userId: session.userId,
          userEmail: session.user.email,
          userName: session.user.name,
          sessionId: session.id,
        };
        return true;
      }
      throw unauthenticated('No active membership for this restaurant', 'MEMBERSHIP_INACTIVE');
    }

    const principal: StaffPrincipal = {
      kind: 'staff',
      userId: session.userId,
      userEmail: session.user.email,
      userName: session.user.name,
      tenantId: membership.tenantId,
      tenantSlug: membership.tenant.slug,
      membershipId: membership.id,
      role: membership.role.key as RoleKey,
      permissions: new Set(membership.role.permissions.map((p) => p.permissionCode as PermissionCode)),
      branchIds: membership.branches.map((b) => b.branchId),
      sessionId: session.id,
      isPlatformAdmin: session.user.platformAdmin,
    };
    request.principal = principal;
    return true;
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required =
      this.reflector.getAllAndOverride<PermissionCode[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const anyRequired =
      this.reflector.getAllAndOverride<PermissionCode[]>(ANY_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const platformOnly =
      this.reflector.getAllAndOverride<boolean>(PLATFORM_ADMIN_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false;

    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const principal = request.principal;
    if (!principal) throw unauthenticated('Authentication required');

    if (platformOnly) {
      if (principal.kind !== 'platform' && !(principal.kind === 'staff' && principal.isPlatformAdmin)) {
        throw new ForbiddenException({
          message: 'Platform administrator access required',
          code: 'FORBIDDEN',
        });
      }
    }

    if (principal.kind === 'platform') {
      // Platform principals never inherit restaurant data permissions.
      if (required.length > 0 || anyRequired.length > 0) {
        throw new ForbiddenException({
          message: 'Platform administrators need an explicit restaurant membership for this action',
          code: 'NO_TENANT_MEMBERSHIP',
        });
      }
      return true;
    }

    if (principal.kind === 'customer') {
      if (required.length > 0 || anyRequired.length > 0) {
        throw new ForbiddenException({ message: 'Staff access required', code: 'FORBIDDEN' });
      }
      return true;
    }

    const missing = required.filter((permission) => !principal.permissions.has(permission));
    if (missing.length > 0) {
      throw new ForbiddenException({
        message: `Missing permission: ${missing.join(', ')}`,
        code: 'MISSING_PERMISSION',
        details: { missing },
      });
    }
    if (anyRequired.length > 0 && !anyRequired.some((permission) => principal.permissions.has(permission))) {
      throw new ForbiddenException({
        message: `This action needs one of: ${anyRequired.join(', ')}`,
        code: 'MISSING_PERMISSION',
        details: { anyOf: anyRequired },
      });
    }
    return true;
  }
}

/**
 * Double-submit CSRF protection for cookie-authenticated state changes.
 * Bearer-token clients are exempt because browsers never attach them
 * automatically.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private static readonly EXEMPT = [
    '/api/v1/auth/login',
    '/api/v1/auth/register',
    '/api/v1/auth/refresh',
    '/api/v1/auth/forgot-password',
    '/api/v1/auth/reset-password',
    '/api/v1/auth/accept-invitation',
    '/api/v1/auth/logout',
    '/api/v1/public/customer-session',
  ];

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;

    const header = request.header('authorization');
    if (header?.toLowerCase().startsWith('bearer ')) return true;

    const path = request.originalUrl.split('?')[0] ?? '';
    if (CsrfGuard.EXEMPT.some((exempt) => path === exempt)) return true;
    // The first QR session bootstrap cannot carry a CSRF cookie yet; it is
    // protected by the single-use QR token itself.
    if (path.startsWith('/api/v1/public/qr/') && path.endsWith('/session')) return true;

    const hasSession = Boolean(request.cookies?.tt_at || request.cookies?.tt_customer);
    if (!hasSession) return true;

    const cookieToken = request.cookies?.tt_csrf as string | undefined;
    const headerToken = request.header('x-csrf-token');
    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      throw new ForbiddenException({
        message: 'Missing or invalid CSRF token',
        code: 'CSRF_FAILED',
      });
    }
    return true;
  }
}
