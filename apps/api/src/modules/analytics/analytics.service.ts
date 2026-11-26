import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { D, moneyString } from '../../common/money';
import { BranchAccessService } from '../tenancy/branch-access.service';
import type { StaffPrincipal } from '../auth/principal';

interface Period {
  from: Date;
  to: Date;
}

const num = (value: unknown): Prisma.Decimal => D((value as string | number | null) ?? 0);

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branches: BranchAccessService,
  ) {}

  private defaultPeriod(from?: string, to?: string): Period {
    const start = from ? new Date(from) : this.bangkokDayStart();
    const end = to ? new Date(to) : new Date(start.getTime() + 24 * 60 * 60 * 1000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error('Invalid period');
    }
    if (end <= start) throw new Error('Period end must be after start');
    return { from: start, to: end };
  }

  /**
   * Midnight in Asia/Bangkok (UTC+7, no DST) for a YYYY-MM-DD key, or for today
   * when no key is supplied. Restaurant days are not the API host's days.
   */
  private bangkokDayStart(date?: string): Date {
    const key =
      date && /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? date
        : new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Bangkok',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(new Date());
    return new Date(`${key}T00:00:00+07:00`);
  }

  /**
   * Definitions (documented in docs/architecture/metrics.md):
   *  grossSales   = sum of bill.total for bills with status PAID and paidAt in range
   *  refunds      = sum of refund.amount created in range
   *  netSales     = grossSales - refunds
   *  aov          = grossSales / number of paid bills
   *  Cancelled orders are never included in sales.
   */
  async overview(principal: StaffPrincipal, query: { branchId?: string; from?: string; to?: string }) {
    const branch = await this.branches.resolve(principal, query.branchId);
    const { from, to } = this.defaultPeriod(query.from, query.to);

    const [salesRows, refundRows, orderRows, sessionRows, itemsRows] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          gross: string;
          vat: string;
          service: string;
          discount: string;
          bills: bigint;
        }>
      >`
        SELECT
          COALESCE(SUM("total"), 0)::text AS gross,
          COALESCE(SUM("taxTotal"), 0)::text AS vat,
          COALESCE(SUM("serviceCharge"), 0)::text AS service,
          COALESCE(SUM("discountTotal"), 0)::text AS discount,
          COUNT(*)::bigint AS bills
        FROM "Bill"
        WHERE "tenantId" = ${principal.tenantId}::uuid
          AND "branchId" = ${branch.id}::uuid
          AND "status" = 'PAID'
          AND "paidAt" >= ${from}
          AND "paidAt" < ${to}
      `,
      this.prisma.$queryRaw<Array<{ refunds: string }>>`
        SELECT COALESCE(SUM(r."amount"), 0)::text AS refunds
        FROM "Refund" r
        JOIN "Payment" p ON p."id" = r."paymentId"
        WHERE p."tenantId" = ${principal.tenantId}::uuid
          AND p."branchId" = ${branch.id}::uuid
          AND r."createdAt" >= ${from}
          AND r."createdAt" < ${to}
      `,
      this.prisma.$queryRaw<Array<{ total: bigint; cancelled: bigint }>>`
        SELECT COUNT(*)::bigint AS total,
               COUNT(*) FILTER (WHERE "status" = 'CANCELLED')::bigint AS cancelled
        FROM "Order"
        WHERE "tenantId" = ${principal.tenantId}::uuid
          AND "branchId" = ${branch.id}::uuid
          AND "createdAt" >= ${from}
          AND "createdAt" < ${to}
      `,
      this.prisma.$queryRaw<Array<{ sessions: bigint }>>`
        SELECT COUNT(*)::bigint AS sessions
        FROM "TableSession"
        WHERE "tenantId" = ${principal.tenantId}::uuid
          AND "branchId" = ${branch.id}::uuid
          AND "openedAt" >= ${from}
          AND "openedAt" < ${to}
      `,
      this.prisma.$queryRaw<Array<{ quantity: bigint }>>`
        SELECT COALESCE(SUM(bi."quantity"), 0)::bigint AS quantity
        FROM "BillItem" bi
        JOIN "Bill" b ON b."id" = bi."billId"
        WHERE b."tenantId" = ${principal.tenantId}::uuid
          AND b."branchId" = ${branch.id}::uuid
          AND b."status" = 'PAID'
          AND b."paidAt" >= ${from}
          AND b."paidAt" < ${to}
      `,
    ]);

    const gross = num(salesRows[0]?.gross);
    const refunds = num(refundRows[0]?.refunds);
    const bills = Number(salesRows[0]?.bills ?? 0);

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      branch: { id: branch.id, name: branch.name },
      grossSales: moneyString(gross),
      refunds: moneyString(refunds),
      netSales: moneyString(gross.minus(refunds)),
      vatTotal: moneyString(salesRows[0]?.vat ?? 0),
      serviceChargeTotal: moneyString(salesRows[0]?.service ?? 0),
      discountTotal: moneyString(salesRows[0]?.discount ?? 0),
      paidBills: bills,
      averageOrderValue: moneyString(bills > 0 ? gross.dividedBy(bills) : 0),
      orders: Number(orderRows[0]?.total ?? 0),
      cancelledOrders: Number(orderRows[0]?.cancelled ?? 0),
      cancellationRate:
        Number(orderRows[0]?.total ?? 0) > 0
          ? ((Number(orderRows[0]?.cancelled ?? 0) / Number(orderRows[0]?.total ?? 1)) * 100).toFixed(1)
          : '0.0',
      tableSessions: Number(sessionRows[0]?.sessions ?? 0),
      itemsSold: Number(itemsRows[0]?.quantity ?? 0),
    };
  }

  async salesSeries(
    principal: StaffPrincipal,
    query: { branchId?: string; from?: string; to?: string; groupBy?: 'day' | 'hour' },
  ) {
    const branch = await this.branches.resolve(principal, query.branchId);
    const { from, to } = this.defaultPeriod(query.from, query.to);
    const groupBy = query.groupBy === 'hour' ? 'hour' : 'day';

    const rows = await this.prisma.$queryRaw<
      Array<{ bucket: string; gross: string; bills: bigint; vat: string }>
    >`
      SELECT
        to_char(date_trunc(${groupBy}, "paidAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Bangkok'), 'YYYY-MM-DD HH24:MI') AS bucket,
        COALESCE(SUM("total"), 0)::text AS gross,
        COALESCE(SUM("taxTotal"), 0)::text AS vat,
        COUNT(*)::bigint AS bills
      FROM "Bill"
      WHERE "tenantId" = ${principal.tenantId}::uuid
        AND "branchId" = ${branch.id}::uuid
        AND "status" = 'PAID'
        AND "paidAt" >= ${from}
        AND "paidAt" < ${to}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    const payments = await this.prisma.$queryRaw<Array<{ method: string; total: string; count: bigint }>>`
      SELECT p."method"::text AS method, COALESCE(SUM(p."amount"), 0)::text AS total, COUNT(*)::bigint AS count
      FROM "Payment" p
      WHERE p."tenantId" = ${principal.tenantId}::uuid
        AND p."branchId" = ${branch.id}::uuid
        AND p."status" = 'PAID'
        AND p."confirmedAt" >= ${from}
        AND p."confirmedAt" < ${to}
      GROUP BY p."method"
    `;

    return {
      groupBy,
      series: rows.map((row) => ({
        bucket: row.bucket,
        gross: moneyString(row.gross),
        vat: moneyString(row.vat),
        bills: Number(row.bills),
      })),
      paymentBreakdown: payments.map((row) => ({
        method: row.method,
        total: moneyString(row.total),
        count: Number(row.count),
      })),
    };
  }

  async menuPerformance(
    principal: StaffPrincipal,
    query: { branchId?: string; from?: string; to?: string; limit?: number },
  ) {
    const branch = await this.branches.resolve(principal, query.branchId);
    const { from, to } = this.defaultPeriod(query.from, query.to);

    const rows = await this.prisma.$queryRaw<
      Array<{
        menuItemId: string;
        name: string;
        quantity: bigint;
        revenue: string;
        cost: string;
      }>
    >`
      SELECT
        oi."menuItemId"::text AS "menuItemId",
        MAX(mi."name") AS name,
        COALESCE(SUM(bi."quantity"), 0)::bigint AS quantity,
        COALESCE(SUM(bi."lineTotal"), 0)::text AS revenue,
        COALESCE(SUM(bi."quantity" * mi."costEstimate"), 0)::text AS cost
      FROM "BillItem" bi
      JOIN "Bill" b ON b."id" = bi."billId"
      JOIN "OrderItem" oi ON oi."id" = bi."orderItemId"
      JOIN "MenuItem" mi ON mi."id" = oi."menuItemId"
      WHERE b."tenantId" = ${principal.tenantId}::uuid
        AND b."branchId" = ${branch.id}::uuid
        AND b."status" = 'PAID'
        AND b."paidAt" >= ${from}
        AND b."paidAt" < ${to}
      GROUP BY oi."menuItemId"
      ORDER BY revenue DESC
      LIMIT ${Math.min(query.limit ?? 50, 200)}
    `;

    return rows.map((row) => {
      const revenue = num(row.revenue);
      const cost = num(row.cost);
      return {
        menuItemId: row.menuItemId,
        name: row.name,
        quantity: Number(row.quantity),
        revenue: moneyString(revenue),
        estimatedCost: moneyString(cost),
        grossMargin: moneyString(revenue.minus(cost)),
        marginPercent: revenue.isZero()
          ? null
          : revenue.minus(cost).dividedBy(revenue).times(100).toDecimalPlaces(1).toFixed(1),
      };
    });
  }

  async operations(principal: StaffPrincipal, query: { branchId?: string; from?: string; to?: string }) {
    const branch = await this.branches.resolve(principal, query.branchId);
    const { from, to } = this.defaultPeriod(query.from, query.to);

    const [prep, queue, requests, stations] = await Promise.all([
      this.prisma.$queryRaw<Array<{ avgSeconds: string | null; tickets: bigint }>>`
        SELECT
          AVG(EXTRACT(EPOCH FROM ("readyAt" - "acceptedAt")))::text AS "avgSeconds",
          COUNT(*)::bigint AS tickets
        FROM "KitchenTicket"
        WHERE "tenantId" = ${principal.tenantId}::uuid
          AND "branchId" = ${branch.id}::uuid
          AND "acceptedAt" IS NOT NULL
          AND "readyAt" IS NOT NULL
          AND "createdAt" >= ${from}
          AND "createdAt" < ${to}
      `,
      this.prisma.$queryRaw<Array<{ avgSeconds: string | null; orders: bigint }>>`
        SELECT
          AVG(EXTRACT(EPOCH FROM ("servedAt" - "createdAt")))::text AS "avgSeconds",
          COUNT(*)::bigint AS orders
        FROM "Order"
        WHERE "tenantId" = ${principal.tenantId}::uuid
          AND "branchId" = ${branch.id}::uuid
          AND "servedAt" IS NOT NULL
          AND "createdAt" >= ${from}
          AND "createdAt" < ${to}
      `,
      this.prisma.$queryRaw<Array<{ type: string; avgSeconds: string | null; count: bigint }>>`
        SELECT "type"::text AS type,
               AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")))::text AS "avgSeconds",
               COUNT(*)::bigint AS count
        FROM "TableRequest"
        WHERE "tenantId" = ${principal.tenantId}::uuid
          AND "branchId" = ${branch.id}::uuid
          AND "createdAt" >= ${from}
          AND "createdAt" < ${to}
        GROUP BY "type"
      `,
      this.prisma.$queryRaw<Array<{ station: string; avgSeconds: string | null; tickets: bigint }>>`
        SELECT ks."name" AS station,
               AVG(EXTRACT(EPOCH FROM (kt."readyAt" - kt."acceptedAt")))::text AS "avgSeconds",
               COUNT(*)::bigint AS tickets
        FROM "KitchenTicket" kt
        JOIN "KitchenStation" ks ON ks."id" = kt."stationId"
        WHERE kt."tenantId" = ${principal.tenantId}::uuid
          AND kt."branchId" = ${branch.id}::uuid
          AND kt."readyAt" IS NOT NULL
          AND kt."createdAt" >= ${from}
          AND kt."createdAt" < ${to}
        GROUP BY ks."name"
        ORDER BY tickets DESC
      `,
    ]);

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      averagePrepSeconds: prep[0]?.avgSeconds ? Number(prep[0].avgSeconds).toFixed(0) : null,
      ticketsMeasured: Number(prep[0]?.tickets ?? 0),
      averageOrderCompletionSeconds: queue[0]?.avgSeconds ? Number(queue[0].avgSeconds).toFixed(0) : null,
      ordersMeasured: Number(queue[0]?.orders ?? 0),
      requests: requests.map((row) => ({
        type: row.type,
        count: Number(row.count),
        averageResolutionSeconds: row.avgSeconds ? Number(row.avgSeconds).toFixed(0) : null,
      })),
      stations: stations.map((row) => ({
        station: row.station,
        tickets: Number(row.tickets),
        averageReadySeconds: row.avgSeconds ? Number(row.avgSeconds).toFixed(0) : null,
      })),
    };
  }

  async branchComparison(principal: StaffPrincipal, query: { from?: string; to?: string }) {
    const allowed = await this.branches.allowedBranchIds(principal);
    const { from, to } = this.defaultPeriod(query.from, query.to);

    const rows = await this.prisma.$queryRaw<
      Array<{ branchId: string; name: string; gross: string; bills: bigint; vat: string }>
    >`
      SELECT b."branchId"::text AS "branchId",
             br."name" AS name,
             COALESCE(SUM(b."total"), 0)::text AS gross,
             COALESCE(SUM(b."taxTotal"), 0)::text AS vat,
             COUNT(*)::bigint AS bills
      FROM "Bill" b
      JOIN "Branch" br ON br."id" = b."branchId"
      WHERE b."tenantId" = ${principal.tenantId}::uuid
        AND b."status" = 'PAID'
        AND b."branchId"::text = ANY(${allowed}::text[])
        AND b."paidAt" >= ${from}
        AND b."paidAt" < ${to}
      GROUP BY b."branchId", br."name"
      ORDER BY gross DESC
    `;

    return rows.map((row) => ({
      branchId: row.branchId,
      name: row.name,
      grossSales: moneyString(row.gross),
      vat: moneyString(row.vat),
      paidBills: Number(row.bills),
    }));
  }

  /**
   * End-of-day reconciliation for one restaurant day (Asia/Bangkok).
   * Everything here is derived from bills, payments, refunds and sessions that
   * were already written; nothing is stored separately, so re-running it is safe.
   */
  async dayClose(principal: StaffPrincipal, query: { branchId?: string; date?: string }) {
    const branch = await this.branches.resolve(principal, query.branchId);
    const from = this.bangkokDayStart(query.date);
    const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
    const businessDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(from);

    const [salesRows, refundRows, orderRows, paymentRows, openBills, openSessions] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{ gross: string; vat: string; service: string; discount: string; bills: bigint }>
      >`
        SELECT
          COALESCE(SUM("total"), 0)::text AS gross,
          COALESCE(SUM("taxTotal"), 0)::text AS vat,
          COALESCE(SUM("serviceCharge"), 0)::text AS service,
          COALESCE(SUM("discountTotal"), 0)::text AS discount,
          COUNT(*)::bigint AS bills
        FROM "Bill"
        WHERE "tenantId" = ${principal.tenantId}::uuid
          AND "branchId" = ${branch.id}::uuid
          AND "status" = 'PAID'
          AND "paidAt" >= ${from}
          AND "paidAt" < ${to}
      `,
      this.prisma.$queryRaw<Array<{ refunds: string }>>`
        SELECT COALESCE(SUM(r."amount"), 0)::text AS refunds
        FROM "Refund" r
        JOIN "Payment" p ON p."id" = r."paymentId"
        WHERE p."tenantId" = ${principal.tenantId}::uuid
          AND p."branchId" = ${branch.id}::uuid
          AND r."createdAt" >= ${from}
          AND r."createdAt" < ${to}
      `,
      this.prisma.$queryRaw<Array<{ total: bigint; cancelled: bigint }>>`
        SELECT COUNT(*)::bigint AS total,
               COUNT(*) FILTER (WHERE "status" = 'CANCELLED')::bigint AS cancelled
        FROM "Order"
        WHERE "tenantId" = ${principal.tenantId}::uuid
          AND "branchId" = ${branch.id}::uuid
          AND "createdAt" >= ${from}
          AND "createdAt" < ${to}
      `,
      this.prisma.$queryRaw<Array<{ method: string; total: string; count: bigint }>>`
        SELECT p."method"::text AS method,
               COALESCE(SUM(p."amountPaid"), 0)::text AS total,
               COUNT(*)::bigint AS count
        FROM "Payment" p
        WHERE p."tenantId" = ${principal.tenantId}::uuid
          AND p."branchId" = ${branch.id}::uuid
          AND p."status" IN ('PAID', 'REFUNDED', 'PARTIALLY_REFUNDED')
          AND p."confirmedAt" >= ${from}
          AND p."confirmedAt" < ${to}
        GROUP BY 1
        ORDER BY total DESC
      `,
      this.prisma.bill.aggregate({
        where: {
          tenantId: principal.tenantId,
          branchId: branch.id,
          status: { in: ['OPEN', 'PARTIALLY_PAID'] },
        },
        _count: { _all: true },
        _sum: { total: true, paidTotal: true },
      }),
      this.prisma.tableSession.count({
        where: { tenantId: principal.tenantId, branchId: branch.id, closedAt: null },
      }),
    ]);

    const gross = num(salesRows[0]?.gross);
    const refunds = num(refundRows[0]?.refunds);
    const bills = Number(salesRows[0]?.bills ?? 0);
    const payments = paymentRows.map((row) => ({
      method: row.method,
      total: moneyString(row.total),
      count: Number(row.count),
    }));
    const cashCollected = paymentRows
      .filter((row) => row.method === 'CASH')
      .reduce((acc, row) => acc.plus(D(row.total)), D(0));
    const openDue = D(openBills._sum.total ?? 0).minus(D(openBills._sum.paidTotal ?? 0));

    return {
      businessDate,
      timezone: 'Asia/Bangkok',
      period: { from: from.toISOString(), to: to.toISOString() },
      branch: { id: branch.id, name: branch.name },
      grossSales: moneyString(gross),
      refunds: moneyString(refunds),
      netSales: moneyString(gross.minus(refunds)),
      vat: moneyString(salesRows[0]?.vat ?? 0),
      serviceCharge: moneyString(salesRows[0]?.service ?? 0),
      discounts: moneyString(salesRows[0]?.discount ?? 0),
      paidBills: bills,
      averageBill: moneyString(bills > 0 ? gross.dividedBy(bills) : 0),
      orders: Number(orderRows[0]?.total ?? 0),
      cancelledOrders: Number(orderRows[0]?.cancelled ?? 0),
      payments,
      cashCollected: moneyString(cashCollected),
      openBills: { count: openBills._count._all, due: moneyString(openDue) },
      openSessions,
    };
  }
}
