import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import QRCode from 'qrcode';
import { canTransition, TABLE_REQUEST_TRANSITIONS, type TableRequestStatus } from '@tabletap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.module';
import { OutboxService } from '../realtime/outbox.service';
import { BranchAccessService } from '../tenancy/branch-access.service';
import { encryptSecret, decryptSecret } from '../../common/secret-box';
import { hashSecret, randomToken, tokenPrefix } from '../../common/crypto';
import { env } from '../../config/env';
import { ActorMeta } from '../../common/actor';
import { D, moneyString } from '../../common/money';
import type { StaffPrincipal } from '../auth/principal';
import type {
  CloseSessionDto,
  CreateTableDto,
  MergeTablesDto,
  MoveSessionDto,
  OpenSessionDto,
  UpdateTableDto,
} from './floor.dto';

const LIVE_SESSION_STATUSES = ['OPEN', 'BILL_REQUESTED', 'PAYMENT_PENDING'] as const;

@Injectable()
export class FloorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly branches: BranchAccessService,
    private readonly outbox: OutboxService,
  ) {}

  // ---------------------------------------------------------------- zones

  async listZones(principal: StaffPrincipal, branchId: string) {
    await this.branches.load(principal, branchId);
    return this.prisma.tableZone.findMany({
      where: { branchId },
      orderBy: { displayOrder: 'asc' },
      include: { _count: { select: { tables: true } } },
    });
  }

  async createZone(
    principal: StaffPrincipal,
    branchId: string,
    input: { name: string; displayOrder?: number },
    actor: ActorMeta,
  ) {
    await this.branches.load(principal, branchId);
    const zone = await this.prisma.tableZone.create({
      data: { branchId, name: input.name, displayOrder: input.displayOrder ?? 0 },
    });
    await this.audit.record(
      {
        tenantId: principal.tenantId,
        branchId,
        actorId: principal.userId,
        action: 'floor.zone.created',
        resourceType: 'TableZone',
        resourceId: zone.id,
        after: { name: zone.name },
        requestId: actor.requestId,
      },
      this.prisma,
    );
    return zone;
  }

  async updateZone(
    principal: StaffPrincipal,
    branchId: string,
    zoneId: string,
    input: { name: string; displayOrder?: number },
    actor: ActorMeta,
  ) {
    await this.branches.load(principal, branchId);
    const zone = await this.prisma.tableZone.findFirst({ where: { id: zoneId, branchId } });
    if (!zone) throw new NotFoundException({ message: 'Zone not found', code: 'NOT_FOUND' });
    return this.prisma.tableZone.update({
      where: { id: zoneId },
      data: { name: input.name, displayOrder: input.displayOrder ?? zone.displayOrder },
    });
  }

  async deleteZone(principal: StaffPrincipal, branchId: string, zoneId: string) {
    await this.branches.load(principal, branchId);
    const zone = await this.prisma.tableZone.findFirst({
      where: { id: zoneId, branchId },
      include: { _count: { select: { tables: true } } },
    });
    if (!zone) throw new NotFoundException({ message: 'Zone not found', code: 'NOT_FOUND' });
    if (zone._count.tables > 0) {
      throw new BadRequestException({
        message: 'Move the tables out of this zone first',
        code: 'ZONE_NOT_EMPTY',
      });
    }
    await this.prisma.tableZone.delete({ where: { id: zoneId } });
  }

  // --------------------------------------------------------------- tables

  async listTables(principal: StaffPrincipal, branchId: string) {
    await this.branches.load(principal, branchId);
    const tables = await this.prisma.diningTable.findMany({
      where: { branchId, archivedAt: null },
      orderBy: [{ zoneId: 'asc' }, { number: 'asc' }],
      include: {
        zone: true,
        sessions: {
          where: { status: { in: ['OPEN', 'BILL_REQUESTED', 'PAYMENT_PENDING'] } },
          take: 1,
          orderBy: { openedAt: 'desc' },
        },
        qrTokens: { where: { status: 'ACTIVE' }, select: { id: true, tokenPrefix: true, createdAt: true } },
      },
    });

    const sessionIds = tables.flatMap((table) => table.sessions.map((session) => session.id));
    const summaries = await this.sessionSummaries(sessionIds);

    return tables.map((table) => {
      const session = table.sessions[0];
      return {
        id: table.id,
        number: table.number,
        name: table.name,
        capacity: table.capacity,
        zoneId: table.zoneId,
        zone: table.zone ? { id: table.zone.id, name: table.zone.name } : null,
        status: table.status,
        posX: Number(table.posX),
        posY: Number(table.posY),
        width: Number(table.width),
        height: Number(table.height),
        qr: table.qrTokens[0]
          ? {
              id: table.qrTokens[0].id,
              prefix: table.qrTokens[0].tokenPrefix,
              createdAt: table.qrTokens[0].createdAt,
            }
          : null,
        session: session
          ? {
              id: session.id,
              status: session.status,
              openedAt: session.openedAt,
              guestCount: session.guestCount,
              ...(summaries.get(session.id) ?? {
                orderCount: 0,
                unpaidOrders: '0.00',
                outstandingBills: '0.00',
                outstandingTotal: '0.00',
                openRequests: 0,
              }),
            }
          : null,
      };
    });
  }

  private async sessionSummaries(sessionIds: string[]) {
    const map = new Map<
      string,
      {
        orderCount: number;
        unpaidOrders: string;
        outstandingBills: string;
        outstandingTotal: string;
        openRequests: number;
      }
    >();
    if (sessionIds.length === 0) return map;

    const [orders, bills, requests] = await Promise.all([
      this.prisma.order.findMany({
        where: { tableSessionId: { in: sessionIds }, status: { not: 'CANCELLED' } },
        select: { tableSessionId: true, total: true, billOrders: { select: { billId: true } } },
      }),
      this.prisma.bill.findMany({
        where: { tableSessionId: { in: sessionIds }, status: { in: ['OPEN', 'PARTIALLY_PAID'] } },
        select: { tableSessionId: true, total: true, paidTotal: true },
      }),
      this.prisma.tableRequest.groupBy({
        by: ['tableSessionId'],
        where: {
          tableSessionId: { in: sessionIds },
          status: { in: ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'] },
        },
        _count: { _all: true },
      }),
    ]);

    for (const sessionId of sessionIds) {
      const sessionOrders = orders.filter((order) => order.tableSessionId === sessionId);
      const unbilled = sessionOrders.filter((order) => order.billOrders.length === 0);
      const sessionBills = bills.filter((bill) => bill.tableSessionId === sessionId);
      const unpaidOrders = unbilled.reduce((acc, order) => acc.plus(order.total), D(0));
      const outstandingBills = sessionBills.reduce(
        (acc, bill) => acc.plus(bill.total).minus(bill.paidTotal),
        D(0),
      );
      map.set(sessionId, {
        orderCount: sessionOrders.length,
        unpaidOrders: moneyString(unpaidOrders),
        outstandingBills: moneyString(outstandingBills),
        outstandingTotal: moneyString(unpaidOrders.plus(outstandingBills)),
        openRequests: requests.find((r) => r.tableSessionId === sessionId)?._count._all ?? 0,
      });
    }
    return map;
  }

  async createTable(principal: StaffPrincipal, branchId: string, dto: CreateTableDto, actor: ActorMeta) {
    await this.branches.load(principal, branchId);
    const clash = await this.prisma.diningTable.findUnique({
      where: { branchId_number: { branchId, number: dto.number } },
    });
    if (clash) {
      throw new ConflictException({
        message: `Table ${dto.number} already exists`,
        code: 'TABLE_NUMBER_TAKEN',
      });
    }
    if (dto.zoneId) {
      const zone = await this.prisma.tableZone.findFirst({ where: { id: dto.zoneId, branchId } });
      if (!zone) throw new NotFoundException({ message: 'Zone not found', code: 'NOT_FOUND' });
    }

    const table = await this.prisma.diningTable.create({
      data: {
        branchId,
        number: dto.number,
        name: dto.name,
        capacity: dto.capacity ?? 4,
        zoneId: dto.zoneId,
        posX: D(dto.posX ?? 0),
        posY: D(dto.posY ?? 0),
        width: D(dto.width ?? 120),
        height: D(dto.height ?? 80),
      },
    });

    await this.audit.record(
      {
        tenantId: principal.tenantId,
        branchId,
        actorId: principal.userId,
        action: 'table.created',
        resourceType: 'DiningTable',
        resourceId: table.id,
        after: { number: table.number, capacity: table.capacity },
        requestId: actor.requestId,
      },
      this.prisma,
    );
    return table;
  }

  async updateTable(principal: StaffPrincipal, tableId: string, dto: UpdateTableDto, actor: ActorMeta) {
    const table = await this.loadTable(principal, tableId);

    if (dto.number && dto.number !== table.number) {
      const clash = await this.prisma.diningTable.findUnique({
        where: { branchId_number: { branchId: table.branchId, number: dto.number } },
      });
      if (clash)
        throw new ConflictException({ message: 'Table number already used', code: 'TABLE_NUMBER_TAKEN' });
    }
    if (dto.zoneId) {
      const zone = await this.prisma.tableZone.findFirst({
        where: { id: dto.zoneId, branchId: table.branchId },
      });
      if (!zone) throw new NotFoundException({ message: 'Zone not found', code: 'NOT_FOUND' });
    }

    if (dto.status && dto.status !== table.status) {
      const live = await this.prisma.tableSession.findFirst({
        where: { tableId, status: { in: ['OPEN', 'BILL_REQUESTED', 'PAYMENT_PENDING'] } },
      });
      if (live && (dto.status === 'AVAILABLE' || dto.status === 'CLEANING')) {
        throw new BadRequestException({
          message: 'Close the table session before changing this status',
          code: 'TABLE_HAS_OPEN_SESSION',
        });
      }
      if (!live && (dto.status === 'OCCUPIED' || dto.status === 'ORDERING')) {
        throw new BadRequestException({
          message: 'Open a table session to occupy a table',
          code: 'TABLE_SESSION_REQUIRED',
        });
      }
    }

    const updated = await this.prisma.diningTable.update({
      where: { id: tableId },
      data: {
        ...(dto.number !== undefined ? { number: dto.number } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        ...(dto.zoneId !== undefined ? { zoneId: dto.zoneId } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
    await this.audit.record(
      {
        tenantId: principal.tenantId,
        branchId: table.branchId,
        actorId: principal.userId,
        action: 'table.updated',
        resourceType: 'DiningTable',
        resourceId: tableId,
        before: { number: table.number, name: table.name, capacity: table.capacity, status: table.status },
        after: {
          number: updated.number,
          name: updated.name,
          capacity: updated.capacity,
          status: updated.status,
        },
        requestId: actor.requestId,
      },
      this.prisma,
    );
    return updated;
  }

  async archiveTable(principal: StaffPrincipal, tableId: string, actor: ActorMeta) {
    const table = await this.loadTable(principal, tableId);
    const live = await this.prisma.tableSession.findFirst({
      where: { tableId, status: { in: ['OPEN', 'BILL_REQUESTED', 'PAYMENT_PENDING'] } },
    });
    if (live) {
      throw new BadRequestException({
        message: 'Close the table session before archiving this table',
        code: 'TABLE_HAS_OPEN_SESSION',
      });
    }
    await this.prisma.$transaction([
      this.prisma.tableQrToken.updateMany({
        where: { tableId, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date() },
      }),
      this.prisma.diningTable.update({
        where: { id: tableId },
        data: { archivedAt: new Date(), status: 'AVAILABLE' },
      }),
    ]);
    await this.audit.record(
      {
        tenantId: principal.tenantId,
        branchId: table.branchId,
        actorId: principal.userId,
        action: 'table.archived',
        resourceType: 'DiningTable',
        resourceId: tableId,
        requestId: actor.requestId,
      },
      this.prisma,
    );
  }

  async updatePositions(
    principal: StaffPrincipal,
    branchId: string,
    positions: Array<{ id: string; posX: number; posY: number }>,
    actor: ActorMeta,
  ) {
    await this.branches.load(principal, branchId);
    const ids = positions.map((position) => position.id);
    const tables = await this.prisma.diningTable.findMany({
      where: { id: { in: ids }, branchId },
      select: { id: true },
    });
    if (tables.length !== ids.length) {
      throw new BadRequestException({ message: 'Unknown table in floor plan', code: 'TABLE_NOT_FOUND' });
    }
    await this.prisma.$transaction(
      positions.map((position) =>
        this.prisma.diningTable.update({
          where: { id: position.id },
          data: { posX: D(position.posX), posY: D(position.posY) },
        }),
      ),
    );
    await this.audit.record(
      {
        tenantId: principal.tenantId,
        branchId,
        actorId: principal.userId,
        action: 'floor.plan.updated',
        resourceType: 'Branch',
        resourceId: branchId,
        after: { tableCount: positions.length },
        requestId: actor.requestId,
      },
      this.prisma,
    );
  }

  // ------------------------------------------------------------- sessions

  async openSession(principal: StaffPrincipal, tableId: string, dto: OpenSessionDto, actor: ActorMeta) {
    const table = await this.loadTable(principal, tableId);

    const session = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "DiningTable" WHERE id = ${tableId}::uuid FOR UPDATE`;

      const existing = await tx.tableSession.findFirst({
        where: { tableId, status: { in: ['OPEN', 'BILL_REQUESTED', 'PAYMENT_PENDING'] } },
      });
      if (existing) {
        throw new ConflictException({
          message: 'This table already has an open session',
          code: 'SESSION_ALREADY_OPEN',
          details: { sessionId: existing.id },
        });
      }

      const created = await tx.tableSession.create({
        data: {
          tenantId: principal.tenantId,
          branchId: table.branchId,
          tableId,
          guestCount: dto.guestCount ?? 0,
          openedById: principal.userId,
          note: dto.note,
          status: 'OPEN',
        },
      });
      await tx.diningTable.update({ where: { id: tableId }, data: { status: 'OCCUPIED' } });
      return created;
    });

    await this.audit.record(
      {
        tenantId: principal.tenantId,
        branchId: table.branchId,
        actorId: principal.userId,
        action: 'table.session.opened',
        resourceType: 'TableSession',
        resourceId: session.id,
        after: { tableNumber: table.number, guestCount: session.guestCount },
        requestId: actor.requestId,
      },
      this.prisma,
    );
    return session;
  }

  async closeSession(principal: StaffPrincipal, tableId: string, dto: CloseSessionDto, actor: ActorMeta) {
    const table = await this.loadTable(principal, tableId);

    const closed = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "DiningTable" WHERE id = ${tableId}::uuid FOR UPDATE`;
      const session = await tx.tableSession.findFirst({
        where: { tableId, status: { in: ['OPEN', 'BILL_REQUESTED', 'PAYMENT_PENDING'] } },
      });
      if (!session) {
        throw new BadRequestException({ message: 'No open session on this table', code: 'NO_OPEN_SESSION' });
      }

      const unpaid = await tx.bill.findMany({
        where: { tableSessionId: session.id, status: { in: ['OPEN', 'PARTIALLY_PAID'] } },
        select: { id: true, number: true, total: true, paidTotal: true },
      });
      if (unpaid.length > 0) {
        throw new ConflictException({
          message: 'Bills are not fully paid',
          code: 'OUTSTANDING_BALANCE',
          details: {
            outstanding: unpaid.map((bill) => ({
              billId: bill.id,
              number: bill.number,
              due: moneyString(bill.total.minus(bill.paidTotal)),
            })),
          },
        });
      }

      const openOrders = await tx.order.count({
        where: { tableSessionId: session.id, status: { in: ['PENDING', 'ACCEPTED', 'PREPARING', 'READY'] } },
      });
      if (openOrders > 0) {
        throw new ConflictException({
          message: 'Orders are still in progress',
          code: 'ORDERS_IN_PROGRESS',
          details: { openOrders },
        });
      }

      const updated = await tx.tableSession.update({
        where: { id: session.id },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          closedById: principal.userId,
          ...(dto.note ? { note: dto.note } : {}),
        },
      });
      await tx.customerSession.updateMany({
        where: { tableSessionId: session.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.diningTable.update({ where: { id: tableId }, data: { status: 'CLEANING' } });
      return updated;
    });

    await this.audit.record(
      {
        tenantId: principal.tenantId,
        branchId: table.branchId,
        actorId: principal.userId,
        action: 'table.session.closed',
        resourceType: 'TableSession',
        resourceId: closed.id,
        after: { tableNumber: table.number },
        requestId: actor.requestId,
      },
      this.prisma,
    );
    return closed;
  }

  async moveSession(principal: StaffPrincipal, tableId: string, dto: MoveSessionDto, actor: ActorMeta) {
    const source = await this.loadTable(principal, tableId);
    const target = await this.loadTable(principal, dto.targetTableId);
    if (source.branchId !== target.branchId) {
      throw new BadRequestException({
        message: 'Tables must be in the same branch',
        code: 'BRANCH_MISMATCH',
      });
    }
    if (source.id === target.id) {
      throw new BadRequestException({ message: 'Choose a different table', code: 'SAME_TABLE' });
    }

    const moved = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "DiningTable" WHERE id IN (${source.id}::uuid, ${target.id}::uuid) ORDER BY id FOR UPDATE`;
      const session = await tx.tableSession.findFirst({
        where: { tableId: source.id, status: { in: ['OPEN', 'BILL_REQUESTED', 'PAYMENT_PENDING'] } },
      });
      if (!session) {
        throw new BadRequestException({ message: 'No open session on this table', code: 'NO_OPEN_SESSION' });
      }
      const targetSession = await tx.tableSession.findFirst({
        where: { tableId: target.id, status: { in: ['OPEN', 'BILL_REQUESTED', 'PAYMENT_PENDING'] } },
      });
      if (targetSession) {
        throw new ConflictException({ message: 'Target table is occupied', code: 'TARGET_OCCUPIED' });
      }
      await tx.tableSession.update({ where: { id: session.id }, data: { tableId: target.id } });
      await tx.order.updateMany({ where: { tableSessionId: session.id }, data: { tableId: target.id } });
      await tx.tableRequest.updateMany({
        where: { tableSessionId: session.id },
        data: { tableId: target.id },
      });
      await tx.diningTable.update({ where: { id: source.id }, data: { status: 'CLEANING' } });
      await tx.diningTable.update({ where: { id: target.id }, data: { status: source.status } });
      return session;
    });

    await this.audit.record(
      {
        tenantId: principal.tenantId,
        branchId: source.branchId,
        actorId: principal.userId,
        action: 'table.session.moved',
        resourceType: 'TableSession',
        resourceId: moved.id,
        before: { table: source.number },
        after: { table: target.number },
        reason: dto.reason,
        requestId: actor.requestId,
      },
      this.prisma,
    );
    return moved;
  }

  async mergeTables(principal: StaffPrincipal, targetTableId: string, dto: MergeTablesDto, actor: ActorMeta) {
    const target = await this.loadTable(principal, targetTableId);
    const source = await this.loadTable(principal, dto.sourceTableId);
    if (source.branchId !== target.branchId) {
      throw new BadRequestException({
        message: 'Tables must be in the same branch',
        code: 'BRANCH_MISMATCH',
      });
    }
    if (source.id === target.id) {
      throw new BadRequestException({ message: 'Choose a different table', code: 'SAME_TABLE' });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "DiningTable" WHERE id IN (${source.id}::uuid, ${target.id}::uuid) ORDER BY id FOR UPDATE`;
      const sourceSession = await tx.tableSession.findFirst({
        where: { tableId: source.id, status: { in: ['OPEN', 'BILL_REQUESTED', 'PAYMENT_PENDING'] } },
      });
      const targetSession = await tx.tableSession.findFirst({
        where: { tableId: target.id, status: { in: ['OPEN', 'BILL_REQUESTED', 'PAYMENT_PENDING'] } },
      });
      if (!sourceSession || !targetSession) {
        throw new BadRequestException({
          message: 'Both tables need an open session to merge',
          code: 'SESSION_REQUIRED',
        });
      }
      const sourceBills = await tx.bill.findMany({
        where: { tableSessionId: sourceSession.id, status: { in: ['OPEN', 'PARTIALLY_PAID'] } },
      });
      if (sourceBills.length > 0) {
        throw new BadRequestException({
          message: 'Cancel or settle the source table bills before merging',
          code: 'SOURCE_HAS_BILL',
        });
      }
      await tx.order.updateMany({
        where: { tableSessionId: sourceSession.id },
        data: { tableSessionId: targetSession.id, tableId: target.id },
      });
      await tx.tableRequest.updateMany({
        where: { tableSessionId: sourceSession.id },
        data: { tableSessionId: targetSession.id, tableId: target.id },
      });
      await tx.customerSession.updateMany({
        where: { tableSessionId: sourceSession.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.tableSession.update({
        where: { id: sourceSession.id },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          closedById: principal.userId,
          note: `Merged into table ${target.number}`,
        },
      });
      await tx.diningTable.update({ where: { id: source.id }, data: { status: 'CLEANING' } });
      return { targetSessionId: targetSession.id, movedOrders: true };
    });

    await this.audit.record(
      {
        tenantId: principal.tenantId,
        branchId: target.branchId,
        actorId: principal.userId,
        action: 'table.session.merged',
        resourceType: 'TableSession',
        resourceId: result.targetSessionId,
        after: { source: source.number, target: target.number },
        requestId: actor.requestId,
      },
      this.prisma,
    );
    return result;
  }

  async markCleaned(principal: StaffPrincipal, tableId: string, actor: ActorMeta) {
    const table = await this.loadTable(principal, tableId);
    const live = await this.prisma.tableSession.findFirst({
      where: { tableId, status: { in: ['OPEN', 'BILL_REQUESTED', 'PAYMENT_PENDING'] } },
    });
    if (live) {
      throw new BadRequestException({
        message: 'Table still has an open session',
        code: 'TABLE_HAS_OPEN_SESSION',
      });
    }
    const updated = await this.prisma.diningTable.update({
      where: { id: tableId },
      data: { status: 'AVAILABLE' },
    });
    await this.audit.record(
      {
        tenantId: principal.tenantId,
        branchId: table.branchId,
        actorId: principal.userId,
        action: 'table.cleaned',
        resourceType: 'DiningTable',
        resourceId: tableId,
        requestId: actor.requestId,
      },
      this.prisma,
    );
    return updated;
  }

  // ------------------------------------------------------------------- QR

  async ensureQr(principal: StaffPrincipal, tableId: string) {
    const table = await this.loadTable(principal, tableId);
    let token = await this.prisma.tableQrToken.findFirst({
      where: { tableId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });

    if (!token) {
      const raw = randomToken(24);
      token = await this.prisma.tableQrToken.create({
        data: {
          tableId,
          tokenHash: hashSecret(raw),
          tokenCiphertext: encryptSecret(raw),
          tokenPrefix: tokenPrefix(raw),
          createdById: principal.userId,
        },
      });
      await this.audit.record(
        {
          tenantId: principal.tenantId,
          branchId: table.branchId,
          actorId: principal.userId,
          action: 'qr.generated',
          resourceType: 'TableQrToken',
          resourceId: token.id,
          after: { tableNumber: table.number, prefix: token.tokenPrefix },
          requestId: undefined,
        },
        this.prisma,
      );
    }

    const raw = decryptSecret(token.tokenCiphertext);
    return {
      id: token.id,
      token: raw,
      prefix: token.tokenPrefix,
      url: `${env.webUrl}/menu/${raw}`,
      createdAt: token.createdAt,
    };
  }

  async rotateQr(principal: StaffPrincipal, tableId: string, actor: ActorMeta) {
    const table = await this.loadTable(principal, tableId);
    const raw = randomToken(24);
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.tableQrToken.updateMany({
        where: { tableId, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: new Date(), rotatedAt: new Date() },
      });
      return tx.tableQrToken.create({
        data: {
          tableId,
          tokenHash: hashSecret(raw),
          tokenCiphertext: encryptSecret(raw),
          tokenPrefix: tokenPrefix(raw),
          createdById: principal.userId,
          rotatedAt: new Date(),
        },
      });
    });
    await this.audit.record(
      {
        tenantId: principal.tenantId,
        branchId: table.branchId,
        actorId: principal.userId,
        action: 'qr.rotated',
        resourceType: 'TableQrToken',
        resourceId: created.id,
        after: { tableNumber: table.number, prefix: created.tokenPrefix },
        requestId: actor.requestId,
      },
      this.prisma,
    );
    return {
      id: created.id,
      token: raw,
      prefix: created.tokenPrefix,
      url: `${env.webUrl}/menu/${raw}`,
      createdAt: created.createdAt,
    };
  }

  async revokeQr(principal: StaffPrincipal, tableId: string, actor: ActorMeta) {
    const table = await this.loadTable(principal, tableId);
    const result = await this.prisma.tableQrToken.updateMany({
      where: { tableId, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
    await this.audit.record(
      {
        tenantId: principal.tenantId,
        branchId: table.branchId,
        actorId: principal.userId,
        action: 'qr.revoked',
        resourceType: 'DiningTable',
        resourceId: tableId,
        after: { revoked: result.count },
        requestId: actor.requestId,
      },
      this.prisma,
    );
    return { revoked: result.count };
  }

  async qrImage(principal: StaffPrincipal, tableId: string, format: 'png' | 'svg') {
    const table = await this.loadTable(principal, tableId);
    const qr = await this.ensureQr(principal, tableId);
    const label = `Table ${table.number}`;
    const options = {
      errorCorrectionLevel: 'M' as const,
      margin: 2,
      width: 1024,
      color: { dark: '#111111', light: '#FFFFFF' },
    };
    if (format === 'svg') {
      const svg = await QRCode.toString(qr.url, { ...options, type: 'svg' });
      return {
        buffer: Buffer.from(svg, 'utf8'),
        contentType: 'image/svg+xml',
        filename: `table-${table.number}.svg`,
        label,
      };
    }
    const buffer = await QRCode.toBuffer(qr.url, { ...options, type: 'png' });
    return { buffer, contentType: 'image/png', filename: `table-${table.number}.png`, label };
  }

  // --------------------------------------------------------------- helpers

  async listRequests(principal: StaffPrincipal, branchId: string, status?: string) {
    await this.branches.load(principal, branchId);
    const requests = await this.prisma.tableRequest.findMany({
      where: {
        tenantId: principal.tenantId,
        branchId,
        ...(status && status !== 'ALL'
          ? { status: status as never }
          : { status: { in: ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'] } }),
      },
      include: {
        table: { select: { id: true, number: true, name: true } },
        tableSession: { select: { id: true, openedAt: true, status: true } },
        assignedTo: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    return requests.map((request) => ({
      id: request.id,
      type: request.type,
      status: request.status,
      note: request.note,
      table: request.table,
      tableSessionId: request.tableSessionId,
      sessionOpenedAt: request.tableSession.openedAt,
      assignedTo: request.assignedTo,
      createdAt: request.createdAt,
      acknowledgedAt: request.acknowledgedAt,
      resolvedAt: request.resolvedAt,
      resolutionNote: request.resolutionNote,
    }));
  }

  async acknowledgeRequest(principal: StaffPrincipal, requestId: string, actor: ActorMeta) {
    return this.transitionRequest(principal, requestId, 'ACKNOWLEDGED', actor);
  }

  async resolveRequest(
    principal: StaffPrincipal,
    requestId: string,
    resolutionNote: string | undefined,
    actor: ActorMeta,
  ) {
    return this.transitionRequest(principal, requestId, 'RESOLVED', actor, resolutionNote);
  }

  private async transitionRequest(
    principal: StaffPrincipal,
    requestId: string,
    to: TableRequestStatus,
    actor: ActorMeta,
    resolutionNote?: string,
  ) {
    const request = await this.prisma.tableRequest.findUnique({ where: { id: requestId } });
    if (!request || request.tenantId !== principal.tenantId) {
      throw new NotFoundException({ message: 'Request not found', code: 'NOT_FOUND' });
    }
    await this.branches.load(principal, request.branchId);
    if (!canTransition(TABLE_REQUEST_TRANSITIONS, request.status, to)) {
      throw new ConflictException({
        message: `Cannot move a request from ${request.status} to ${to}`,
        code: 'INVALID_TRANSITION',
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.tableRequest.update({
        where: { id: requestId },
        data: {
          status: to,
          ...(to === 'ACKNOWLEDGED' ? { acknowledgedAt: new Date(), assignedToId: principal.userId } : {}),
          ...(to === 'RESOLVED'
            ? { resolvedAt: new Date(), resolutionNote: resolutionNote ?? 'Handled by staff' }
            : {}),
        },
      });
      await this.outbox.append(tx, {
        tenantId: request.tenantId,
        branchId: request.branchId,
        eventType: 'table.request.updated',
        aggregateType: 'TableRequest',
        aggregateId: requestId,
        payload: {
          requestId,
          status: to,
          tableId: request.tableId,
          tableSessionId: request.tableSessionId,
        },
      });
      await this.audit.record(
        {
          tenantId: request.tenantId,
          branchId: request.branchId,
          actorId: principal.userId,
          action: `table.request.${to.toLowerCase()}`,
          resourceType: 'TableRequest',
          resourceId: requestId,
          before: { status: request.status },
          after: { status: to },
          requestId: actor.requestId,
        },
        tx,
      );
      return result;
    });
    return { id: updated.id, status: updated.status };
  }

  private async loadTable(principal: StaffPrincipal, tableId: string) {
    const table = await this.prisma.diningTable.findUnique({ where: { id: tableId } });
    if (!table) throw new NotFoundException({ message: 'Table not found', code: 'NOT_FOUND' });
    await this.branches.load(principal, table.branchId);
    if (table.archivedAt) {
      throw new BadRequestException({ message: 'Table is archived', code: 'TABLE_ARCHIVED' });
    }
    return table;
  }
}
