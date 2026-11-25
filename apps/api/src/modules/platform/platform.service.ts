import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PLANS } from '@tabletap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.module';
import { RedisService } from '../redis/redis.module';
import type { PlatformPrincipal } from '../auth/principal';
import { D, moneyString } from '../../common/money';

@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly redis: RedisService,
  ) {}

  async tenants(search?: string) {
    const tenants = await this.prisma.tenant.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { slug: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {},
      include: {
        subscription: { include: { plan: true } },
        _count: { select: { branches: true, memberships: true, orders: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sales = await this.prisma.bill.groupBy({
      by: ['tenantId'],
      where: { status: 'PAID', paidAt: { gte: since } },
      _sum: { total: true },
    });
    const salesByTenant = new Map(sales.map((row) => [row.tenantId, row._sum.total ?? D(0)]));

    return tenants.map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      createdAt: tenant.createdAt,
      branches: tenant._count.branches,
      members: tenant._count.memberships,
      orders: tenant._count.orders,
      sales30d: moneyString(salesByTenant.get(tenant.id) ?? 0),
      subscription: tenant.subscription
        ? {
            status: tenant.subscription.status,
            plan: tenant.subscription.plan.key,
            planName: tenant.subscription.plan.name,
            trialEndsAt: tenant.subscription.trialEndsAt,
            currentPeriodEnd: tenant.subscription.currentPeriodEnd,
          }
        : null,
    }));
  }

  async tenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        subscription: { include: { plan: true } },
        _count: { select: { branches: true, memberships: true, orders: true } },
      },
    });
    if (!tenant) throw new NotFoundException({ message: 'Tenant not found', code: 'NOT_FOUND' });
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      timezone: tenant.timezone,
      currency: tenant.currency,
      createdAt: tenant.createdAt,
      counts: {
        branches: tenant._count.branches,
        members: tenant._count.memberships,
        orders: tenant._count.orders,
      },
      // Business detail (menu, customers, payments) is intentionally not
      // exposed to platform staff without an explicit membership.
      subscription: tenant.subscription,
    };
  }

  async setTenantStatus(
    actor: PlatformPrincipal,
    tenantId: string,
    status: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED',
    reason: string | undefined,
    requestId?: string,
  ) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException({ message: 'Tenant not found', code: 'NOT_FOUND' });

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.tenant.update({ where: { id: tenantId }, data: { status } });
      if (status !== 'ACTIVE') {
        // Suspension takes effect immediately: every session is revoked.
        await tx.userSession.updateMany({
          where: {
            user: { memberships: { some: { tenantId } } },
            revokedAt: null,
          },
          data: { revokedAt: new Date(), revokeReason: `TENANT_${status}` },
        });
      }
      await this.audit.record(
        {
          tenantId,
          actorId: actor.userId,
          actorType: 'PLATFORM',
          action: `platform.tenant.${status.toLowerCase()}`,
          resourceType: 'Tenant',
          resourceId: tenantId,
          before: { status: tenant.status },
          after: { status },
          reason,
          requestId,
        },
        tx,
      );
      return result;
    });
    return { id: updated.id, status: updated.status };
  }

  async plans() {
    const plans = await this.prisma.subscriptionPlan.findMany({ orderBy: { priceMonthly: 'asc' } });
    return plans.map((plan) => ({
      id: plan.id,
      key: plan.key,
      name: plan.name,
      description: plan.description,
      priceMonthly: moneyString(plan.priceMonthly),
      currency: plan.currency,
      features: plan.features,
      limits: plan.limits,
    }));
  }

  async subscriptions() {
    const subscriptions = await this.prisma.subscription.findMany({
      include: { tenant: { select: { id: true, name: true, slug: true, status: true } }, plan: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return subscriptions.map((subscription) => ({
      id: subscription.id,
      tenant: subscription.tenant,
      plan: subscription.plan.key,
      planName: subscription.plan.name,
      status: subscription.status,
      trialEndsAt: subscription.trialEndsAt,
      currentPeriodEnd: subscription.currentPeriodEnd,
    }));
  }

  async updateSubscription(
    actor: PlatformPrincipal,
    tenantId: string,
    input: {
      planKey?: string;
      status?: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED' | 'EXPIRED';
    },
    requestId?: string,
  ) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });
    if (!subscription) throw new NotFoundException({ message: 'Subscription not found', code: 'NOT_FOUND' });

    let planId = subscription.planId;
    if (input.planKey) {
      const plan = await this.prisma.subscriptionPlan.findUnique({ where: { key: input.planKey } });
      if (!plan) throw new NotFoundException({ message: 'Plan not found', code: 'PLAN_NOT_FOUND' });
      planId = plan.id;
    }

    const updated = await this.prisma.subscription.update({
      where: { tenantId },
      data: {
        planId,
        ...(input.status ? { status: input.status } : {}),
      },
      include: { plan: true },
    });
    await this.audit.record(
      {
        tenantId,
        actorId: actor.userId,
        actorType: 'PLATFORM',
        action: 'platform.subscription.updated',
        resourceType: 'Subscription',
        resourceId: subscription.id,
        before: { plan: subscription.plan.key, status: subscription.status },
        after: { plan: updated.plan.key, status: updated.status },
        requestId,
      },
      this.prisma,
    );
    return { id: updated.id, plan: updated.plan.key, status: updated.status };
  }

  async usage() {
    const tenants = await this.prisma.tenant.findMany({
      include: {
        _count: { select: { branches: true, memberships: true, orders: true } },
        subscription: { include: { plan: true } },
      },
    });
    return tenants.map((tenant) => {
      const limits = (tenant.subscription?.plan.limits ?? {}) as Record<string, number>;
      return {
        tenantId: tenant.id,
        name: tenant.name,
        branches: tenant._count.branches,
        branchLimit: limits.branches ?? null,
        staff: tenant._count.memberships,
        staffLimit: limits.staff ?? null,
        orders: tenant._count.orders,
        orderLimit: limits.monthlyOrders ?? null,
        plan: tenant.subscription?.plan.key ?? null,
        status: tenant.subscription?.status ?? null,
      };
    });
  }

  async auditLogs(limit = 100) {
    const rows = await this.prisma.auditLog.findMany({
      where: { action: { startsWith: 'platform.' } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
    });
    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      actorId: row.actorId,
      actorType: row.actorType,
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      reason: row.reason,
      createdAt: row.createdAt,
    }));
  }

  async systemHealth() {
    const started = Date.now();
    let databaseOk = false;
    let databaseLatency: number | null = null;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      databaseOk = true;
      databaseLatency = Date.now() - started;
    } catch {
      databaseOk = false;
    }

    const redis = await this.redis.ping();
    const [pendingOutbox, failedOutbox] = await Promise.all([
      this.prisma.outboxEvent.count({ where: { status: { in: ['PENDING', 'PROCESSING'] } } }),
      this.prisma.outboxEvent.count({ where: { status: 'FAILED' } }),
    ]);

    const memory = process.memoryUsage();
    return {
      status: databaseOk && redis.ok ? 'healthy' : databaseOk ? 'degraded' : 'unhealthy',
      database: { ok: databaseOk, latencyMs: databaseLatency },
      redis: { ok: redis.ok, latencyMs: redis.latencyMs, error: redis.ok ? undefined : redis.error },
      outbox: { pending: pendingOutbox, failed: failedOutbox },
      process: {
        uptimeSeconds: Math.floor(process.uptime()),
        rssMb: (memory.rss / 1024 / 1024).toFixed(1),
        heapUsedMb: (memory.heapUsed / 1024 / 1024).toFixed(1),
        nodeVersion: process.version,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /** Platform-wide totals, computed from real records only. */
  async dashboard() {
    const [tenants, activeTenants, trialTenants, suspendedTenants, branches, orders, bills] =
      await Promise.all([
        this.prisma.tenant.count(),
        this.prisma.tenant.count({ where: { status: 'ACTIVE' } }),
        this.prisma.subscription.count({ where: { status: 'TRIAL' } }),
        this.prisma.tenant.count({ where: { status: 'SUSPENDED' } }),
        this.prisma.branch.count({ where: { status: { not: 'ARCHIVED' } } }),
        this.prisma.order.count(),
        this.prisma.bill.findMany({ where: { status: 'PAID' }, select: { total: true } }),
      ]);

    const gross = bills.reduce((acc, bill) => acc.plus(bill.total), D(0));
    return {
      tenants,
      activeTenants,
      trialTenants,
      suspendedTenants,
      branches,
      orders,
      paidBills: bills.length,
      grossSalesAllTime: moneyString(gross),
      plansAvailable: PLANS.length,
    };
  }
}
