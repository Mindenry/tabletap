import { Global, Injectable, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma/prisma.service';

type Tx = Prisma.TransactionClient | PrismaService;

/**
 * Per-tenant document numbering (ORD-20261125-0001). The counter row is
 * incremented with a single atomic upsert, so concurrent order submissions
 * cannot produce duplicate numbers.
 */
@Injectable()
export class DocumentNumberService {
  constructor(private readonly prisma: PrismaService) {}

  async next(
    tx: Tx,
    input: { tenantId: string; branchId: string; branchCode?: string; type: string; date?: Date },
  ): Promise<string> {
    const now = input.date ?? new Date();
    // Business timezone is Asia/Bangkok for numbering; a date in another
    // timezone only shifts the day label, never uniqueness.
    const period = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .format(now)
      .replace(/-/g, '');

    const rows = await tx.$queryRaw<Array<{ value: number }>>`
      INSERT INTO "DocumentCounter" ("id", "tenantId", "branchId", "type", "period", "value")
      VALUES (gen_random_uuid(), ${input.tenantId}::uuid, ${input.branchId}::uuid, ${input.type}, ${period}, 1)
      ON CONFLICT ("tenantId", "branchId", "type", "period")
      DO UPDATE SET "value" = "DocumentCounter"."value" + 1
      RETURNING "value"
    `;
    const value = rows[0]?.value ?? 1;
    const prefix = input.type === 'ORDER' ? 'ORD' : input.type === 'BILL' ? 'BILL' : input.type;
    const branch = input.branchCode ? `${input.branchCode}-` : '';
    return `${prefix}-${branch}${period}-${String(value).padStart(4, '0')}`;
  }
}

@Global()
@Module({
  providers: [DocumentNumberService],
  exports: [DocumentNumberService],
})
export class CommonModule {}
