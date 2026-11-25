import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import argon2 from 'argon2';
import { randomBytes, randomUUID } from 'node:crypto';
import { type PermissionCode, type RoleKey } from '@tabletap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { hashSecret, randomToken } from '../../common/crypto';
import { env } from '../../config/env';
import { AuditService } from '../audit/audit.module';
import { MailService } from '../mail/mail.module';
import { TenantBootstrapService } from '../tenancy/tenant-bootstrap.service';
import type { AccessTokenPayload, StaffPrincipal } from './principal';

export const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB, OWASP baseline
  timeCost: 2,
  parallelism: 1,
};

const MAX_FAILED_LOGINS = 10;
const LOCK_MINUTES = 15;

/** Sentinel tenant for accounts that belong to no restaurant (platform admins). */
export const NO_TENANT = '00000000-0000-0000-0000-000000000000';

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  sessionId: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  platformAdmin: boolean;
}

export interface ActorContext {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base.length >= 3 ? base : 'restaurant';
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly bootstrap: TenantBootstrapService,
  ) {}

  // ------------------------------------------------------------------ login

  async login(
    input: { email: string; password: string },
    actor: ActorContext,
  ): Promise<{ user: AuthenticatedUser; session: IssuedSession; tenantId: string }> {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Constant-ish work whether or not the account exists, to avoid revealing
    // which emails are registered through timing.
    if (!user) {
      await argon2.hash(input.password, ARGON2_OPTIONS);
      throw new UnauthorizedException({ message: 'Invalid email or password', code: 'INVALID_CREDENTIALS' });
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new UnauthorizedException({
        message: 'Too many failed attempts. Try again later.',
        code: 'ACCOUNT_LOCKED',
      });
    }

    const valid = await argon2.verify(user.passwordHash, input.password).catch(() => false);
    if (!valid) {
      const failed = user.failedLoginCount + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: failed,
          lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : null,
        },
      });
      await this.audit.record({
        actorId: user.id,
        action: 'auth.login.failed',
        resourceType: 'User',
        resourceId: user.id,
        requestId: actor.requestId,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });
      throw new UnauthorizedException({ message: 'Invalid email or password', code: 'INVALID_CREDENTIALS' });
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException({ message: 'This account is disabled', code: 'ACCOUNT_DISABLED' });
    }

    const membership = await this.prisma.membership.findFirst({
      where: { userId: user.id, status: 'ACTIVE', tenant: { status: 'ACTIVE' } },
      orderBy: { createdAt: 'asc' },
      include: { tenant: true },
    });

    if (!membership && !user.platformAdmin) {
      throw new UnauthorizedException({
        message: 'No active restaurant membership',
        code: 'MEMBERSHIP_INACTIVE',
      });
    }

    const tenantId = membership?.tenantId ?? NO_TENANT;
    const session = await this.createSession(user, tenantId, actor);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    await this.audit.record({
      tenantId: membership?.tenantId,
      actorId: user.id,
      action: 'auth.login',
      resourceType: 'User',
      resourceId: user.id,
      requestId: actor.requestId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });

    return {
      user: { id: user.id, email: user.email, name: user.name, platformAdmin: user.platformAdmin },
      session,
      tenantId,
    };
  }

  private async createSession(
    user: { id: string; email: string; name: string; platformAdmin: boolean },
    tenantId: string,
    actor: ActorContext,
    familyId?: string,
  ): Promise<IssuedSession> {
    const refreshToken = randomToken(48);
    const csrfToken = randomBytes(32).toString('hex');
    const now = Date.now();
    const refreshExpiresAt = new Date(now + env.refreshTokenTtlDays * 24 * 60 * 60 * 1000);

    const session = await this.prisma.userSession.create({
      data: {
        userId: user.id,
        tokenHash: hashSecret(refreshToken),
        familyId: familyId ?? randomUUID(),
        userAgent: actor.userAgent?.slice(0, 400),
        ipAddress: actor.ipAddress?.slice(0, 64),
        expiresAt: refreshExpiresAt,
      },
    });

    const payload: AccessTokenPayload = {
      sub: user.id,
      sid: session.id,
      tid: tenantId,
      typ: 'staff',
    };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: env.accessSecret,
      expiresIn: env.accessTokenTtlSeconds,
    });

    return {
      accessToken,
      refreshToken,
      csrfToken,
      accessExpiresAt: new Date(now + env.accessTokenTtlSeconds * 1000),
      refreshExpiresAt,
      sessionId: session.id,
    };
  }

  // ---------------------------------------------------------------- refresh

  async refresh(refreshToken: string | undefined, actor: ActorContext): Promise<IssuedSession> {
    if (!refreshToken) {
      throw new UnauthorizedException({ message: 'Missing refresh token', code: 'REFRESH_REQUIRED' });
    }
    const hashed = hashSecret(refreshToken);
    const existing = await this.prisma.userSession.findUnique({
      where: { tokenHash: hashed },
      include: { user: true },
    });
    if (!existing) {
      throw new UnauthorizedException({ message: 'Invalid refresh token', code: 'INVALID_REFRESH' });
    }

    if (existing.revokedAt) {
      // Reuse of a rotated token: the whole family is compromised.
      await this.prisma.userSession.updateMany({
        where: { familyId: existing.familyId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'REFRESH_TOKEN_REUSE' },
      });
      await this.audit.record({
        actorId: existing.userId,
        action: 'auth.refresh.reuse_detected',
        resourceType: 'UserSession',
        resourceId: existing.id,
        requestId: actor.requestId,
        ipAddress: actor.ipAddress,
      });
      this.logger.warn({ userId: existing.userId }, 'Refresh token reuse detected; family revoked');
      throw new UnauthorizedException({
        message: 'Session revoked, please sign in again',
        code: 'TOKEN_REUSE',
      });
    }

    if (existing.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException({ message: 'Session expired', code: 'SESSION_EXPIRED' });
    }
    if (existing.user.status !== 'ACTIVE') {
      throw new UnauthorizedException({ message: 'Account is not active', code: 'ACCOUNT_DISABLED' });
    }

    const membership = await this.prisma.membership.findFirst({
      where: { userId: existing.userId, status: 'ACTIVE', tenant: { status: 'ACTIVE' } },
      orderBy: { createdAt: 'asc' },
      select: { tenantId: true },
    });

    const issued = await this.createSession(
      existing.user,
      membership?.tenantId ?? NO_TENANT,
      actor,
      existing.familyId,
    );

    await this.prisma.userSession.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), revokeReason: 'ROTATED', replacedById: issued.sessionId },
    });

    return issued;
  }

  // ----------------------------------------------------------------- logout

  async logout(sessionId: string | undefined, actor: ActorContext): Promise<void> {
    if (!sessionId) return;
    const session = await this.prisma.userSession.findUnique({ where: { id: sessionId } });
    if (!session || session.revokedAt) return;
    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), revokeReason: 'LOGOUT' },
    });
    await this.audit.record({
      actorId: session.userId,
      action: 'auth.logout',
      resourceType: 'UserSession',
      resourceId: session.id,
      requestId: actor.requestId,
      ipAddress: actor.ipAddress,
    });
  }

  // --------------------------------------------------------------- sessions

  async listSessions(userId: string, currentSessionId: string) {
    const sessions = await this.prisma.userSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      take: 50,
    });
    return sessions.map((session) => ({
      id: session.id,
      current: session.id === currentSessionId,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      expiresAt: session.expiresAt,
    }));
  }

  async revokeSession(userId: string, sessionId: string, actor: ActorContext): Promise<void> {
    const session = await this.prisma.userSession.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) {
      throw new UnauthorizedException({ message: 'Session not found', code: 'NOT_FOUND' });
    }
    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), revokeReason: 'MANUAL_REVOKE' },
    });
    await this.audit.record({
      actorId: userId,
      action: 'auth.session.revoked',
      resourceType: 'UserSession',
      resourceId: session.id,
      requestId: actor.requestId,
    });
  }

  // ------------------------------------------------------------ registration

  async registerRestaurant(
    input: {
      restaurantName: string;
      ownerName: string;
      email: string;
      password: string;
      phone?: string;
      branchName?: string;
    },
    actor: ActorContext,
  ): Promise<{ user: AuthenticatedUser; session: IssuedSession; tenantId: string }> {
    const email = input.email.trim().toLowerCase();
    const passwordHash = await argon2.hash(input.password, ARGON2_OPTIONS);

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { email } });
      if (existing) {
        throw new UnauthorizedException({ message: 'Email already registered', code: 'EMAIL_TAKEN' });
      }

      const user = await tx.user.create({
        data: {
          email,
          name: input.ownerName.trim(),
          passwordHash,
          phone: input.phone?.trim() || null,
        },
      });

      let slug = slugify(input.restaurantName);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const clash = await tx.tenant.findUnique({ where: { slug } });
        if (!clash) break;
        slug = `${slugify(input.restaurantName)}-${randomBytes(2).toString('hex')}`;
      }

      const tenant = await tx.tenant.create({
        data: {
          name: input.restaurantName.trim(),
          slug,
          email,
          phone: input.phone?.trim() || null,
          timezone: env.defaultTimezone,
          currency: env.defaultCurrency,
          status: 'ACTIVE',
        },
      });

      const roleIds = await this.bootstrap.createDefaultRoles(tx, tenant.id);
      const ownerRoleId = roleIds.OWNER;
      if (!ownerRoleId) throw new Error('Owner role was not created');

      const branch = await tx.branch.create({
        data: {
          tenantId: tenant.id,
          name: input.branchName?.trim() || 'Main Branch',
          code: 'MAIN',
          timezone: env.defaultTimezone,
          currency: env.defaultCurrency,
          vatRate: new Prisma.Decimal(env.defaultVatRate),
          vatInclusive: true,
        },
      });

      const membership = await tx.membership.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          roleId: ownerRoleId,
          status: 'ACTIVE',
          defaultBranchId: branch.id,
        },
      });

      await tx.membershipBranch.create({
        data: { membershipId: membership.id, branchId: branch.id },
      });

      for (const code of ['HOT_KITCHEN', 'BEVERAGE']) {
        await tx.kitchenStation.create({
          data: { branchId: branch.id, code, name: code === 'HOT_KITCHEN' ? 'Hot kitchen' : 'Beverage' },
        });
      }

      await this.bootstrap.createSubscription(tx, tenant.id, 'GROWTH');

      return { user, tenant, branch, membership };
    });

    const session = await this.createSession(result.user, result.tenant.id, actor);

    await this.audit.record({
      tenantId: result.tenant.id,
      actorId: result.user.id,
      action: 'tenant.created',
      resourceType: 'Tenant',
      resourceId: result.tenant.id,
      after: { name: result.tenant.name, slug: result.tenant.slug },
      requestId: actor.requestId,
      ipAddress: actor.ipAddress,
    });

    return {
      user: { id: result.user.id, email: result.user.email, name: result.user.name, platformAdmin: false },
      session,
      tenantId: result.tenant.id,
    };
  }

  // -------------------------------------------------------------- passwords

  async changePassword(
    userId: string,
    currentSessionId: string,
    input: { currentPassword: string; newPassword: string },
    actor: ActorContext,
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const valid = await argon2.verify(user.passwordHash, input.currentPassword).catch(() => false);
    if (!valid) {
      throw new UnauthorizedException({ message: 'Current password is incorrect', code: 'INVALID_PASSWORD' });
    }
    const passwordHash = await argon2.hash(input.newPassword, ARGON2_OPTIONS);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePassword: false },
      }),
      this.prisma.userSession.updateMany({
        where: { userId, revokedAt: null, id: { not: currentSessionId } },
        data: { revokedAt: new Date(), revokeReason: 'PASSWORD_CHANGED' },
      }),
    ]);
    await this.audit.record({
      actorId: userId,
      action: 'auth.password.changed',
      resourceType: 'User',
      resourceId: userId,
      requestId: actor.requestId,
      ipAddress: actor.ipAddress,
    });
  }

  /** Always resolves without revealing whether the email exists. */
  async requestPasswordReset(email: string, actor: ActorContext): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user || user.status !== 'ACTIVE') return;

    const token = randomToken(32);
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashSecret(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    await this.mail.sendPasswordReset({ to: user.email, token });
    await this.audit.record({
      actorId: user.id,
      action: 'auth.password.reset_requested',
      resourceType: 'User',
      resourceId: user.id,
      requestId: actor.requestId,
      ipAddress: actor.ipAddress,
    });
  }

  async resetPassword(input: { token: string; newPassword: string }, actor: ActorContext): Promise<void> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashSecret(input.token) },
    });
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException({ message: 'Reset link is invalid or expired', code: 'RESET_INVALID' });
    }
    const passwordHash = await argon2.hash(input.newPassword, ARGON2_OPTIONS);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
      }),
      this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      this.prisma.userSession.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'PASSWORD_RESET' },
      }),
    ]);
    await this.audit.record({
      actorId: record.userId,
      action: 'auth.password.reset',
      resourceType: 'User',
      resourceId: record.userId,
      requestId: actor.requestId,
      ipAddress: actor.ipAddress,
    });
  }

  // ------------------------------------------------------------- invitations

  async acceptInvitation(
    input: { token: string; name: string; password: string },
    actor: ActorContext,
  ): Promise<{ user: AuthenticatedUser; session: IssuedSession; tenantId: string }> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashSecret(input.token) },
      include: { tenant: true, role: true },
    });
    if (
      !invitation ||
      invitation.revokedAt ||
      invitation.acceptedAt ||
      invitation.expiresAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedException({
        message: 'Invitation is invalid or expired',
        code: 'INVITATION_INVALID',
      });
    }
    if (invitation.tenant.status !== 'ACTIVE') {
      throw new UnauthorizedException({ message: 'Restaurant is not active', code: 'TENANT_INACTIVE' });
    }

    const passwordHash = await argon2.hash(input.password, ARGON2_OPTIONS);

    const { user, membership } = await this.prisma.$transaction(async (tx) => {
      let existingUser = await tx.user.findUnique({ where: { email: invitation.email } });
      if (existingUser) {
        const alreadyMember = await tx.membership.findUnique({
          where: { tenantId_userId: { tenantId: invitation.tenantId, userId: existingUser.id } },
        });
        if (alreadyMember) {
          throw new UnauthorizedException({
            message: 'Already a member of this restaurant',
            code: 'ALREADY_MEMBER',
          });
        }
        existingUser = await tx.user.update({
          where: { id: existingUser.id },
          data: { passwordHash, status: 'ACTIVE' },
        });
      } else {
        existingUser = await tx.user.create({
          data: {
            email: invitation.email,
            name: input.name.trim(),
            passwordHash,
          },
        });
      }

      const created = await tx.membership.create({
        data: {
          tenantId: invitation.tenantId,
          userId: existingUser.id,
          roleId: invitation.roleId,
          status: 'ACTIVE',
        },
      });
      for (const branchId of invitation.branchIds) {
        await tx.membershipBranch.create({ data: { membershipId: created.id, branchId } });
      }
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });
      return { user: existingUser, membership: created };
    });

    const session = await this.createSession(user, membership.tenantId, actor);
    await this.audit.record({
      tenantId: membership.tenantId,
      actorId: user.id,
      action: 'staff.invitation.accepted',
      resourceType: 'Invitation',
      resourceId: invitation.id,
      requestId: actor.requestId,
      ipAddress: actor.ipAddress,
    });
    return {
      user: { id: user.id, email: user.email, name: user.name, platformAdmin: user.platformAdmin },
      session,
      tenantId: membership.tenantId,
    };
  }

  // ------------------------------------------------------------------- me

  async me(principal: StaffPrincipal | { kind: 'platform'; userId: string; sessionId: string }) {
    if (principal.kind === 'platform') {
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: principal.userId } });
      return {
        user: { id: user.id, email: user.email, name: user.name, platformAdmin: true },
        tenant: null,
        role: null,
        permissions: [] as PermissionCode[],
        branches: [],
        membershipId: null,
        subscription: null,
      };
    }

    const membership = await this.prisma.membership.findUniqueOrThrow({
      where: { id: principal.membershipId },
      include: {
        tenant: {
          include: {
            subscription: { include: { plan: true } },
            branches: { where: { status: { not: 'ARCHIVED' } }, orderBy: { createdAt: 'asc' } },
          },
        },
        role: { include: { permissions: true } },
        branches: true,
      },
    });

    const allowedBranchIds = new Set(membership.branches.map((b) => b.branchId));
    const branches = membership.tenant.branches
      .filter((branch) => allowedBranchIds.size === 0 || allowedBranchIds.has(branch.id))
      .map((branch) => ({
        id: branch.id,
        name: branch.name,
        code: branch.code,
        status: branch.status,
        vatRate: branch.vatRate.toFixed(2),
        vatInclusive: branch.vatInclusive,
      }));

    return {
      user: {
        id: principal.userId,
        email: principal.userEmail,
        name: principal.userName,
        platformAdmin: principal.isPlatformAdmin,
      },
      tenant: {
        id: membership.tenant.id,
        name: membership.tenant.name,
        slug: membership.tenant.slug,
        timezone: membership.tenant.timezone,
        currency: membership.tenant.currency,
        status: membership.tenant.status,
      },
      role: membership.role.key as RoleKey,
      permissions: membership.role.permissions.map((p) => p.permissionCode as PermissionCode),
      branches,
      membershipId: membership.id,
      subscription: membership.tenant.subscription
        ? {
            status: membership.tenant.subscription.status,
            plan: membership.tenant.subscription.plan.key,
            planName: membership.tenant.subscription.plan.name,
            trialEndsAt: membership.tenant.subscription.trialEndsAt,
            currentPeriodEnd: membership.tenant.subscription.currentPeriodEnd,
            limits: membership.tenant.subscription.plan.limits,
          }
        : null,
    };
  }

  async switchTenant(userId: string, tenantId: string, currentSessionId: string, actor: ActorContext) {
    const membership = await this.prisma.membership.findFirst({
      where: { userId, tenantId, status: 'ACTIVE', tenant: { status: 'ACTIVE' } },
      include: { user: true },
    });
    if (!membership) {
      throw new UnauthorizedException({ message: 'No access to that restaurant', code: 'FORBIDDEN' });
    }
    // Revoke the current session and issue a new one bound to the new tenant.
    await this.prisma.userSession.update({
      where: { id: currentSessionId },
      data: { revokedAt: new Date(), revokeReason: 'TENANT_SWITCH' },
    });
    const session = await this.createSession(membership.user, tenantId, actor);
    return session;
  }
}
