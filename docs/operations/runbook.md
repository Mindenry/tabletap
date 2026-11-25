# Operations runbook

## Health

```bash
curl -s http://localhost:4100/api/v1/health
curl -s http://localhost:4100/api/v1/platform/system-health   # platform admin cookie required
```

`system-health` reports PostgreSQL latency, Redis ping, outbox backlog, failed outbox events, process
uptime, RSS and Node version.

## Start / stop

```bash
docker compose up -d postgres redis mailpit
pnpm dev
# stop
docker compose down            # keeps volumes
docker compose down -v         # destroys local data
```

## Outbox

- Pending events are claimed every 500 ms with `FOR UPDATE SKIP LOCKED`.
- `PROCESSING` rows older than 10 minutes are released back to `PENDING` on each tick.
- Failures retry with exponential backoff up to 5 attempts, then `FAILED`.
- Inspect:

```sql
SELECT "eventType", "status", count(*) FROM "OutboxEvent" GROUP BY 1,2 ORDER BY 3 DESC;
SELECT * FROM "OutboxEvent" WHERE "status" = 'FAILED' ORDER BY "createdAt" DESC LIMIT 20;
```

A failed outbox event does not roll back the business write; the state is still correct in
PostgreSQL. Re-queue manually by setting `status = 'PENDING', "availableAt" = now()`.

## Redis unavailable

- The API continues to serve requests; `system-health` reports `degraded`.
- Realtime still works within a single API instance (in-memory adapter).
- No business data is stored in Redis, so flushing it is safe.

## Database

```bash
# backup
docker exec tabletap-postgres pg_dump -U tabletap tabletap > backup.sql
# restore into an empty database
docker exec -i tabletap-postgres psql -U tabletap tabletap < backup.sql
```

Test restores before relying on them. Migrations are forward-only; restore from backup to roll back.

## Stuck table session

1. Check the bills: `SELECT number, status, total, "paidTotal" FROM "Bill" WHERE "tableSessionId" = '…';`
2. Check orders: `SELECT number, status FROM "Order" WHERE "tableSessionId" = '…';`
3. Settle or cancel the bill, cancel in-progress orders, then close the session from the floor screen.
4. If a customer session is stuck, close the table session; customer cookies are revoked on close.

## Duplicate payment suspicion

```sql
SELECT id, reference, status, amount, "amountPaid", "confirmedAt"
FROM "Payment" WHERE "billId" = '…' ORDER BY "createdAt";
```

A bill can never be overpaid: confirmation uses a conditional update. If two payments are `PENDING`,
expire or fail one before confirming the other.

## Tenant suspension

Platform console → Manage → Suspend. All sessions for that tenant’s users are revoked in the same
transaction. Reactivation does not restore old sessions; users must sign in again.

## Logs

The API logs one JSON line per request with request id, method, path, status, duration and user id.
It never logs bodies or tokens. Errors include the request id returned to the client, so a user
report can be traced to a log line.
