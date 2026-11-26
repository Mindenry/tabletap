# Monitoring

Three endpoints, all under `/api/v1` and all unauthenticated so a probe or
scraper can reach them. Put them on the private network.

| Endpoint            | Purpose                                                         | Healthy response                               |
| ------------------- | --------------------------------------------------------------- | ---------------------------------------------- |
| `GET /health`       | Liveness: the process is up                                     | `200 { status: "ok" }`                         |
| `GET /health/ready` | Readiness: PostgreSQL answers and, if configured, Redis answers | `200 { status: "ready" }`, `503` when degraded |
| `GET /metrics`      | Prometheus text exposition                                      | `200 text/plain`                               |

`/health/ready` also reports `outboxPending`. The first call after a cold start
can return `503` while the lazy Redis client connects; probes should retry.

## Metrics

```
tabletap_http_requests_total{method,status}   counter (per process)
tabletap_process_uptime_seconds               gauge
tabletap_process_resident_memory_bytes        gauge
tabletap_outbox_pending                       gauge (database)
tabletap_outbox_failed                        gauge (database)
tabletap_open_bills                           gauge (database)
tabletap_open_table_sessions                  gauge (database)
```

Multi-instance: scrape every API instance. The database gauges are identical;
the request counters are per process.

## Prometheus scrape

```yaml
scrape_configs:
  - job_name: tabletap-api
    metrics_path: /api/v1/metrics
    static_configs:
      - targets: ['192.168.1.10:4100']
```

## Alerts worth having from day one

```yaml
groups:
  - name: tabletap
    rules:
      - alert: ApiNotReady
        expr: up{job="tabletap-api"} == 0
        for: 2m
      - alert: OutboxFailing
        expr: tabletap_outbox_failed > 0
        for: 5m
      - alert: OutboxBacklog
        expr: tabletap_outbox_pending > 50
        for: 10m
      - alert: Http5xx
        expr: sum(rate(tabletap_http_requests_total{status=~"5.."}[5m])) > 0.05
        for: 5m
```

## Logs

Every request logs one JSON line with `requestId`, `method`, `path`, `status`,
`durationMs` and, when signed in, `userId`. The same `requestId` is returned in
the `X-Request-Id` response header and stored in the audit log, so a support
ticket can be traced end to end.

## Realtime across instances

When `REDIS_URL` is set, the Socket.IO gateway attaches the Redis adapter, so an
event published by one API instance reaches sockets on every instance. Without
it (or if Redis is down) realtime stays on the in-memory adapter and works for a
single instance; clients fall back to polling without noticing.
