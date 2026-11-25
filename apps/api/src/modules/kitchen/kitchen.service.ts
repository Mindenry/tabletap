import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  canTransition,
  KITCHEN_TICKET_TRANSITIONS,
  type KitchenTicketStatus,
  type OrderStatus,
} from '@tabletap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchAccessService } from '../tenancy/branch-access.service';
import { OutboxService } from '../realtime/outbox.service';
import { OrdersService } from '../orders/orders.service';
import { InventoryService } from '../inventory/inventory.service';
import { AuditService } from '../audit/audit.module';
import { ActorMeta } from '../../common/actor';
import type { StaffPrincipal } from '../auth/principal';

@Injectable()
export class KitchenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branches: BranchAccessService,
    private readonly outbox: OutboxService,
    private readonly orders: OrdersService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
  ) {}

  async listStations(principal: StaffPrincipal, branchId: string) {
    await this.branches.load(principal, branchId);
    return this.prisma.kitchenStation.findMany({
      where: { branchId },
      orderBy: { displayOrder: 'asc' },
      include: { _count: { select: { items: true } } },
    });
  }

  async listTickets(
    principal: StaffPrincipal,
    query: { branchId?: string; stationId?: string; includeServed?: boolean },
  ) {
    const branch = await this.branches.resolve(principal, query.branchId);
    const tickets = await this.prisma.kitchenTicket.findMany({
      where: {
        tenantId: principal.tenantId,
        branchId: branch.id,
        ...(query.stationId ? { stationId: query.stationId } : {}),
        ...(query.includeServed ? {} : { status: { in: ['PENDING', 'ACCEPTED', 'PREPARING', 'READY'] } }),
      },
      include: {
        station: { select: { id: true, name: true, code: true } },
        order: {
          select: {
            id: true,
            number: true,
            status: true,
            note: true,
            createdAt: true,
            table: { select: { id: true, number: true, name: true } },
            tableSession: { select: { id: true } },
          },
        },
        items: {
          include: {
            orderItem: {
              include: { modifiers: true },
            },
          },
        },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: 100,
    });

    return tickets.map((ticket) => ({
      id: ticket.id,
      number: ticket.number,
      status: ticket.status,
      priority: ticket.priority,
      station: ticket.station,
      order: {
        id: ticket.order.id,
        number: ticket.order.number,
        status: ticket.order.status,
        note: ticket.order.note,
        createdAt: ticket.order.createdAt,
        table: ticket.order.table,
        tableSessionId: ticket.order.tableSession.id,
      },
      createdAt: ticket.createdAt,
      acceptedAt: ticket.acceptedAt,
      readyAt: ticket.readyAt,
      rejectReason: ticket.rejectReason,
      items: ticket.items.map((item) => ({
        id: item.orderItem.id,
        ticketItemId: item.id,
        name: item.orderItem.nameSnapshot,
        variantName: item.orderItem.variantName,
        quantity: item.orderItem.quantity,
        status: item.status,
        note: item.orderItem.note,
        modifiers: item.orderItem.modifiers.map((modifier) => ({
          groupName: modifier.groupName,
          name: modifier.name,
        })),
      })),
    }));
  }

  async acceptTicket(principal: StaffPrincipal, ticketId: string, actor: ActorMeta) {
    const ticket = await this.loadTicket(principal, ticketId);
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ status: KitchenTicketStatus }>>`
        SELECT "status" FROM "KitchenTicket" WHERE "id" = ${ticketId}::uuid FOR UPDATE
      `;
      const current = rows[0];
      if (!current) throw new NotFoundException({ message: 'Ticket not found', code: 'NOT_FOUND' });
      if (!canTransition(KITCHEN_TICKET_TRANSITIONS, current.status, 'ACCEPTED')) {
        throw new ConflictException({
          message: `Cannot accept a ticket in ${current.status} state`,
          code: 'INVALID_TRANSITION',
        });
      }

      // Inventory is deducted once, at the moment the kitchen first accepts
      // anything for this order.
      await this.orders.acceptOrderInTransaction(tx, ticket.orderId, principal.userId, 'STAFF', actor, {
        markAllItems: false,
      });

      const ticketItems = await tx.kitchenTicketItem.findMany({ where: { ticketId } });
      const orderItemIds = ticketItems.map((item) => item.orderItemId);
      await tx.kitchenTicket.update({
        where: { id: ticketId },
        data: { status: 'ACCEPTED', acceptedById: principal.userId, acceptedAt: new Date() },
      });
      await tx.kitchenTicketItem.updateMany({
        where: { ticketId, status: 'PENDING' },
        data: { status: 'ACCEPTED' },
      });
      await tx.orderItem.updateMany({
        where: { id: { in: orderItemIds }, status: 'PENDING' },
        data: { status: 'ACCEPTED' },
      });
      await this.log(tx, ticketId, principal.userId, current.status, 'ACCEPTED', null);
      await this.emit(tx, ticket, 'ACCEPTED', actor);
    });
    return this.ticketView(principal, ticketId);
  }

  async startTicket(principal: StaffPrincipal, ticketId: string, actor: ActorMeta) {
    const ticket = await this.loadTicket(principal, ticketId);
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ status: KitchenTicketStatus }>>`
        SELECT "status" FROM "KitchenTicket" WHERE "id" = ${ticketId}::uuid FOR UPDATE
      `;
      const current = rows[0];
      if (!current) throw new NotFoundException({ message: 'Ticket not found', code: 'NOT_FOUND' });
      if (!canTransition(KITCHEN_TICKET_TRANSITIONS, current.status, 'PREPARING')) {
        throw new ConflictException({
          message: `Cannot start a ticket in ${current.status} state`,
          code: 'INVALID_TRANSITION',
        });
      }
      const orderRows = await tx.$queryRaw<Array<{ status: OrderStatus }>>`
        SELECT "status" FROM "Order" WHERE "id" = ${ticket.orderId}::uuid FOR UPDATE
      `;
      if (orderRows[0]?.status === 'ACCEPTED') {
        await this.orders.transitionOrder(tx, ticket.orderId, 'PREPARING', principal.userId, 'STAFF', actor);
      }
      const ticketItems = await tx.kitchenTicketItem.findMany({ where: { ticketId } });
      await tx.kitchenTicket.update({ where: { id: ticketId }, data: { status: 'PREPARING' } });
      await tx.kitchenTicketItem.updateMany({
        where: { ticketId, status: { in: ['PENDING', 'ACCEPTED'] } },
        data: { status: 'PREPARING' },
      });
      await tx.orderItem.updateMany({
        where: {
          id: { in: ticketItems.map((item) => item.orderItemId) },
          status: { in: ['PENDING', 'ACCEPTED'] },
        },
        data: { status: 'PREPARING' },
      });
      await this.log(tx, ticketId, principal.userId, current.status, 'PREPARING', null);
      await this.emit(tx, ticket, 'PREPARING', actor);
    });
    return this.ticketView(principal, ticketId);
  }

  async readyTicket(principal: StaffPrincipal, ticketId: string, actor: ActorMeta) {
    const ticket = await this.loadTicket(principal, ticketId);
    const affected = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ status: KitchenTicketStatus }>>`
        SELECT "status" FROM "KitchenTicket" WHERE "id" = ${ticketId}::uuid FOR UPDATE
      `;
      const current = rows[0];
      if (!current) throw new NotFoundException({ message: 'Ticket not found', code: 'NOT_FOUND' });
      if (!canTransition(KITCHEN_TICKET_TRANSITIONS, current.status, 'READY')) {
        throw new ConflictException({
          message: `Cannot mark a ticket in ${current.status} state ready`,
          code: 'INVALID_TRANSITION',
        });
      }
      const ticketItems = await tx.kitchenTicketItem.findMany({ where: { ticketId } });
      const orderItemIds = ticketItems.map((item) => item.orderItemId);
      await tx.kitchenTicket.update({
        where: { id: ticketId },
        data: { status: 'READY', readyAt: new Date() },
      });
      await tx.kitchenTicketItem.updateMany({
        where: { ticketId, status: { not: 'CANCELLED' } },
        data: { status: 'READY', readyAt: new Date() },
      });
      await tx.orderItem.updateMany({
        where: { id: { in: orderItemIds }, status: { not: 'CANCELLED' } },
        data: { status: 'READY' },
      });
      await this.orders.recomputeOrderStatus(tx, ticket.orderId);
      await this.log(tx, ticketId, principal.userId, current.status, 'READY', null);
      await this.emit(tx, ticket, 'READY', actor);
      return orderItemIds;
    });
    return { ticket: await this.ticketView(principal, ticketId), affectedItems: affected };
  }

  async readyItem(principal: StaffPrincipal, orderItemId: string, actor: ActorMeta) {
    const item = await this.loadOrderItem(principal, orderItemId);
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ status: string; ticketId: string | null }>>`
        SELECT oi."status", kti."ticketId"
        FROM "OrderItem" oi
        LEFT JOIN "KitchenTicketItem" kti ON kti."orderItemId" = oi."id"
        WHERE oi."id" = ${orderItemId}::uuid FOR UPDATE OF oi
      `;
      const current = rows[0];
      if (!current) throw new NotFoundException({ message: 'Order item not found', code: 'NOT_FOUND' });
      if (current.status === 'READY' || current.status === 'SERVED') return;
      if (!['PENDING', 'ACCEPTED', 'PREPARING'].includes(current.status)) {
        throw new ConflictException({ message: 'Item cannot be marked ready', code: 'INVALID_TRANSITION' });
      }
      await tx.orderItem.update({
        where: { id: orderItemId },
        data: { status: 'READY' },
      });
      if (current.ticketId) {
        await tx.kitchenTicketItem.updateMany({
          where: { orderItemId },
          data: { status: 'READY', readyAt: new Date() },
        });
        const remaining = await tx.kitchenTicketItem.count({
          where: { ticketId: current.ticketId, status: { notIn: ['READY', 'CANCELLED'] } },
        });
        if (remaining === 0) {
          await tx.kitchenTicket.update({
            where: { id: current.ticketId },
            data: { status: 'READY', readyAt: new Date() },
          });
        }
      }
      await this.orders.recomputeOrderStatus(tx, item.orderId);
      await this.outbox.append(tx, {
        tenantId: item.order.tenantId,
        branchId: item.order.branchId,
        eventType: 'kitchen.item.ready',
        aggregateType: 'OrderItem',
        aggregateId: orderItemId,
        payload: { orderItemId, orderId: item.orderId, name: item.nameSnapshot },
      });
    });
    return { id: orderItemId, status: 'READY' };
  }

  async serveItem(principal: StaffPrincipal, orderItemId: string, actor: ActorMeta) {
    const item = await this.loadOrderItem(principal, orderItemId);
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ status: string; ticketId: string | null }>>`
        SELECT oi."status", kti."ticketId"
        FROM "OrderItem" oi
        LEFT JOIN "KitchenTicketItem" kti ON kti."orderItemId" = oi."id"
        WHERE oi."id" = ${orderItemId}::uuid FOR UPDATE OF oi
      `;
      const current = rows[0];
      if (!current) throw new NotFoundException({ message: 'Order item not found', code: 'NOT_FOUND' });
      if (current.status === 'SERVED') return;
      if (!['READY', 'PREPARING', 'ACCEPTED'].includes(current.status)) {
        throw new ConflictException({ message: 'Item cannot be served yet', code: 'INVALID_TRANSITION' });
      }
      await tx.orderItem.update({ where: { id: orderItemId }, data: { status: 'SERVED' } });
      if (current.ticketId) {
        await tx.kitchenTicketItem.updateMany({
          where: { orderItemId },
          data: { status: 'SERVED' },
        });
        const remaining = await tx.kitchenTicketItem.count({
          where: { ticketId: current.ticketId, status: { notIn: ['SERVED', 'CANCELLED'] } },
        });
        if (remaining === 0) {
          await tx.kitchenTicket.update({
            where: { id: current.ticketId },
            data: { status: 'SERVED', servedAt: new Date() },
          });
        }
      }
      const status = await this.orders.recomputeOrderStatus(tx, item.orderId);
      await this.outbox.append(tx, {
        tenantId: item.order.tenantId,
        branchId: item.order.branchId,
        eventType: 'order.updated',
        aggregateType: 'Order',
        aggregateId: item.orderId,
        payload: { orderId: item.orderId, status, orderItemId, itemStatus: 'SERVED' },
      });
    });
    return { id: orderItemId, status: 'SERVED' };
  }

  async rejectTicket(principal: StaffPrincipal, ticketId: string, reason: string, actor: ActorMeta) {
    const ticket = await this.loadTicket(principal, ticketId);
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ status: KitchenTicketStatus }>>`
        SELECT "status" FROM "KitchenTicket" WHERE "id" = ${ticketId}::uuid FOR UPDATE
      `;
      const current = rows[0];
      if (!current) throw new NotFoundException({ message: 'Ticket not found', code: 'NOT_FOUND' });
      if (!canTransition(KITCHEN_TICKET_TRANSITIONS, current.status, 'REJECTED')) {
        throw new ConflictException({
          message: 'A served ticket cannot be rejected',
          code: 'INVALID_TRANSITION',
        });
      }
      const ticketItems = await tx.kitchenTicketItem.findMany({ where: { ticketId } });
      const orderItemIds = ticketItems.map((item) => item.orderItemId);

      await tx.kitchenTicket.update({
        where: { id: ticketId },
        data: { status: 'REJECTED', rejectedAt: new Date(), rejectReason: reason },
      });
      await tx.kitchenTicketItem.updateMany({
        where: { ticketId },
        data: { status: 'CANCELLED' },
      });
      await tx.orderItem.updateMany({
        where: { id: { in: orderItemIds }, status: { not: 'SERVED' } },
        data: { status: 'CANCELLED' },
      });

      // Return only this ticket's ingredients to stock.
      await this.inventory.reverseForOrder(
        tx,
        ticket.orderId,
        principal.userId,
        `Ticket rejected: ${reason}`,
        orderItemIds,
      );

      const status = await this.orders.recomputeOrderStatus(tx, ticket.orderId);
      if (status === 'CANCELLED') {
        await tx.order.update({
          where: { id: ticket.orderId },
          data: { cancelledAt: new Date(), cancelReason: reason },
        });
        await tx.orderCancellation.upsert({
          where: { orderId: ticket.orderId },
          create: {
            orderId: ticket.orderId,
            reason,
            cancelledById: principal.userId,
            refundRequired: true,
            inventoryReversed: true,
          },
          update: { reason },
        });
        await this.outbox.append(tx, {
          tenantId: ticket.tenantId,
          branchId: ticket.branchId,
          eventType: 'order.cancelled',
          aggregateType: 'Order',
          aggregateId: ticket.orderId,
          payload: { orderId: ticket.orderId, status: 'CANCELLED', reason },
        });
      }

      await this.log(tx, ticketId, principal.userId, current.status, 'REJECTED', reason);
      await this.emit(tx, ticket, 'REJECTED', actor, reason);
      await this.audit.record(
        {
          tenantId: ticket.tenantId,
          branchId: ticket.branchId,
          actorId: principal.userId,
          action: 'kitchen.ticket.rejected',
          resourceType: 'KitchenTicket',
          resourceId: ticketId,
          reason,
          requestId: actor.requestId,
        },
        tx,
      );
    });
    return this.ticketView(principal, ticketId);
  }

  async ticketView(principal: StaffPrincipal, ticketId: string) {
    const ticket = await this.loadTicket(principal, ticketId);
    return { id: ticket.id, number: ticket.number, status: ticket.status };
  }

  private async emit(
    tx: Prisma.TransactionClient,
    ticket: {
      id: string;
      tenantId: string;
      branchId: string;
      stationId: string;
      number: string;
      orderId: string;
    },
    status: string,
    _actor: ActorMeta,
    reason?: string,
  ): Promise<void> {
    await this.outbox.append(tx, {
      tenantId: ticket.tenantId,
      branchId: ticket.branchId,
      eventType: 'kitchen.ticket.updated',
      aggregateType: 'KitchenTicket',
      aggregateId: ticket.id,
      stationId: ticket.stationId,
      payload: {
        ticketId: ticket.id,
        ticketNumber: ticket.number,
        status,
        orderId: ticket.orderId,
        ...(reason ? { reason } : {}),
      },
    });
    await this.outbox.append(tx, {
      tenantId: ticket.tenantId,
      branchId: ticket.branchId,
      eventType: 'order.updated',
      aggregateType: 'Order',
      aggregateId: ticket.orderId,
      payload: { orderId: ticket.orderId, ticketStatus: status },
    });
  }

  private async log(
    tx: Prisma.TransactionClient,
    ticketId: string,
    actorUserId: string | null,
    fromStatus: KitchenTicketStatus | null,
    toStatus: KitchenTicketStatus,
    reason: string | null,
  ): Promise<void> {
    await tx.kitchenEvent.create({
      data: {
        ticketId,
        actorUserId,
        fromStatus: fromStatus ?? undefined,
        toStatus,
        reason,
      },
    });
  }

  private async loadTicket(principal: StaffPrincipal, ticketId: string) {
    const ticket = await this.prisma.kitchenTicket.findUnique({ where: { id: ticketId } });
    if (!ticket || ticket.tenantId !== principal.tenantId) {
      throw new NotFoundException({ message: 'Ticket not found', code: 'NOT_FOUND' });
    }
    await this.branches.load(principal, ticket.branchId);
    return ticket;
  }

  private async loadOrderItem(principal: StaffPrincipal, orderItemId: string) {
    const item = await this.prisma.orderItem.findUnique({
      where: { id: orderItemId },
      include: { order: true },
    });
    if (!item || item.order.tenantId !== principal.tenantId) {
      throw new NotFoundException({ message: 'Order item not found', code: 'NOT_FOUND' });
    }
    await this.branches.load(principal, item.order.branchId);
    return item;
  }
}
