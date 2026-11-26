import { Global, Injectable, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { env } from '../../config/env';

/**
 * Optional Redis access. Redis is used for queues and caching; PostgreSQL stays
 * the source of truth. If Redis is unavailable the API keeps serving requests
 * and health reports `degraded` rather than crashing.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private lastError: string | null = null;

  get available(): boolean {
    return Boolean(env.redisUrl);
  }

  getClient(): Redis | null {
    if (!env.redisUrl) return null;
    if (!this.client) {
      this.client = new Redis(env.redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: null,
        enableOfflineQueue: false,
        retryStrategy: (times) => Math.min(times * 500, 5000),
      });
      this.client.on('error', (error) => {
        this.lastError = error.message;
        this.logger.warn({ err: error.message }, 'Redis error (non-fatal)');
      });
      this.client.connect().catch((error: unknown) => {
        this.lastError = error instanceof Error ? error.message : String(error);
      });
    }
    return this.client;
  }

  async ping(): Promise<{ ok: boolean; latencyMs: number | null; error?: string }> {
    const client = this.getClient();
    if (!client) return { ok: false, latencyMs: null, error: 'REDIS_URL not configured' };
    const start = Date.now();
    try {
      // The client connects lazily. A readiness probe can arrive before the
      // socket is ready, and with enableOfflineQueue off that would throw
      // "Stream isn't writeable" on the very first call after boot.
      if (client.status !== 'ready') await this.waitUntilReady(client);
      await client.ping();
      return { ok: true, latencyMs: Date.now() - start };
    } catch (error) {
      return {
        ok: false,
        latencyMs: null,
        error: error instanceof Error ? error.message : (this.lastError ?? 'unknown'),
      };
    }
  }

  /** Resolves once the client is usable, or rejects after a short timeout. */
  private waitUntilReady(client: Redis): Promise<void> {
    if (client.status === 'ready') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Redis did not become ready in time'));
      }, 2000);
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const cleanup = () => {
        clearTimeout(timer);
        client.off('ready', onReady);
        client.off('error', onError);
      };
      client.once('ready', onReady);
      client.once('error', onError);
      if (client.status === 'wait') void client.connect().catch(() => undefined);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
      this.client = null;
    }
  }
}

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
