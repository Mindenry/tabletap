import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../auth/decorators';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../redis/redis.module';

@ApiTags('health')
@Controller()
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get('health')
  live() {
    return {
      status: 'ok',
      service: 'tabletap-api',
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness for a load balancer or orchestrator: the process can serve
   * traffic only when PostgreSQL answers and, if configured, Redis answers too.
   */
  @Public()
  @Get('health/ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    const dbStart = Date.now();
    let database: { ok: boolean; latencyMs: number; error?: string };
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = { ok: true, latencyMs: Date.now() - dbStart };
    } catch (error) {
      database = {
        ok: false,
        latencyMs: Date.now() - dbStart,
        error: error instanceof Error ? error.message.slice(0, 200) : 'database unavailable',
      };
    }

    const redis = this.redis.available
      ? await this.redis.ping()
      : { ok: true, latencyMs: null as number | null };
    const outboxPending = await this.prisma.outboxEvent
      .count({ where: { status: 'PENDING' } })
      .catch(() => -1);

    const ready = database.ok && redis.ok;
    if (!ready) res.status(503);
    return {
      status: ready ? 'ready' : 'degraded',
      database,
      redis: { configured: this.redis.available, ...redis },
      outboxPending,
      timestamp: new Date().toISOString(),
    };
  }
}
