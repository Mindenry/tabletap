import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { RealtimeEnvelope, RealtimeEventType } from '@tabletap/shared';
import { OutboxService } from './outbox.service';
import { RealtimeGateway } from './realtime.gateway';

/**
 * Polls the transactional outbox and pushes committed events to connected
 * clients. Multiple API instances can run this concurrently because the claim
 * query uses SKIP LOCKED.
 */
@Injectable()
export class OutboxDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcher.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;

  constructor(
    private readonly outbox: OutboxService,
    private readonly gateway: RealtimeGateway,
  ) {}

  onModuleInit(): void {
    if (process.env.DISABLE_OUTBOX_DISPATCHER === 'true') return;
    this.timer = setInterval(() => void this.tick(), 500);
    this.timer.unref?.();
    this.logger.log('Outbox dispatcher started');
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      await this.outbox.recoverStalled();
      const batch = await this.outbox.claimBatch(50);
      for (const row of batch) {
        try {
          const payload = (row.payload ?? {}) as Record<string, unknown>;
          const envelope: RealtimeEnvelope = {
            eventId: row.id,
            eventType: row.eventType as RealtimeEventType,
            tenantId: row.tenantId ?? '',
            branchId: row.branchId,
            aggregateType: row.aggregateType,
            aggregateId: row.aggregateId,
            sequence: Number(row.sequence),
            occurredAt: row.createdAt.toISOString(),
            payloadVersion: row.payloadVersion,
            payload,
          };
          this.gateway.publish(envelope, {
            stationId: typeof payload.stationId === 'string' ? payload.stationId : undefined,
            customerSessionId:
              typeof payload.customerSessionId === 'string' ? payload.customerSessionId : undefined,
          });
          await this.outbox.markPublished(row.id);
        } catch (error) {
          await this.outbox.markFailed(row.id, error instanceof Error ? error.message : String(error));
        }
      }
    } catch (error) {
      this.logger.warn({ err: error instanceof Error ? error.message : error }, 'Outbox tick failed');
    } finally {
      this.running = false;
    }
  }
}
