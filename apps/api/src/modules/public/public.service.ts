import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CatalogService } from '../catalog/catalog.service';
import { OrdersService } from '../orders/orders.service';
import { OutboxService } from '../realtime/outbox.service';
import { AuditService } from '../audit/audit.module';
import { hashSecret, randomToken } from '../../common/crypto';
import { moneyString } from '../../common/money';
import { env } from '../../config/env';
import { ActorMeta } from '../../common/actor';
import type { CustomerPrincipal } from '../auth/principal';
import type { CreateOrderDto } from '../orders/orders.dto';

interface ResolvedQr {
  tokenId: string;
  tableId: string;
  tableNumber: string;
  tableName: string | null;
  branchId: string;
  branchName: string;
  tenantId: string;
  tenantName: string;
  tenantLogoUrl: string | null;
  timezone: string;
  currency: string;
}

@Injectable()
export class PublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly orders: OrdersService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  /** Resolves a QR token to its table, branch and restaurant. */
  async resolveQr(rawToken: string): Promise<ResolvedQr> {
    if (!rawToken || rawToken.length < 16 || rawToken.length > 128) {
      throw new NotFoundException({ message: 'This QR code is not valid', code: 'QR_INVALID' });
    }
    const token = await this.prisma.tableQrToken.findUnique({
      where: { tokenHash: hashSecret(rawToken) },
      include: {
        table: {
          include: {
            branch: { include: { tenant: true } },
          },
        },
      },
    });
    if (!token || token.status !== 'ACTIVE') {
      throw new NotFoundException({ message: 'This QR code is no longer active', code: 'QR_INACTIVE' });
    }
    const branch = token.table.branch;
    const tenant = branch.tenant;
    if (branch.status !== 'ACTIVE') {
      throw new ForbiddenException({
        message: 'This branch is not accepting orders',
        code: 'BRANCH_INACTIVE',
      });
    }
    if (tenant.status !== 'ACTIVE') {
      throw new ForbiddenException({ message: 'This restaurant is not available', code: 'TENANT_INACTIVE' });
    }

    return {
      tokenId: token.id,
      tableId: token.tableId,
      tableNumber: token.table.number,
      tableName: token.table.name,
      branchId: branch.id,
      branchName: branch.name,
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantLogoUrl: tenant.logoUrl,
      timezone: branch.timezone,
      currency: branch.currency,
    };
  }

  /** Public QR landing payload: restaurant identity plus the live menu. */
  async qrLanding(rawToken: string) {
    const resolved = await this.resolveQr(rawToken);
    const [menu, liveSession] = await Promise.all([
      this.catalog.publicMenu(resolved.tenantId, resolved.branchId),
      this.prisma.tableSession.findFirst({
        where: { tableId: resolved.tableId, status: { in: ['OPEN', 'BILL_REQUESTED', 'PAYMENT_PENDING'] } },
        select: { id: true, status: true, guestCount: true, openedAt: true },
      }),
    ]);

    return {
      restaurant: {
        name: resolved.tenantName,
        logoUrl: resolved.tenantLogoUrl,
        branch: resolved.branchName,
        currency: resolved.currency,
        timezone: resolved.timezone,
      },
      table: {
        id: resolved.tableId,
        number: resolved.tableNumber,
        name: resolved.tableName,
      },
      session: liveSession,
      menu,
    };
  }

  /**
   * Issues a scoped customer session. If the table has no live session one is
   * opened (the QR is on the table, so a scan is a legitimate seating signal).
   * The returned token is signed by the API and stored as an HttpOnly cookie by
   * the controller; it authorises only this table's customer endpoints.
   */
  async createCustomerSession(
    rawToken: string,
    input: { guestLabel?: string; guestCount?: number },
    actor: ActorMeta,
  ) {
    const resolved = await this.resolveQr(rawToken);

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "DiningTable" WHERE id = ${resolved.tableId}::uuid FOR UPDATE`;

      let tableSession = await tx.tableSession.findFirst({
        where: { tableId: resolved.tableId, status: { in: ['OPEN', 'BILL_REQUESTED'] } },
      });

      if (!tableSession) {
        const blocked = await tx.tableSession.findFirst({
          where: { tableId: resolved.tableId, status: 'PAYMENT_PENDING' },
        });
        if (blocked) {
          throw new ConflictException({
            message: 'This table is settling the bill. Please ask staff for help.',
            code: 'TABLE_PAYMENT_PENDING',
          });
        }
        tableSession = await tx.tableSession.create({
          data: {
            tenantId: resolved.tenantId,
            branchId: resolved.branchId,
            tableId: resolved.tableId,
            status: 'OPEN',
            guestCount: input.guestCount ?? 0,
            note: 'Opened by QR scan',
          },
        });
        await tx.diningTable.update({
          where: { id: resolved.tableId },
          data: { status: 'OCCUPIED' },
        });
        await this.outbox.append(tx, {
          tenantId: resolved.tenantId,
          branchId: resolved.branchId,
          eventType: 'table.updated',
          aggregateType: 'TableSession',
          aggregateId: tableSession.id,
          payload: {
            tableSessionId: tableSession.id,
            tableId: resolved.tableId,
            tableNumber: resolved.tableNumber,
            status: 'OPEN',
            source: 'QR_SCAN',
          },
        });
      }

      const token = randomToken(32);
      const customerSession = await tx.customerSession.create({
        data: {
          tableSessionId: tableSession.id,
          tokenHash: hashSecret(token),
          guestLabel: input.guestLabel ?? null,
          expiresAt: new Date(Date.now() + env.customerSessionTtlHours * 60 * 60 * 1000),
        },
      });
      return { tableSession, customerSession, token };
    });

    await this.audit.record(
      {
        tenantId: resolved.tenantId,
        branchId: resolved.branchId,
        actorType: 'CUSTOMER',
        action: 'customer.session.created',
        resourceType: 'CustomerSession',
        resourceId: result.customerSession.id,
        after: { tableNumber: resolved.tableNumber },
        requestId: actor.requestId,
        ipAddress: actor.ipAddress,
      },
      this.prisma,
    );

    return {
      token: result.token,
      expiresAt: result.customerSession.expiresAt,
      customerSessionId: result.customerSession.id,
      tableSessionId: result.tableSession.id,
      restaurant: {
        name: resolved.tenantName,
        branch: resolved.branchName,
        currency: resolved.currency,
      },
      table: { id: resolved.tableId, number: resolved.tableNumber, name: resolved.tableName },
    };
  }

  async getSessionState(principal: CustomerPrincipal) {
    const session = await this.prisma.customerSession.findUniqueOrThrow({
      where: { id: principal.customerSessionId },
      include: {
        tableSession: {
          include: {
            table: { select: { id: true, number: true, name: true } },
            branch: { include: { tenant: { select: { id: true, name: true, logoUrl: true } } } },
          },
        },
      },
    });

    const [orders, requests, bill] = await Promise.all([
      this.prisma.order.findMany({
        where: { tableSessionId: session.tableSessionId, status: { not: 'CANCELLED' } },
        include: { items: { include: { modifiers: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.tableRequest.findMany({
        where: { tableSessionId: session.tableSessionId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.bill.findFirst({
        where: { tableSessionId: session.tableSessionId, status: { not: 'CANCELLED' } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const total = orders.reduce((acc, order) => acc.plus(order.total), new Prisma.Decimal(0));

    return {
      sessionId: session.id,
      tableSessionId: session.tableSessionId,
      status: session.tableSession.status,
      expiresAt: session.expiresAt,
      restaurant: {
        name: session.tableSession.branch.tenant.name,
        logoUrl: session.tableSession.branch.tenant.logoUrl,
        branch: session.tableSession.branch.name,
        currency: session.tableSession.branch.currency,
      },
      table: session.tableSession.table,
      orders: orders.map((order) => ({
        id: order.id,
        number: order.number,
        status: order.status,
        total: moneyString(order.total),
        createdAt: order.createdAt,
        acceptedAt: order.acceptedAt,
        readyAt: order.readyAt,
        servedAt: order.servedAt,
        items: order.items.map((item) => ({
          id: item.id,
          name: item.nameSnapshot,
          variantName: item.variantName,
          quantity: item.quantity,
          lineTotal: moneyString(item.lineTotal),
          status: item.status,
          note: item.note,
          modifiers: item.modifiers.map((modifier) => ({
            groupName: modifier.groupName,
            name: modifier.name,
          })),
        })),
      })),
      requests: requests.map((request) => ({
        id: request.id,
        type: request.type,
        status: request.status,
        createdAt: request.createdAt,
        acknowledgedAt: request.acknowledgedAt,
        resolvedAt: request.resolvedAt,
      })),
      bill: bill
        ? {
            id: bill.id,
            number: bill.number,
            status: bill.status,
            total: moneyString(bill.total),
            paidTotal: moneyString(bill.paidTotal),
            due: moneyString(bill.total.minus(bill.paidTotal)),
          }
        : null,
      orderTotal: moneyString(total),
    };
  }

  async createOrder(
    principal: CustomerPrincipal,
    dto: CreateOrderDto,
    idempotencyKey: string | undefined,
    actor: ActorMeta,
  ) {
    return this.orders.createCustomerOrder(principal, dto, idempotencyKey, actor);
  }

  async cancelOrder(
    principal: CustomerPrincipal,
    orderId: string,
    reason: string | undefined,
    actor: ActorMeta,
  ) {
    return this.orders.cancelCustomerOrder(
      principal,
      orderId,
      reason ?? 'Customer cancelled before the kitchen accepted',
      actor,
    );
  }

  async createRequest(
    principal: CustomerPrincipal,
    input: {
      type: 'CALL_WAITER' | 'REQUEST_BILL' | 'REQUEST_WATER' | 'REQUEST_UTENSILS' | 'REPORT_ISSUE';
      note?: string;
    },
    actor: ActorMeta,
  ) {
    const session = await this.prisma.tableSession.findUniqueOrThrow({
      where: { id: principal.tableSessionId },
      include: { table: true, branch: true },
    });

    const recent = await this.prisma.tableRequest.findFirst({
      where: {
        tableSessionId: session.id,
        type: input.type,
        status: { in: ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'] },
        createdAt: { gt: new Date(Date.now() - 5 * 60 * 1000) },
      },
    });
    if (recent) {
      throw new ConflictException({
        message: 'Staff have already been notified. Please give them a moment.',
        code: 'DUPLICATE_REQUEST',
        details: { requestId: recent.id, status: recent.status },
      });
    }

    const request = await this.prisma.$transaction(async (tx) => {
      const created = await tx.tableRequest.create({
        data: {
          tenantId: session.tenantId,
          branchId: session.branchId,
          tableId: session.tableId,
          tableSessionId: session.id,
          type: input.type,
          note: input.note,
          status: 'OPEN',
        },
      });

      if (input.type === 'REQUEST_BILL' && session.status === 'OPEN') {
        await tx.tableSession.update({ where: { id: session.id }, data: { status: 'BILL_REQUESTED' } });
        await tx.diningTable.update({ where: { id: session.tableId }, data: { status: 'BILL_REQUESTED' } });
        await this.outbox.append(tx, {
          tenantId: session.tenantId,
          branchId: session.branchId,
          eventType: 'table.updated',
          aggregateType: 'TableSession',
          aggregateId: session.id,
          payload: {
            tableSessionId: session.id,
            tableId: session.tableId,
            tableNumber: session.table.number,
            status: 'BILL_REQUESTED',
          },
        });
      }

      await this.outbox.append(tx, {
        tenantId: session.tenantId,
        branchId: session.branchId,
        eventType: input.type === 'REQUEST_BILL' ? 'bill.requested' : 'table.request.created',
        aggregateType: 'TableRequest',
        aggregateId: created.id,
        payload: {
          requestId: created.id,
          type: created.type,
          tableId: session.tableId,
          tableNumber: session.table.number,
          tableSessionId: session.id,
          note: created.note,
        },
      });
      return created;
    });

    await this.audit.record(
      {
        tenantId: session.tenantId,
        branchId: session.branchId,
        actorType: 'CUSTOMER',
        action: 'table.request.created',
        resourceType: 'TableRequest',
        resourceId: request.id,
        after: { type: request.type, tableNumber: session.table.number },
        requestId: actor.requestId,
      },
      this.prisma,
    );

    return {
      id: request.id,
      type: request.type,
      status: request.status,
      createdAt: request.createdAt,
    };
  }

  async listRequests(principal: CustomerPrincipal) {
    const requests = await this.prisma.tableRequest.findMany({
      where: { tableSessionId: principal.tableSessionId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return requests.map((request) => ({
      id: request.id,
      type: request.type,
      status: request.status,
      note: request.note,
      createdAt: request.createdAt,
      acknowledgedAt: request.acknowledgedAt,
      resolvedAt: request.resolvedAt,
    }));
  }

  async menuForSession(principal: CustomerPrincipal) {
    const session = await this.prisma.tableSession.findUniqueOrThrow({
      where: { id: principal.tableSessionId },
      include: { branch: { include: { tenant: true } }, table: true },
    });
    const menu = await this.catalog.publicMenu(principal.tenantId, principal.branchId);
    return {
      restaurant: {
        name: session.branch.tenant.name,
        logoUrl: session.branch.tenant.logoUrl,
        branch: session.branch.name,
        currency: session.branch.currency,
      },
      table: { id: session.table.id, number: session.table.number, name: session.table.name },
      menu,
    };
  }

  /** Metrics for platform/ops: QR scan volume is derived from sessions. */
  async sessionCount(tenantId: string): Promise<number> {
    return this.prisma.customerSession.count({ where: { tableSession: { tenantId } } });
  }
}
