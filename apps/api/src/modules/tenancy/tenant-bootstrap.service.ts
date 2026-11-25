import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  PLANS,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  type RoleKey,
} from '@tabletap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

type Tx = Prisma.TransactionClient;

const TENANT_ROLES: RoleKey[] = ['OWNER', 'MANAGER', 'CASHIER', 'KITCHEN', 'WAITER', 'VIEWER'];

/**
 * Creates the per-tenant scaffolding: permission catalogue, system roles with
 * their permission grants, and subscription plans. Idempotent so it can run at
 * seed time and at registration time.
 */
@Injectable()
export class TenantBootstrapService {
  constructor(private readonly prisma: PrismaService) {}

  async ensurePermissionCatalogue(tx: Tx = this.prisma): Promise<void> {
    for (const permission of PERMISSIONS) {
      await tx.permission.upsert({
        where: { code: permission.code },
        create: {
          code: permission.code,
          description: permission.description,
          category: permission.category,
        },
        update: { description: permission.description, category: permission.category },
      });
    }
  }

  async ensurePlans(tx: Tx = this.prisma): Promise<void> {
    for (const plan of PLANS) {
      await tx.subscriptionPlan.upsert({
        where: { key: plan.key },
        create: {
          key: plan.key,
          name: plan.name,
          description: plan.description,
          priceMonthly: new Prisma.Decimal(plan.priceMonthly),
          currency: plan.currency,
          features: plan.features,
          limits: plan.limits as unknown as Prisma.InputJsonValue,
        },
        update: {
          name: plan.name,
          description: plan.description,
          priceMonthly: new Prisma.Decimal(plan.priceMonthly),
          features: plan.features,
          limits: plan.limits as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }

  async createDefaultRoles(tx: Tx, tenantId: string): Promise<Record<string, string>> {
    await this.ensurePermissionCatalogue(tx);
    const roleIds: Record<string, string> = {};
    for (const role of TENANT_ROLES) {
      const created = await tx.role.create({
        data: {
          tenantId,
          key: role,
          name: ROLE_LABELS[role].en,
          isSystem: true,
        },
      });
      roleIds[role] = created.id;
      const permissions = ROLE_PERMISSIONS[role];
      if (permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: permissions.map((permissionCode) => ({ roleId: created.id, permissionCode })),
          skipDuplicates: true,
        });
      }
    }
    // Every tenant must keep at least one role holding the full permission set.
    const ownerPermissions = new Set(ROLE_PERMISSIONS.OWNER);
    if (ownerPermissions.size !== ALL_PERMISSIONS.length) {
      throw new Error('Owner role definition is incomplete');
    }
    return roleIds;
  }

  async createSubscription(tx: Tx, tenantId: string, planKey = 'GROWTH'): Promise<void> {
    await this.ensurePlans(tx);
    const plan = await tx.subscriptionPlan.findUniqueOrThrow({ where: { key: planKey } });
    const now = new Date();
    await tx.subscription.create({
      data: {
        tenantId,
        planId: plan.id,
        status: 'TRIAL',
        trialEndsAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  }
}
