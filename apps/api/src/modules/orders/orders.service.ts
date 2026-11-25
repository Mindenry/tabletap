import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { canCancelOrder, canTransition, ORDER_TRANSITIONS, type OrderStatus } from '@tabletap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DocumentNumberService } from '../../common/common.module';
import { D, moneyString } from '../../common/money';
import { AuditService } from '../audit/audit.module';
import { OutboxService } from '../realtime/outbox.service';
import { BranchAccessService } from '../tenancy/branch-access.service';
import { InventoryService } from '../inventory/inventory.service';
import { ActorMeta } from '../../common/actor';
import type { CustomerPrincipal, StaffPrincipal } from '../auth/principal';
import type { CreateOrderDto, OrderQueryDto } from './orders.dto';
import { priceOrder, type PricingLineInput } from './pricing';

const LIVE_SESSION = ['OPEN', 'BILL_REQUESTED'] as const;

interface DraftLine {
  menuItemId: string;
  menuItemName: string;
  sku: string | null;
  variantName: string | null;
  quantity: number;
  unitPrice: Prisma.Decimal;
  modifiersPerUnit: Prisma.Decimal;
  modifiers: Array<{ optionId: string; groupName: string; name: string; priceDelta: Prisma.Decimal }>;
  note: string | null;
  stationId: string;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbers: DocumentNumberService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly branches: BranchAccessService,
    private readonly inventory: InventoryService,
  ) {}

  // ------------------------------------------------------------- creation

  async createCustomerOrder(
    principal: CustomerPrincipal,
    dto: CreateOrderDto,
    idempotencyKey: string | undefined,
    actor: ActorMeta,
  ) {
    return this.createOrder({
      tenantId: principal.tenantId,
      branchId: principal.branchId,
      tableId: principal.tableId,
      tableSessionId: principal.tableSessionId,
      customerSessionId: principal.customerSessionId,
      source: 'CUSTOMER_QR',
      createdById: null,
      actorType: 'CUSTOMER',
      dto,
      idempotencyKey,
      actor,
    });
  }

  async createStaffOrder(
    principal: StaffPrincipal,
    dto: CreateOrderDto & { tableSessionId: string },
    idempotencyKey: string | undefined,
    actor: ActorMeta,
  ) {
    const session = await this.prisma.tableSession.findUnique({ where: { id: dto.tableSessionId } });
    if (!session) throw new NotFoundException({ message: 'Table session not found', code: 'NOT_FOUND' });
    await this.branches.load(principal, session.branchId);

    return this.createOrder({
      tenantId: principal.tenantId,
      branchId: session.branchId,
      tableId: session.tableId,
      tableSessionId: session.id,
      customerSessionId: null,
      source: 'STAFF_POS',
      createdById: principal.userId,
      actorType: 'STAFF',
      dto,
      idempotencyKey,
      actor,
    });
  }

  private async createOrder(input: {
    tenantId: string;
    branchId: string;
    tableId: string;
    tableSessionId: string;
    customerSessionId: string | null;
    source: 'CUSTOMER_QR' | 'STAFF_POS';
    createdById: string | null;
    actorType: 'CUSTOMER' | 'STAFF';
    dto: CreateOrderDto;
    idempotencyKey?: string;
    actor: ActorMeta;
  }) {
    if (input.idempotencyKey) {
      const existing = await this.prisma.order.findUnique({
        where: {
          tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey },
        },
        include: this.orderInclude(),
      });
      if (existing) return this.serialize(existing);
    }

    const session = await this.prisma.tableSession.findUnique({
      where: { id: input.tableSessionId },
      include: { branch: { include: { tenant: true } }, table: true },
    });
    if (!session) throw new NotFoundException({ message: 'Table session not found', code: 'NOT_FOUND' });
    if (session.branchId !== input.branchId || session.tableId !== input.tableId) {
      throw new ForbiddenException({
        message: 'Session does not match this table',
        code: 'SESSION_MISMATCH',
      });
    }
    if (!LIVE_SESSION.includes(session.status as (typeof LIVE_SESSION)[number])) {
      throw new ConflictException({
        message: 'This table is not accepting orders right now',
        code: 'TABLE_NOT_ORDERING',
        details: { status: session.status },
      });
    }
    if (session.branch.status !== 'ACTIVE') {
      throw new ConflictException({ message: 'Branch is not accepting orders', code: 'BRANCH_INACTIVE' });
    }
    if (session.branch.tenant.status !== 'ACTIVE') {
      throw new ConflictException({ message: 'Restaurant is not active', code: 'TENANT_INACTIVE' });
    }

    const draft = await this.buildDraft(input.tenantId, input.branchId, input.dto);

    const rules = {
      vatRate: session.branch.vatRate,
      vatInclusive: session.branch.vatInclusive,
      serviceChargeType: session.branch.serviceChargeType as 'PERCENT' | 'FIXED',
      serviceChargeValue: session.branch.serviceChargeValue,
    };
    const pricingLines: PricingLineInput[] = draft.lines.map((line) => ({
      unitPrice: line.unitPrice,
      modifiersPerUnit: line.modifiersPerUnit,
      quantity: line.quantity,
    }));
    const basePricing = priceOrder(pricingLines, rules, 0);

    const promotion = await this.validatePromotion(
      input.tenantId,
      input.branchId,
      input.dto.promotionCode,
      basePricing.subtotal,
    );

    const pricing = promotion ? priceOrder(pricingLines, rules, promotion.discount) : basePricing;

    try {
      const order = await this.prisma.$transaction(async (tx) => {
        const number = await this.numbers.next(tx, {
          tenantId: input.tenantId,
          branchId: input.branchId,
          branchCode: session.branch.code,
          type: 'ORDER',
        });

        const created = await tx.order.create({
          data: {
            tenantId: input.tenantId,
            branchId: input.branchId,
            tableId: input.tableId,
            tableSessionId: input.tableSessionId,
            customerSessionId: input.customerSessionId,
            number,
            status: 'PENDING',
            source: input.source,
            subtotal: pricing.subtotal,
            discountTotal: pricing.discountTotal,
            serviceCharge: pricing.serviceCharge,
            taxTotal: pricing.taxTotal,
            total: pricing.total,
            currency: session.branch.currency,
            note: input.dto.note,
            idempotencyKey: input.idempotencyKey,
            createdById: input.createdById,
          },
        });

        const ticketByStation = new Map<string, { id: string; number: string; code: string; name: string }>();

        for (const [index, line] of draft.lines.entries()) {
          const price = pricing.lines[index]!;
          const orderItem = await tx.orderItem.create({
            data: {
              orderId: created.id,
              menuItemId: line.menuItemId,
              stationId: line.stationId,
              nameSnapshot: line.menuItemName,
              skuSnapshot: line.sku,
              variantName: line.variantName,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              modifiersTotal: line.modifiersPerUnit,
              lineSubtotal: price.lineSubtotal,
              lineDiscount: price.lineDiscount,
              lineTax: price.lineTax,
              lineTotal: price.lineTotal,
              status: 'PENDING',
              note: line.note,
            },
          });

          if (line.modifiers.length > 0) {
            await tx.orderItemModifier.createMany({
              data: line.modifiers.map((modifier) => ({
                orderItemId: orderItem.id,
                modifierOptionId: modifier.optionId,
                groupName: modifier.groupName,
                name: modifier.name,
                priceDelta: modifier.priceDelta,
                quantity: 1,
              })),
            });
          }

          let ticket = ticketByStation.get(line.stationId);
          if (!ticket) {
            const station = draft.stations.get(line.stationId)!;
            const createdTicket = await tx.kitchenTicket.create({
              data: {
                tenantId: input.tenantId,
                branchId: input.branchId,
                stationId: line.stationId,
                orderId: created.id,
                number: `${number}-${station.code}`,
                status: 'PENDING',
              },
            });
            ticket = {
              id: createdTicket.id,
              number: createdTicket.number,
              code: station.code,
              name: station.name,
            };
            ticketByStation.set(line.stationId, ticket);
          }
          await tx.kitchenTicketItem.create({
            data: { ticketId: ticket.id, orderItemId: orderItem.id, status: 'PENDING' },
          });
        }

        await tx.orderEvent.create({
          data: {
            orderId: created.id,
            actorUserId: input.createdById,
            actorType: input.actorType,
            toStatus: 'PENDING',
            metadata: { source: input.source, itemCount: draft.lines.length },
          },
        });

        if (promotion) {
          const result = await tx.$executeRaw`
            UPDATE "Promotion"
            SET "redemptionCount" = "redemptionCount" + 1
            WHERE "id" = ${promotion.promotionId}::uuid
              AND ("maxRedemptions" IS NULL OR "redemptionCount" < "maxRedemptions")
          `;
          if (result === 0) {
            throw new ConflictException({
              message: 'This promotion is no longer available',
              code: 'PROMOTION_EXHAUSTED',
            });
          }
          await tx.promotionRedemption.create({
            data: {
              promotionId: promotion.promotionId,
              orderId: created.id,
              amount: promotion.discount,
            },
          });
        }

        await tx.diningTable.update({
          where: { id: input.tableId },
          data: { status: 'ORDERING' },
        });

        await this.outbox.append(tx, {
          tenantId: input.tenantId,
          branchId: input.branchId,
          eventType: 'order.created',
          aggregateType: 'Order',
          aggregateId: created.id,
          customerSessionId: input.customerSessionId,
          payload: {
            orderId: created.id,
            number: created.number,
            status: 'PENDING',
            tableId: input.tableId,
            tableNumber: session.table.number,
            tableSessionId: input.tableSessionId,
            total: moneyString(pricing.total),
            itemCount: draft.lines.length,
          },
        });

        for (const [stationId, ticket] of ticketByStation.entries()) {
          await this.outbox.append(tx, {
            tenantId: input.tenantId,
            branchId: input.branchId,
            eventType: 'kitchen.ticket.created',
            aggregateType: 'KitchenTicket',
            aggregateId: ticket.id,
            stationId,
            payload: {
              ticketId: ticket.id,
              ticketNumber: ticket.number,
              stationId,
              stationCode: ticket.code,
              orderId: created.id,
              orderNumber: created.number,
              tableNumber: session.table.number,
              status: 'PENDING',
            },
          });
        }

        return created;
      });

      const withRelations = await this.prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        include: this.orderInclude(),
      });

      await this.audit.record(
        {
          tenantId: input.tenantId,
          branchId: input.branchId,
          actorId: input.createdById,
          actorType: input.actorType,
          action: 'order.created',
          resourceType: 'Order',
          resourceId: order.id,
          after: {
            number: order.number,
            total: moneyString(order.total),
            itemCount: draft.lines.length,
            source: input.source,
          },
          requestId: input.actor.requestId,
        },
        this.prisma,
      );

      return this.serialize(withRelations);
    } catch (error) {
      if (
        input.idempotencyKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.order.findUnique({
          where: {
            tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey },
          },
          include: this.orderInclude(),
        });
        if (existing) return this.serialize(existing);
      }
      throw error;
    }
  }

  // ------------------------------------------------------------- loading

  async listOrders(principal: StaffPrincipal, query: OrderQueryDto) {
    const allowed = await this.branches.allowedBranchIds(principal);
    const branchId = query.branchId ?? allowed[0];
    if (!branchId) throw new NotFoundException({ message: 'No branch', code: 'NO_BRANCH' });
    await this.branches.load(principal, branchId);

    const rows = await this.prisma.order.findMany({
      where: {
        tenantId: principal.tenantId,
        branchId,
        ...(query.status ? { status: query.status as never } : {}),
        ...(query.tableSessionId ? { tableSessionId: query.tableSessionId } : {}),
        ...(query.search
          ? {
              OR: [
                { number: { contains: query.search, mode: 'insensitive' } },
                { table: { number: { contains: query.search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      include: {
        table: { select: { id: true, number: true, name: true } },
        items: { select: { id: true, quantity: true } },
        billOrders: { select: { billId: true, bill: { select: { number: true, status: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(query.limit ?? 50, 200),
    });

    return rows.map((row) => ({
      id: row.id,
      number: row.number,
      status: row.status,
      source: row.source,
      table: row.table,
      tableSessionId: row.tableSessionId,
      total: moneyString(row.total),
      itemCount: row.items.reduce((acc, item) => acc + item.quantity, 0),
      bill: row.billOrders[0]?.bill ?? null,
      createdAt: row.createdAt,
      acceptedAt: row.acceptedAt,
      readyAt: row.readyAt,
      servedAt: row.servedAt,
      cancelledAt: row.cancelledAt,
    }));
  }

  async getOrder(principal: StaffPrincipal, id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        ...this.orderInclude(),
        events: { orderBy: { createdAt: 'asc' } },
        tickets: { include: { items: true, station: true }, orderBy: { createdAt: 'asc' } },
        billOrders: { include: { bill: true } },
        cancellation: true,
      },
    });
    if (!order || order.tenantId !== principal.tenantId) {
      throw new NotFoundException({ message: 'Order not found', code: 'NOT_FOUND' });
    }
    await this.branches.load(principal, order.branchId);
    return {
      ...this.serialize(order),
      events: order.events,
      tickets: order.tickets.map((ticket) => ({
        id: ticket.id,
        number: ticket.number,
        status: ticket.status,
        station: { id: ticket.station.id, name: ticket.station.name, code: ticket.station.code },
        acceptedAt: ticket.acceptedAt,
        readyAt: ticket.readyAt,
        rejectReason: ticket.rejectReason,
        items: ticket.items,
      })),
      bills: order.billOrders.map((link) => ({
        id: link.bill.id,
        number: link.bill.number,
        status: link.bill.status,
        total: moneyString(link.bill.total),
      })),
      cancellation: order.cancellation,
    };
  }

  // --------------------------------------------------------- transitions

  async acceptOrder(principal: StaffPrincipal, orderId: string, actor: ActorMeta) {
    const order = await this.loadForStaff(principal, orderId);
    await this.prisma.$transaction(async (tx) => {
      await this.acceptOrderInTransaction(tx, order.id, principal.userId, 'STAFF', actor);
    });
    return this.getOrder(principal, orderId);
  }

  async startPreparing(principal: StaffPrincipal, orderId: string, actor: ActorMeta) {
    const order = await this.loadForStaff(principal, orderId);
    await this.prisma.$transaction(async (tx) => {
      await this.transitionOrder(tx, order.id, 'PREPARING', principal.userId, 'STAFF', actor);
      await tx.orderItem.updateMany({
        where: { orderId: order.id, status: 'ACCEPTED' },
        data: { status: 'PREPARING' },
      });
      await tx.kitchenTicket.updateMany({
        where: { orderId: order.id, status: 'ACCEPTED' },
        data: { status: 'PREPARING' },
      });
    });
    return this.getOrder(principal, orderId);
  }

  async markReady(principal: StaffPrincipal, orderId: string, actor: ActorMeta) {
    const order = await this.loadForStaff(principal, orderId);
    await this.prisma.$transaction(async (tx) => {
      await this.transitionOrder(tx, order.id, 'READY', principal.userId, 'STAFF', actor);
      await tx.orderItem.updateMany({
        where: { orderId: order.id, status: { in: ['PENDING', 'ACCEPTED', 'PREPARING'] } },
        data: { status: 'READY' },
      });
      await tx.kitchenTicket.updateMany({
        where: { orderId: order.id, status: { in: ['PENDING', 'ACCEPTED', 'PREPARING'] } },
        data: { status: 'READY', readyAt: new Date() },
      });
    });
    return this.getOrder(principal, orderId);
  }

  async markServed(principal: StaffPrincipal, orderId: string, actor: ActorMeta) {
    const order = await this.loadForStaff(principal, orderId);
    await this.prisma.$transaction(async (tx) => {
      await this.transitionOrder(tx, order.id, 'SERVED', principal.userId, 'STAFF', actor);
      await tx.orderItem.updateMany({
        where: { orderId: order.id, status: { not: 'CANCELLED' } },
        data: { status: 'SERVED' },
      });
      await tx.kitchenTicket.updateMany({
        where: { orderId: order.id, status: { not: 'REJECTED' } },
        data: { status: 'SERVED', servedAt: new Date() },
      });
      await tx.diningTable.update({ where: { id: order.tableId }, data: { status: 'OCCUPIED' } });
    });
    return this.getOrder(principal, orderId);
  }

  async cancelOrder(principal: StaffPrincipal, orderId: string, reason: string, actor: ActorMeta) {
    const order = await this.loadForStaff(principal, orderId);
    await this.prisma.$transaction(async (tx) => {
      await this.cancelOrderInTransaction(tx, order.id, reason, principal.userId, 'STAFF', actor);
    });
    return this.getOrder(principal, orderId);
  }

  async cancelCustomerOrder(principal: CustomerPrincipal, orderId: string, reason: string, actor: ActorMeta) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (
      !order ||
      order.tenantId !== principal.tenantId ||
      order.customerSessionId !== principal.customerSessionId
    ) {
      throw new NotFoundException({ message: 'Order not found', code: 'NOT_FOUND' });
    }
    if (order.status !== 'PENDING') {
      throw new ConflictException({
        message: 'The kitchen has already started this order. Please ask staff for help.',
        code: 'CANNOT_CANCEL',
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await this.cancelOrderInTransaction(tx, order.id, reason, null, 'CUSTOMER', actor);
    });
    return { id: order.id, status: 'CANCELLED' };
  }

  // ---------------------------------------------------------- kitchen hooks

  /**
   * Shared by the orders API and the kitchen ticket API. Deducts inventory in
   * the same transaction, so a failed deduction rolls the acceptance back.
   */
  async acceptOrderInTransaction(
    tx: Prisma.TransactionClient,
    orderId: string,
    actorId: string | null,
    actorType: 'STAFF' | 'CUSTOMER' | 'SYSTEM',
    actor: ActorMeta,
    options: { markAllItems?: boolean } = {},
  ): Promise<void> {
    const markAllItems = options.markAllItems ?? true;
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        status: OrderStatus;
        tenantId: string;
        branchId: string;
        tableId: string;
        tableSessionId: string;
        customerSessionId: string | null;
      }>
    >`
      SELECT "id", "status", "tenantId", "branchId", "tableId", "tableSessionId", "customerSessionId"
      FROM "Order" WHERE "id" = ${orderId}::uuid FOR UPDATE
    `;
    const order = rows[0];
    if (!order) throw new NotFoundException({ message: 'Order not found', code: 'NOT_FOUND' });
    if (order.status === 'ACCEPTED' || order.status === 'PREPARING') return;
    if (!canTransition(ORDER_TRANSITIONS, order.status, 'ACCEPTED')) {
      throw new ConflictException({
        message: `Cannot accept an order in ${order.status} state`,
        code: 'INVALID_TRANSITION',
        details: { from: order.status, to: 'ACCEPTED' },
      });
    }

    await this.inventory.deductForOrder(tx, orderId, actorId);

    await tx.order.update({
      where: { id: orderId },
      data: { status: 'ACCEPTED', acceptedAt: new Date(), acceptedById: actorId },
    });
    if (markAllItems) {
      await tx.orderItem.updateMany({
        where: { orderId, status: 'PENDING' },
        data: { status: 'ACCEPTED' },
      });
      await tx.kitchenTicket.updateMany({
        where: { orderId, status: 'PENDING' },
        data: { status: 'ACCEPTED', acceptedById: actorId, acceptedAt: new Date() },
      });
    }
    await this.recordEvent(tx, orderId, actorId, actorType, order.status, 'ACCEPTED', null);
    await this.outbox.append(tx, {
      tenantId: order.tenantId,
      branchId: order.branchId,
      eventType: 'order.accepted',
      aggregateType: 'Order',
      aggregateId: orderId,
      customerSessionId: order.customerSessionId,
      payload: {
        orderId,
        status: 'ACCEPTED',
        tableSessionId: order.tableSessionId,
        customerSessionId: order.customerSessionId,
      },
    });
    await this.audit.record(
      {
        tenantId: order.tenantId,
        branchId: order.branchId,
        actorId,
        actorType,
        action: 'order.accepted',
        resourceType: 'Order',
        resourceId: orderId,
        requestId: actor.requestId,
      },
      tx,
    );
  }

  async transitionOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
    to: OrderStatus,
    actorId: string | null,
    actorType: 'STAFF' | 'CUSTOMER' | 'SYSTEM',
    actor: ActorMeta,
  ): Promise<void> {
    const rows = await tx.$queryRaw<
      Array<{
        status: OrderStatus;
        tenantId: string;
        branchId: string;
        tableSessionId: string;
        customerSessionId: string | null;
      }>
    >`
      SELECT "status", "tenantId", "branchId", "tableSessionId", "customerSessionId"
      FROM "Order" WHERE "id" = ${orderId}::uuid FOR UPDATE
    `;
    const order = rows[0];
    if (!order) throw new NotFoundException({ message: 'Order not found', code: 'NOT_FOUND' });
    if (order.status === to) return;
    if (!canTransition(ORDER_TRANSITIONS, order.status, to)) {
      throw new ConflictException({
        message: `Cannot move an order from ${order.status} to ${to}`,
        code: 'INVALID_TRANSITION',
        details: { from: order.status, to },
      });
    }
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: to,
        ...(to === 'READY' ? { readyAt: new Date() } : {}),
        ...(to === 'SERVED' ? { servedAt: new Date() } : {}),
      },
    });
    await this.recordEvent(tx, orderId, actorId, actorType, order.status, to, null);
    await this.outbox.append(tx, {
      tenantId: order.tenantId,
      branchId: order.branchId,
      eventType: to === 'CANCELLED' ? 'order.cancelled' : 'order.updated',
      aggregateType: 'Order',
      aggregateId: orderId,
      customerSessionId: order.customerSessionId,
      payload: {
        orderId,
        status: to,
        tableSessionId: order.tableSessionId,
        customerSessionId: order.customerSessionId,
      },
    });
    await this.audit.record(
      {
        tenantId: order.tenantId,
        branchId: order.branchId,
        actorId,
        actorType,
        action: `order.${to.toLowerCase()}`,
        resourceType: 'Order',
        resourceId: orderId,
        before: { status: order.status },
        after: { status: to },
        requestId: actor.requestId,
      },
      tx,
    );
  }

  async cancelOrderInTransaction(
    tx: Prisma.TransactionClient,
    orderId: string,
    reason: string,
    actorId: string | null,
    actorType: 'STAFF' | 'CUSTOMER' | 'SYSTEM',
    actor: ActorMeta,
  ): Promise<void> {
    const rows = await tx.$queryRaw<
      Array<{
        status: OrderStatus;
        tenantId: string;
        branchId: string;
        number: string;
        tableId: string;
        tableSessionId: string;
        customerSessionId: string | null;
      }>
    >`
      SELECT "status", "tenantId", "branchId", "number", "tableId", "tableSessionId", "customerSessionId"
      FROM "Order" WHERE "id" = ${orderId}::uuid FOR UPDATE
    `;
    const order = rows[0];
    if (!order) throw new NotFoundException({ message: 'Order not found', code: 'NOT_FOUND' });
    if (!canCancelOrder(order.status)) {
      throw new ConflictException({
        message: `An order in ${order.status} state cannot be cancelled`,
        code: 'CANNOT_CANCEL',
      });
    }

    const billed = await tx.billOrder.findFirst({
      where: { orderId, bill: { status: { not: 'CANCELLED' } } },
    });
    if (billed) {
      throw new ConflictException({
        message: 'This order is on a bill. Void the bill before cancelling.',
        code: 'ORDER_BILLED',
      });
    }

    const reversed = await this.inventory.reverseForOrder(tx, orderId, actorId, `Cancelled: ${reason}`);

    await tx.order.update({
      where: { id: orderId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: reason,
      },
    });
    await tx.orderItem.updateMany({ where: { orderId }, data: { status: 'CANCELLED' } });
    await tx.kitchenTicket.updateMany({
      where: { orderId, status: { not: 'SERVED' } },
      data: { status: 'REJECTED', rejectedAt: new Date(), rejectReason: reason },
    });
    await tx.orderCancellation.create({
      data: {
        orderId,
        reason,
        cancelledById: actorId,
        refundRequired: false,
        inventoryReversed: reversed > 0,
      },
    });
    await this.recordEvent(tx, orderId, actorId, actorType, order.status, 'CANCELLED', reason);
    await this.outbox.append(tx, {
      tenantId: order.tenantId,
      branchId: order.branchId,
      eventType: 'order.cancelled',
      aggregateType: 'Order',
      aggregateId: orderId,
      customerSessionId: order.customerSessionId,
      payload: {
        orderId,
        number: order.number,
        status: 'CANCELLED',
        reason,
        tableSessionId: order.tableSessionId,
        customerSessionId: order.customerSessionId,
      },
    });
    await this.audit.record(
      {
        tenantId: order.tenantId,
        branchId: order.branchId,
        actorId,
        actorType,
        action: 'order.cancelled',
        resourceType: 'Order',
        resourceId: orderId,
        reason,
        requestId: actor.requestId,
      },
      tx,
    );
  }

  /** Derives the order status from its items; used after item-level kitchen updates. */
  async recomputeOrderStatus(tx: Prisma.TransactionClient, orderId: string): Promise<OrderStatus> {
    const items = await tx.orderItem.findMany({
      where: { orderId },
      select: { status: true },
    });
    const active = items.filter((item) => item.status !== 'CANCELLED');
    let status: OrderStatus = 'PENDING';
    if (active.length === 0) status = 'CANCELLED';
    else if (active.every((item) => item.status === 'SERVED')) status = 'SERVED';
    else if (active.every((item) => item.status === 'READY' || item.status === 'SERVED')) status = 'READY';
    else if (active.some((item) => item.status === 'PREPARING')) status = 'PREPARING';
    else if (
      active.every(
        (item) => item.status === 'ACCEPTED' || item.status === 'READY' || item.status === 'SERVED',
      )
    ) {
      status = 'ACCEPTED';
    }

    const current = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
    if (current.status !== status) {
      await tx.order.update({
        where: { id: orderId },
        data: {
          status,
          ...(status === 'READY' ? { readyAt: new Date() } : {}),
          ...(status === 'SERVED' ? { servedAt: new Date() } : {}),
        },
      });
      await this.recordEvent(tx, orderId, null, 'SYSTEM', current.status, status, 'Derived from item states');
    }
    return status;
  }

  // ------------------------------------------------------------ internals

  private async buildDraft(tenantId: string, branchId: string, dto: CreateOrderDto) {
    const menuItemIds = [...new Set(dto.items.map((item) => item.menuItemId))];
    const items = await this.prisma.menuItem.findMany({
      where: { id: { in: menuItemIds }, tenantId },
      include: {
        variants: true,
        availability: { where: { branchId } },
        modifierGroups: { include: { group: { include: { options: true } } } },
        stations: true,
      },
    });
    if (items.length !== menuItemIds.length) {
      throw new BadRequestException({
        message: 'One or more menu items are unavailable',
        code: 'ITEM_NOT_FOUND',
      });
    }

    const stations = await this.prisma.kitchenStation.findMany({
      where: { branchId, isActive: true },
      orderBy: { displayOrder: 'asc' },
    });
    if (stations.length === 0) {
      throw new ConflictException({ message: 'No kitchen station configured', code: 'NO_KITCHEN_STATION' });
    }
    const stationMap = new Map(stations.map((station) => [station.id, station]));
    const fallbackStation = stations.find((station) => station.code === 'HOT_KITCHEN') ?? stations[0]!;

    const lines: DraftLine[] = [];

    for (const line of dto.items) {
      const item = items.find((row) => row.id === line.menuItemId)!;
      if (item.status !== 'ACTIVE') {
        throw new ConflictException({
          message: `${item.name} is not available`,
          code: 'ITEM_UNAVAILABLE',
          details: { menuItemId: item.id },
        });
      }
      const availability = item.availability[0];
      if (availability && !availability.isAvailable) {
        throw new ConflictException({
          message: `${item.name} is sold out`,
          code: 'ITEM_SOLD_OUT',
          details: { menuItemId: item.id },
        });
      }
      if (availability?.soldOutUntil && availability.soldOutUntil.getTime() > Date.now()) {
        throw new ConflictException({
          message: `${item.name} is sold out until later`,
          code: 'ITEM_SOLD_OUT',
          details: { menuItemId: item.id, until: availability.soldOutUntil },
        });
      }

      let unitPrice = item.basePrice;
      let variantName: string | null = null;
      if (line.variantId) {
        const variant = item.variants.find((row) => row.id === line.variantId);
        if (!variant) {
          throw new BadRequestException({
            message: `Unknown variant for ${item.name}`,
            code: 'INVALID_VARIANT',
          });
        }
        if (!variant.isAvailable) {
          throw new ConflictException({
            message: `${variant.name} is unavailable`,
            code: 'VARIANT_UNAVAILABLE',
          });
        }
        unitPrice = item.basePrice.plus(variant.priceDelta);
        variantName = variant.name;
      } else if (item.variants.length > 0) {
        const defaultVariant = item.variants.find((variant) => variant.isDefault) ?? item.variants[0]!;
        unitPrice = item.basePrice.plus(defaultVariant.priceDelta);
        variantName = defaultVariant.name;
      }

      const selectedIds = line.modifierOptionIds ?? [];
      const modifiers: DraftLine['modifiers'] = [];
      let modifiersPerUnit = D(0);

      for (const link of item.modifierGroups) {
        const group = link.group;
        const selected = group.options.filter((option) => selectedIds.includes(option.id));
        const count = selected.length;
        if (group.required && count < Math.max(1, group.minSelect)) {
          throw new BadRequestException({
            message: `Choose at least ${Math.max(1, group.minSelect)} option(s) for ${group.name}`,
            code: 'MODIFIER_REQUIRED',
            details: { group: group.name },
          });
        }
        if (count > group.maxSelect) {
          throw new BadRequestException({
            message: `Choose at most ${group.maxSelect} option(s) for ${group.name}`,
            code: 'MODIFIER_TOO_MANY',
            details: { group: group.name },
          });
        }
        if (count > 0 && count < group.minSelect) {
          throw new BadRequestException({
            message: `Choose at least ${group.minSelect} option(s) for ${group.name}`,
            code: 'MODIFIER_TOO_FEW',
            details: { group: group.name },
          });
        }
        for (const option of selected) {
          if (!option.isAvailable) {
            throw new ConflictException({
              message: `${option.name} is unavailable`,
              code: 'MODIFIER_UNAVAILABLE',
            });
          }
          modifiersPerUnit = modifiersPerUnit.plus(option.priceDelta);
          modifiers.push({
            optionId: option.id,
            groupName: group.name,
            name: option.name,
            priceDelta: option.priceDelta,
          });
        }
      }

      const allowedOptionIds = new Set(
        item.modifierGroups.flatMap((link) => link.group.options.map((option) => option.id)),
      );
      const unknown = selectedIds.filter((id) => !allowedOptionIds.has(id));
      if (unknown.length > 0) {
        throw new BadRequestException({
          message: 'Invalid modifier selection',
          code: 'INVALID_MODIFIER',
          details: { unknown },
        });
      }

      const branchStation = item.stations.find((link) => stationMap.has(link.stationId));
      const stationId = branchStation?.stationId ?? fallbackStation.id;
      if (!stationMap.has(stationId)) {
        throw new ConflictException({
          message: 'Menu item routed to an unknown station',
          code: 'STATION_INVALID',
        });
      }

      lines.push({
        menuItemId: item.id,
        menuItemName: item.name,
        sku: item.sku,
        variantName,
        quantity: line.quantity,
        unitPrice,
        modifiersPerUnit,
        modifiers,
        note: line.note ?? null,
        stationId,
      });
    }

    return { lines, stations: stationMap };
  }

  private async validatePromotion(
    tenantId: string,
    branchId: string,
    code: string | undefined,
    subtotal: Prisma.Decimal,
  ): Promise<{ promotionId: string; discount: Prisma.Decimal } | null> {
    if (!code) return null;
    const now = new Date();
    const promotion = await this.prisma.promotion.findFirst({
      where: {
        tenantId,
        code,
        isActive: true,
        OR: [{ branchId: null }, { branchId }],
      },
    });
    if (!promotion) {
      throw new BadRequestException({ message: 'Promotion code is not valid', code: 'PROMOTION_INVALID' });
    }
    if (promotion.startsAt && promotion.startsAt > now) {
      throw new BadRequestException({
        message: 'Promotion has not started yet',
        code: 'PROMOTION_NOT_STARTED',
      });
    }
    if (promotion.endsAt && promotion.endsAt < now) {
      throw new BadRequestException({ message: 'Promotion has expired', code: 'PROMOTION_EXPIRED' });
    }
    if (promotion.maxRedemptions !== null && promotion.redemptionCount >= promotion.maxRedemptions) {
      throw new ConflictException({
        message: 'Promotion has been fully redeemed',
        code: 'PROMOTION_EXHAUSTED',
      });
    }
    if (subtotal.lessThan(promotion.minOrderAmount)) {
      throw new BadRequestException({
        message: `Minimum spend for this promotion is ${moneyString(promotion.minOrderAmount)}`,
        code: 'PROMOTION_MIN_ORDER',
      });
    }

    let discount =
      promotion.type === 'PERCENTAGE' ? subtotal.times(promotion.value).dividedBy(100) : promotion.value;
    if (promotion.maxDiscount) {
      discount = Prisma.Decimal.min(discount, promotion.maxDiscount);
    }
    discount = Prisma.Decimal.min(discount, subtotal);
    discount = discount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    if (discount.lessThanOrEqualTo(0)) return null;

    return { promotionId: promotion.id, discount };
  }

  private orderInclude() {
    return {
      table: { select: { id: true, number: true, name: true } },
      items: {
        include: { modifiers: true },
        orderBy: { createdAt: 'asc' as const },
      },
      branch: { select: { id: true, name: true, vatRate: true, vatInclusive: true } },
    } satisfies Prisma.OrderInclude;
  }

  private serialize(order: Prisma.OrderGetPayload<{ include: ReturnType<OrdersService['orderInclude']> }>) {
    return {
      id: order.id,
      number: order.number,
      status: order.status,
      source: order.source,
      table: order.table,
      tableSessionId: order.tableSessionId,
      branch: { id: order.branch.id, name: order.branch.name },
      currency: order.currency,
      subtotal: moneyString(order.subtotal),
      discountTotal: moneyString(order.discountTotal),
      serviceCharge: moneyString(order.serviceCharge),
      taxTotal: moneyString(order.taxTotal),
      total: moneyString(order.total),
      note: order.note,
      createdAt: order.createdAt,
      acceptedAt: order.acceptedAt,
      readyAt: order.readyAt,
      servedAt: order.servedAt,
      cancelledAt: order.cancelledAt,
      cancelReason: order.cancelReason,
      items: order.items.map((item) => ({
        id: item.id,
        menuItemId: item.menuItemId,
        name: item.nameSnapshot,
        sku: item.skuSnapshot,
        variantName: item.variantName,
        quantity: item.quantity,
        unitPrice: moneyString(item.unitPrice),
        modifiersTotal: moneyString(item.modifiersTotal),
        lineTotal: moneyString(item.lineTotal),
        status: item.status,
        note: item.note,
        modifiers: item.modifiers.map((modifier) => ({
          groupName: modifier.groupName,
          name: modifier.name,
          priceDelta: moneyString(modifier.priceDelta),
        })),
      })),
    };
  }

  private async loadForStaff(principal: StaffPrincipal, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.tenantId !== principal.tenantId) {
      throw new NotFoundException({ message: 'Order not found', code: 'NOT_FOUND' });
    }
    await this.branches.load(principal, order.branchId);
    return order;
  }

  private async recordEvent(
    tx: Prisma.TransactionClient,
    orderId: string,
    actorUserId: string | null,
    actorType: string,
    fromStatus: OrderStatus | null,
    toStatus: OrderStatus,
    reason: string | null,
  ): Promise<void> {
    await tx.orderEvent.create({
      data: {
        orderId,
        actorUserId,
        actorType,
        fromStatus: fromStatus ?? undefined,
        toStatus,
        reason,
      },
    });
  }
}
