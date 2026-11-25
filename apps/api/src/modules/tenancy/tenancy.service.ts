import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { RoleKey } from '@tabletap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { hashSecret, randomToken } from '../../common/crypto';
import { env } from '../../config/env';
import { AuditService } from '../audit/audit.module';
import { MailService } from '../mail/mail.module';
import type { StaffPrincipal } from '../auth/principal';
import { paginate } from '../../common/pagination.dto';
import { BranchAccessService } from './branch-access.service';
import { EntitlementsService } from './entitlements.service';
import type {
  CreateBranchDto,
  InviteStaffDto,
  UpdateBranchDto,
  UpdateStaffDto,
  UpdateTenantDto,
} from './tenancy.dto';

export interface ActorMeta {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

@Injectable()
export class TenancyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly branches: BranchAccessService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async tenant(principal: StaffPrincipal) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: principal.tenantId },
      include: {
        subscription: { include: { plan: true } },
        _count: { select: { branches: true, memberships: true } },
      },
    });
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      logoUrl: tenant.logoUrl,
      phone: tenant.phone,
      email: tenant.email,
      address: tenant.address,
      taxId: tenant.taxId,
      timezone: tenant.timezone,
      currency: tenant.currency,
      language: tenant.language,
      subscription: tenant.subscription
        ? {
            status: tenant.subscription.status,
            plan: tenant.subscription.plan.key,
            planName: tenant.subscription.plan.name,
            trialEndsAt: tenant.subscription.trialEndsAt,
            currentPeriodEnd: tenant.subscription.currentPeriodEnd,
          }
        : null,
      counts: tenant._count,
    };
  }

  async updateTenant(principal: StaffPrincipal, dto: UpdateTenantDto, actor: ActorMeta) {
    const before = await this.prisma.tenant.findUniqueOrThrow({ where: { id: principal.tenantId } });
    const updated = await this.prisma.tenant.update({
      where: { id: principal.tenantId },
      data: dto,
    });
    await this.audit.record(
      {
        tenantId: principal.tenantId,
        actorId: principal.userId,
        action: 'restaurant.updated',
        resourceType: 'Tenant',
        resourceId: updated.id,
        before: { name: before.name, phone: before.phone, address: before.address },
        after: { name: updated.name, phone: updated.phone, address: updated.address },
        requestId: actor.requestId,
        ipAddress: actor.ipAddress,
      },
      this.prisma,
    );
    return updated;
  }

  async listBranches(principal: StaffPrincipal) {
    const allowed = await this.branches.allowedBranchIds(principal);
    const branches = await this.prisma.branch.findMany({
      where: { tenantId: principal.tenantId, id: { in: allowed } },
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { tables: true } },
      },
    });

    const openSessions = await this.prisma.tableSession.groupBy({
      by: ['branchId'],
      where: {
        branchId: { in: branches.map((b) => b.id) },
        status: { in: ['OPEN', 'BILL_REQUESTED', 'PAYMENT_PENDING'] },
      },
      _count: { _all: true },
    });
    const sessionCounts = new Map(openSessions.map((row) => [row.branchId, row._count._all]));

    return branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      code: branch.code,
      status: branch.status,
      address: branch.address,
      phone: branch.phone,
      timezone: branch.timezone,
      currency: branch.currency,
      vatRate: branch.vatRate.toFixed(2),
      vatInclusive: branch.vatInclusive,
      serviceChargeEnabled: branch.serviceChargeEnabled,
      serviceChargeType: branch.serviceChargeType,
      serviceChargeValue: branch.serviceChargeValue.toFixed(2),
      promptPayId: branch.promptPayId,
      tableCount: branch._count.tables,
      openSessions: sessionCounts.get(branch.id) ?? 0,
    }));
  }

  async createBranch(principal: StaffPrincipal, dto: CreateBranchDto, actor: ActorMeta) {
    await this.entitlements.assertCanAddBranch(principal.tenantId);
    const duplicate = await this.prisma.branch.findUnique({
      where: { tenantId_code: { tenantId: principal.tenantId, code: dto.code } },
    });
    if (duplicate) {
      throw new ConflictException({ message: 'Branch code already used', code: 'BRANCH_CODE_TAKEN' });
    }
    const branch = await this.prisma.branch.create({
      data: {
        tenantId: principal.tenantId,
        name: dto.name,
        code: dto.code,
        address: dto.address,
        phone: dto.phone,
        timezone: dto.timezone ?? env.defaultTimezone,
        currency: dto.currency ?? env.defaultCurrency,
        vatRate: new Prisma.Decimal(dto.vatRate ?? env.defaultVatRate),
        vatInclusive: dto.vatInclusive ?? true,
        serviceChargeEnabled: dto.serviceChargeEnabled ?? false,
        serviceChargeType: dto.serviceChargeType ?? 'PERCENT',
        serviceChargeValue: new Prisma.Decimal(dto.serviceChargeValue ?? 0),
        promptPayId: dto.promptPayId,
        receiptHeader: dto.receiptHeader,
        receiptFooter: dto.receiptFooter,
        status: dto.status ?? 'ACTIVE',
      },
    });

    // Give the new branch a hot-kitchen station so orders can be routed
    // immediately, and grant the creating owner access to it.
    await this.prisma.kitchenStation.create({
      data: { branchId: branch.id, code: 'HOT_KITCHEN', name: 'Hot kitchen' },
    });
    if (principal.branchIds.length > 0) {
      await this.prisma.membershipBranch.create({
        data: { membershipId: principal.membershipId, branchId: branch.id },
      });
    }

    await this.audit.record(
      {
        tenantId: principal.tenantId,
        branchId: branch.id,
        actorId: principal.userId,
        action: 'branch.created',
        resourceType: 'Branch',
        resourceId: branch.id,
        after: { name: branch.name, code: branch.code },
        requestId: actor.requestId,
      },
      this.prisma,
    );
    return branch;
  }

  async getBranch(principal: StaffPrincipal, branchId: string) {
    const branch = await this.branches.load(principal, branchId);
    const [zones, stations, counts] = await Promise.all([
      this.prisma.tableZone.findMany({ where: { branchId }, orderBy: { displayOrder: 'asc' } }),
      this.prisma.kitchenStation.findMany({ where: { branchId }, orderBy: { displayOrder: 'asc' } }),
      this.prisma.diningTable.count({ where: { branchId, archivedAt: null } }),
    ]);
    return {
      ...branch,
      vatRate: branch.vatRate.toFixed(2),
      serviceChargeValue: branch.serviceChargeValue.toFixed(2),
      zones,
      stations,
      tableCount: counts,
    };
  }

  async updateBranch(principal: StaffPrincipal, branchId: string, dto: UpdateBranchDto, actor: ActorMeta) {
    const before = await this.branches.load(principal, branchId);

    if (dto.status === 'ARCHIVED') {
      const activeSessions = await this.prisma.tableSession.count({
        where: { branchId, status: { in: ['OPEN', 'BILL_REQUESTED', 'PAYMENT_PENDING'] } },
      });
      if (activeSessions > 0) {
        throw new BadRequestException({
          message: 'Close all open table sessions before archiving this branch',
          code: 'BRANCH_HAS_OPEN_SESSIONS',
        });
      }
      const otherActive = await this.prisma.branch.count({
        where: { tenantId: principal.tenantId, status: 'ACTIVE', id: { not: branchId } },
      });
      if (otherActive === 0) {
        throw new BadRequestException({
          message: 'A restaurant needs at least one active branch',
          code: 'LAST_BRANCH',
        });
      }
    }

    const updated = await this.prisma.branch.update({
      where: { id: branchId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.vatRate !== undefined ? { vatRate: new Prisma.Decimal(dto.vatRate) } : {}),
        ...(dto.vatInclusive !== undefined ? { vatInclusive: dto.vatInclusive } : {}),
        ...(dto.serviceChargeEnabled !== undefined ? { serviceChargeEnabled: dto.serviceChargeEnabled } : {}),
        ...(dto.serviceChargeType !== undefined ? { serviceChargeType: dto.serviceChargeType } : {}),
        ...(dto.serviceChargeValue !== undefined
          ? { serviceChargeValue: new Prisma.Decimal(dto.serviceChargeValue) }
          : {}),
        ...(dto.promptPayId !== undefined ? { promptPayId: dto.promptPayId || null } : {}),
        ...(dto.receiptHeader !== undefined ? { receiptHeader: dto.receiptHeader } : {}),
        ...(dto.receiptFooter !== undefined ? { receiptFooter: dto.receiptFooter } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });

    await this.audit.record(
      {
        tenantId: principal.tenantId,
        branchId,
        actorId: principal.userId,
        action: 'branch.updated',
        resourceType: 'Branch',
        resourceId: branchId,
        before: {
          name: before.name,
          vatRate: before.vatRate.toFixed(2),
          serviceChargeValue: before.serviceChargeValue.toFixed(2),
          status: before.status,
        },
        after: {
          name: updated.name,
          vatRate: updated.vatRate.toFixed(2),
          serviceChargeValue: updated.serviceChargeValue.toFixed(2),
          status: updated.status,
        },
        reason:
          dto.vatRate !== undefined && !before.vatRate.equals(updated.vatRate)
            ? 'Tax rate changed'
            : undefined,
        requestId: actor.requestId,
      },
      this.prisma,
    );
    return updated;
  }

  async listStaff(principal: StaffPrincipal) {
    const memberships = await this.prisma.membership.findMany({
      where: { tenantId: principal.tenantId },
      include: {
        user: { select: { id: true, email: true, name: true, phone: true, status: true, lastLoginAt: true } },
        role: true,
        branches: { include: { branch: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((membership) => ({
      id: membership.id,
      userId: membership.userId,
      name: membership.user.name,
      email: membership.user.email,
      phone: membership.user.phone,
      accountStatus: membership.user.status,
      status: membership.status,
      role: membership.role.key as RoleKey,
      roleName: membership.role.name,
      branches: membership.branches.map((b) => b.branch),
      lastLoginAt: membership.user.lastLoginAt,
      createdAt: membership.createdAt,
    }));
  }

  async listInvitations(principal: StaffPrincipal) {
    const invitations = await this.prisma.invitation.findMany({
      where: { tenantId: principal.tenantId },
      include: { role: true },
      orderBy: { createdAt: 'desc' },
    });
    return invitations.map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role.key,
      branchIds: invitation.branchIds,
      expiresAt: invitation.expiresAt,
      acceptedAt: invitation.acceptedAt,
      revokedAt: invitation.revokedAt,
      createdAt: invitation.createdAt,
      status: invitation.acceptedAt
        ? 'ACCEPTED'
        : invitation.revokedAt
          ? 'REVOKED'
          : invitation.expiresAt.getTime() < Date.now()
            ? 'EXPIRED'
            : 'PENDING',
    }));
  }

  async inviteStaff(principal: StaffPrincipal, dto: InviteStaffDto, actor: ActorMeta) {
    await this.entitlements.assertCanAddStaff(principal.tenantId);

    if (dto.role === 'OWNER' && principal.role !== 'OWNER') {
      throw new ForbiddenException({ message: 'Only an owner can invite another owner', code: 'FORBIDDEN' });
    }

    for (const branchId of dto.branchIds) {
      await this.branches.load(principal, branchId);
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { memberships: { where: { tenantId: principal.tenantId } } },
    });
    if (existingUser && existingUser.memberships.length > 0) {
      throw new ConflictException({ message: 'This person is already a member', code: 'ALREADY_MEMBER' });
    }

    const role = await this.prisma.role.findUnique({
      where: { tenantId_key: { tenantId: principal.tenantId, key: dto.role as RoleKey } },
    });
    if (!role) throw new NotFoundException({ message: 'Role not found', code: 'ROLE_NOT_FOUND' });

    const pending = await this.prisma.invitation.findFirst({
      where: {
        tenantId: principal.tenantId,
        email: dto.email,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (pending) {
      throw new ConflictException({
        message: 'An invitation is already pending for this email',
        code: 'INVITATION_PENDING',
      });
    }

    const token = randomToken(32);
    const invitation = await this.prisma.invitation.create({
      data: {
        tenantId: principal.tenantId,
        email: dto.email,
        roleId: role.id,
        branchIds: dto.branchIds,
        tokenHash: hashSecret(token),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        invitedById: principal.userId,
      },
    });

    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: principal.tenantId } });
    const delivered = await this.mail.sendInvitation({
      to: dto.email,
      tenantName: tenant.name,
      roleName: role.name,
      token,
    });

    await this.audit.record(
      {
        tenantId: principal.tenantId,
        actorId: principal.userId,
        action: 'staff.invited',
        resourceType: 'Invitation',
        resourceId: invitation.id,
        after: { email: dto.email, role: dto.role, branchIds: dto.branchIds },
        requestId: actor.requestId,
      },
      this.prisma,
    );

    return {
      id: invitation.id,
      email: invitation.email,
      role: dto.role,
      expiresAt: invitation.expiresAt,
      emailDelivered: delivered,
      // The token is only echoed in development so the flow can be tested
      // without a mail client. In production it is delivered by email only.
      ...(env.isProduction ? {} : { acceptUrl: `${env.webUrl}/accept-invitation?token=${token}` }),
    };
  }

  async updateStaff(principal: StaffPrincipal, membershipId: string, dto: UpdateStaffDto, actor: ActorMeta) {
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, tenantId: principal.tenantId },
      include: { role: true, user: true, branches: true },
    });
    if (!membership) throw new NotFoundException({ message: 'Staff member not found', code: 'NOT_FOUND' });

    if (membership.role.key === 'OWNER' && dto.role !== undefined && dto.role !== 'OWNER') {
      const owners = await this.prisma.membership.count({
        where: { tenantId: principal.tenantId, status: 'ACTIVE', role: { key: 'OWNER' } },
      });
      if (owners <= 1) {
        throw new BadRequestException({
          message: 'A restaurant must keep at least one active owner',
          code: 'LAST_OWNER',
        });
      }
    }
    if (dto.role === 'OWNER' && principal.role !== 'OWNER') {
      throw new ForbiddenException({ message: 'Only an owner can grant owner access', code: 'FORBIDDEN' });
    }

    let roleId: string | undefined;
    if (dto.role) {
      const role = await this.prisma.role.findUnique({
        where: { tenantId_key: { tenantId: principal.tenantId, key: dto.role as RoleKey } },
      });
      if (!role) throw new NotFoundException({ message: 'Role not found', code: 'ROLE_NOT_FOUND' });
      roleId = role.id;
    }

    if (dto.branchIds) {
      for (const branchId of dto.branchIds) {
        await this.branches.load(principal, branchId);
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.membership.update({
        where: { id: membershipId },
        data: {
          ...(roleId ? { roleId } : {}),
          ...(dto.status ? { status: dto.status } : {}),
        },
      });
      if (dto.branchIds) {
        await tx.membershipBranch.deleteMany({ where: { membershipId } });
        if (dto.branchIds.length > 0) {
          await tx.membershipBranch.createMany({
            data: dto.branchIds.map((branchId) => ({ membershipId, branchId })),
          });
        }
      }
      if (dto.status === 'DEACTIVATED') {
        await tx.userSession.updateMany({
          where: { userId: membership.userId, revokedAt: null },
          data: { revokedAt: new Date(), revokeReason: 'MEMBERSHIP_DEACTIVATED' },
        });
      }
      return result;
    });

    await this.audit.record(
      {
        tenantId: principal.tenantId,
        actorId: principal.userId,
        action: dto.status === 'DEACTIVATED' ? 'staff.deactivated' : 'staff.updated',
        resourceType: 'Membership',
        resourceId: membershipId,
        before: {
          role: membership.role.key,
          status: membership.status,
          branches: membership.branches.length,
        },
        after: { role: dto.role ?? membership.role.key, status: updated.status },
        requestId: actor.requestId,
        reason: dto.status === 'DEACTIVATED' ? 'Staff deactivated' : undefined,
      },
      this.prisma,
    );
    return updated;
  }

  async revokeInvitation(principal: StaffPrincipal, invitationId: string, actor: ActorMeta) {
    const invitation = await this.prisma.invitation.findFirst({
      where: { id: invitationId, tenantId: principal.tenantId },
    });
    if (!invitation) throw new NotFoundException({ message: 'Invitation not found', code: 'NOT_FOUND' });
    if (invitation.acceptedAt) {
      throw new BadRequestException({ message: 'Invitation already accepted', code: 'INVITATION_ACCEPTED' });
    }
    const updated = await this.prisma.invitation.update({
      where: { id: invitationId },
      data: { revokedAt: new Date() },
    });
    await this.audit.record(
      {
        tenantId: principal.tenantId,
        actorId: principal.userId,
        action: 'staff.invitation.revoked',
        resourceType: 'Invitation',
        resourceId: invitationId,
        requestId: actor.requestId,
      },
      this.prisma,
    );
    return updated;
  }

  async listAuditLogs(
    principal: StaffPrincipal,
    query: { page: number; pageSize: number; search?: string; action?: string; branchId?: string },
  ) {
    const where: Prisma.AuditLogWhereInput = {
      tenantId: principal.tenantId,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.action ? { action: { contains: query.action } } : {}),
      ...(query.search
        ? {
            OR: [
              { action: { contains: query.search, mode: 'insensitive' } },
              { resourceType: { contains: query.search, mode: 'insensitive' } },
              { actor: { name: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return paginate(
      rows.map((row) => ({
        id: row.id,
        action: row.action,
        actorType: row.actorType,
        actor: row.actor ? { id: row.actor.id, name: row.actor.name, email: row.actor.email } : null,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        branchId: row.branchId,
        before: row.before,
        after: row.after,
        reason: row.reason,
        requestId: row.requestId,
        createdAt: row.createdAt,
      })),
      total,
      query.page,
      query.pageSize,
    );
  }
}
