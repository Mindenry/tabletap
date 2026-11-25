import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface OutboxInput {
  tenantId: string;
  branchId?: string | null;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  payloadVersion?: number;
  /** Extra metadata used by the dispatcher for room routing. */
  stationId?: string | null;
  customerSessionId?: string | null;
}

type Tx = Prisma.TransactionClient | PrismaService;

/**
 * Transactional outbox. Business transactions append events in the same
 * transaction that changes state, so an event can never be published for a
 * write that rolled back, and a committed write can never lose its event.
 *
 * The per-tenant sequence is allocated under a transaction-scoped advisory lock,
 * which keeps it gap-free for clients that use it to detect missed events.
 */
@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(private readonly prisma: PrismaService) {}

  async append(tx: Tx, input: OutboxInput): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.tenantId}))`;
    const rows = await tx.$queryRaw<Array<{ next: bigint }>>`
      SELECT COALESCE(MAX("sequence"), 0) + 1 AS next
      FROM "OutboxEvent"
      WHERE "tenantId" = ${input.tenantId}::uuid
    `;
    const sequence = rows[0]?.next ?? 1n;

    await tx.outboxEvent.create({
      data: {
        tenantId: input.tenantId,
        branchId: input.branchId ?? null,
        eventType: input.eventType,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        sequence,
        payload: {
          ...input.payload,
          ...(input.stationId ? { stationId: input.stationId } : {}),
          ...(input.customerSessionId ? { customerSessionId: input.customerSessionId } : {}),
        } as Prisma.InputJsonValue,
        payloadVersion: input.payloadVersion ?? 1,
        status: 'PENDING',
      },
    });

    this.logger.debug(`outbox ${input.eventType} seq=${sequence} tenant=${input.tenantId}`);
  }

  /**
   * Claims a batch without blocking other dispatchers. SKIP LOCKED makes this
   * safe to run in several API/worker processes at once.
   */
  async claimBatch(limit = 50): Promise<
    Array<{
      id: string;
      tenantId: string | null;
      branchId: string | null;
      eventType: string;
      aggregateType: string;
      aggregateId: string;
      sequence: bigint;
      payload: Prisma.JsonValue;
      payloadVersion: number;
      createdAt: Date;
      attempts: number;
    }>
  > {
    return this.prisma.$queryRaw`
      WITH claimed AS (
        SELECT "id" FROM "OutboxEvent"
        WHERE "status" = 'PENDING' AND "availableAt" <= NOW()
        ORDER BY "createdAt"
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "OutboxEvent" e
      SET "status" = 'PROCESSING', "attempts" = e."attempts" + 1
      FROM claimed
      WHERE e."id" = claimed."id"
      RETURNING e."id", e."tenantId", e."branchId", e."eventType", e."aggregateType",
                e."aggregateId", e."sequence", e."payload", e."payloadVersion", e."createdAt", e."attempts"
    `;
  }

  async markPublished(id: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: new Date(), lastError: null },
    });
  }

  async markFailed(id: string, error: string): Promise<void> {
    const row = await this.prisma.outboxEvent.findUnique({ where: { id }, select: { attempts: true } });
    const attempts = row?.attempts ?? 1;
    const exhausted = attempts >= 5;
    await this.prisma.outboxEvent.update({
      where: { id },
      data: {
        status: exhausted ? 'FAILED' : 'PENDING',
        lastError: error.slice(0, 500),
        availableAt: new Date(Date.now() + Math.min(60_000, 500 * 2 ** attempts)),
      },
    });
  }

  /** Releases rows stranded by a crash so they are retried. */
  async recoverStalled(): Promise<number> {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const result = await this.prisma.outboxEvent.updateMany({
      where: { status: 'PROCESSING', createdAt: { lt: tenMinutesAgo } },
      data: { status: 'PENDING', availableAt: new Date() },
    });
    return result.count;
  }

  async listForTenant(tenantId: string, since: bigint, limit = 100) {
    return this.prisma.outboxEvent.findMany({
      where: { tenantId, sequence: { gt: since }, status: 'PUBLISHED' },
      orderBy: { sequence: 'asc' },
      take: Math.min(limit, 200),
    });
  }
}
