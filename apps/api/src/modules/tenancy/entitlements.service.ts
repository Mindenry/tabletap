import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { getPlan, planHasFeature, type FeatureKey, type PlanLimits } from '@tabletap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { env } from '../../config/env';

export interface EntitlementSummary {
  plan: string;
  status: string;
  mode: 'development' | 'enforced';
  limits: PlanLimits;
  usage: { branches: number; staff: number; monthlyOrders: number };
}

/**
 * Server-side subscription enforcement. In development mode every feature is
 * available so the whole product can be demonstrated; in enforced mode the plan
 * limits and feature flags are real and cannot be bypassed from the client.
 */
@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(tenantId: string): Promise<EntitlementSummary> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });
    if (!subscription) {
      throw new NotFoundException({ message: 'Subscription not configured', code: 'NO_SUBSCRIPTION' });
    }
    const plan = getPlan(subscription.plan.key);
    const limits = (plan?.limits ?? {
      branches: 1,
      staff: 1,
      monthlyOrders: 0,
      storageMb: 0,
    }) as PlanLimits;

    const periodStart = new Date();
    periodStart.setUTCDate(1);
    periodStart.setUTCHours(0, 0, 0, 0);

    const [branches, staff, monthlyOrders] = await Promise.all([
      this.prisma.branch.count({ where: { tenantId, status: { not: 'ARCHIVED' } } }),
      this.prisma.membership.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.prisma.order.count({ where: { tenantId, createdAt: { gte: periodStart } } }),
    ]);

    return {
      plan: subscription.plan.key,
      status: subscription.status,
      mode: env.subscriptionMode,
      limits,
      usage: { branches, staff, monthlyOrders },
    };
  }

  async assertFeature(tenantId: string, feature: FeatureKey): Promise<void> {
    if (env.subscriptionMode === 'development') return;
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });
    if (!subscription) {
      throw new ForbiddenException({ message: 'No active subscription', code: 'SUBSCRIPTION_REQUIRED' });
    }
    if (!['TRIAL', 'ACTIVE'].includes(subscription.status)) {
      throw new ForbiddenException({
        message: 'Subscription is not active',
        code: 'SUBSCRIPTION_INACTIVE',
        details: { status: subscription.status },
      });
    }
    if (!planHasFeature(subscription.plan.key, feature)) {
      throw new ForbiddenException({
        message: `Your plan does not include ${feature.replace(/_/g, ' ')}`,
        code: 'FEATURE_NOT_IN_PLAN',
        details: { feature, plan: subscription.plan.key },
      });
    }
  }

  async assertCanAddBranch(tenantId: string): Promise<void> {
    if (env.subscriptionMode === 'development') return;
    const summary = await this.summary(tenantId);
    if (summary.usage.branches >= summary.limits.branches) {
      throw new ForbiddenException({
        message: `Your plan allows ${summary.limits.branches} branch(es). Upgrade to add more.`,
        code: 'PLAN_LIMIT_BRANCHES',
      });
    }
  }

  async assertCanAddStaff(tenantId: string): Promise<void> {
    if (env.subscriptionMode === 'development') return;
    const summary = await this.summary(tenantId);
    if (summary.usage.staff >= summary.limits.staff) {
      throw new ForbiddenException({
        message: `Your plan allows ${summary.limits.staff} staff account(s). Upgrade to add more.`,
        code: 'PLAN_LIMIT_STAFF',
      });
    }
  }
}
