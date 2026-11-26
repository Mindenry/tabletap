import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Process-level counters for a Prometheus scrape. Multi-instance deployments
 * scrape each instance; the database gauges are identical across them.
 */
@Injectable()
export class MetricsService {
  private readonly startedAt = Date.now();
  private readonly counters = new Map<string, number>();

  record(method: string, status: number): void {
    const key = `${method}|${status}`;
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }

  async render(prisma: PrismaService): Promise<string> {
    const lines: string[] = [];
    const push = (line: string) => lines.push(line);

    push('# HELP tabletap_http_requests_total HTTP requests by method and status');
    push('# TYPE tabletap_http_requests_total counter');
    for (const [key, value] of this.counters) {
      const [method, status] = key.split('|');
      push(`tabletap_http_requests_total{method="${method}",status="${status}"} ${value}`);
    }

    push('# HELP tabletap_process_uptime_seconds Process uptime');
    push('# TYPE tabletap_process_uptime_seconds gauge');
    push(`tabletap_process_uptime_seconds ${Math.floor((Date.now() - this.startedAt) / 1000)}`);

    push('# HELP tabletap_process_resident_memory_bytes Resident set size');
    push('# TYPE tabletap_process_resident_memory_bytes gauge');
    push(`tabletap_process_resident_memory_bytes ${process.memoryUsage().rss}`);

    const [outboxPending, outboxFailed, openBills, openSessions] = await Promise.all([
      prisma.outboxEvent.count({ where: { status: 'PENDING' } }).catch(() => -1),
      prisma.outboxEvent.count({ where: { status: 'FAILED' } }).catch(() => -1),
      prisma.bill.count({ where: { status: { in: ['OPEN', 'PARTIALLY_PAID'] } } }).catch(() => -1),
      prisma.tableSession.count({ where: { closedAt: null } }).catch(() => -1),
    ]);

    push('# HELP tabletap_outbox_pending Realtime outbox events waiting to publish');
    push('# TYPE tabletap_outbox_pending gauge');
    push(`tabletap_outbox_pending ${outboxPending}`);

    push('# HELP tabletap_outbox_failed Realtime outbox events that exhausted retries');
    push('# TYPE tabletap_outbox_failed gauge');
    push(`tabletap_outbox_failed ${outboxFailed}`);

    push('# HELP tabletap_open_bills Bills not fully settled');
    push('# TYPE tabletap_open_bills gauge');
    push(`tabletap_open_bills ${openBills}`);

    push('# HELP tabletap_open_table_sessions Table sessions still open');
    push('# TYPE tabletap_open_table_sessions gauge');
    push(`tabletap_open_table_sessions ${openSessions}`);

    return `${lines.join('\n')}\n`;
  }
}
