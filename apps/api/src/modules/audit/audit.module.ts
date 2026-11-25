import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface AuditInput {
  tenantId?: string | null;
  branchId?: string | null;
  actorId?: string | null;
  actorType?: 'USER' | 'STAFF' | 'CUSTOMER' | 'SYSTEM' | 'PLATFORM';
  action: string;
  resourceType: string;
  resourceId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

type Tx = Prisma.TransactionClient | PrismaService;

/**
 * Append-only audit trail for security- and money-relevant actions.
 * Never pass passwords, tokens or payment secrets into `before`/`after`.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditInput, tx: Tx = this.prisma): Promise<void> {
    try {
      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId ?? null,
          branchId: input.branchId ?? null,
          actorId: input.actorId ?? null,
          actorType: input.actorType === 'STAFF' ? 'USER' : (input.actorType ?? 'USER'),
          action: input.action,
          resourceType: input.resourceType,
          resourceId: input.resourceId ?? null,
          before: (input.before as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          after: (input.after as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          reason: input.reason ?? null,
          requestId: input.requestId ?? null,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
        },
      });
    } catch (error) {
      // An audit failure must be visible, but must not corrupt the business
      // transaction that already committed in a different connection.
      this.logger.error({ err: error, action: input.action }, 'Failed to write audit log');
      throw error;
    }
  }
}

@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
