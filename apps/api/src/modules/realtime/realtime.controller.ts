import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { CurrentStaff, RequirePermissions } from '../auth/decorators';
import type { StaffPrincipal } from '../auth/principal';
import { OutboxService } from './outbox.service';
import { RealtimeGateway } from './realtime.gateway';

class SyncQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  since?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

@ApiTags('realtime')
@ApiBearerAuth()
@Controller('realtime')
export class RealtimeController {
  constructor(
    private readonly outbox: OutboxService,
    private readonly gateway: RealtimeGateway,
  ) {}

  /**
   * Cursor-based resynchronisation. A client that reconnects with `since` equal
   * to its last seen sequence fetches everything it missed, in order.
   */
  @Get('events')
  @RequirePermissions('order.read')
  async events(@CurrentStaff() principal: StaffPrincipal, @Query() query: SyncQueryDto) {
    const rows = await this.outbox.listForTenant(
      principal.tenantId,
      BigInt(query.since ?? 0),
      query.limit ?? 100,
    );
    return {
      items: rows.map((row) => ({
        eventId: row.id,
        eventType: row.eventType,
        branchId: row.branchId,
        aggregateType: row.aggregateType,
        aggregateId: row.aggregateId,
        sequence: Number(row.sequence),
        occurredAt: row.createdAt.toISOString(),
        payloadVersion: row.payloadVersion,
        payload: row.payload,
      })),
      latestSequence: rows.length > 0 ? Number(rows[rows.length - 1]!.sequence) : (query.since ?? 0),
    };
  }

  @Get('metrics')
  @RequirePermissions('settings.manage')
  metrics() {
    return this.gateway.serverMetrics();
  }
}
