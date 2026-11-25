# Production deployment notes

This build is suitable for a controlled trial, not an unattended public launch. The items below are
the minimum bar before real money is taken.

## Build

```bash
pnpm install --frozen-lockfile
pnpm --filter @tabletap/shared build
pnpm --filter @tabletap/api build
pnpm --filter @tabletap/web build
```

Docker images are provided:

```bash
docker build -f apps/api/Dockerfile -t tabletap-api .
docker build -f apps/web/Dockerfile -t tabletap-web .
```

## Required configuration

- Strong, distinct `JWT_ACCESS_SECRET` and `JWT_CUSTOMER_SECRET` (32+ random bytes).
- `NODE_ENV=production`, `CORS_ORIGINS` set to the real origin (no localhost).
- `DATABASE_URL` pointing at managed PostgreSQL with backups and PITR.
- `REDIS_URL` for future queues and multi-instance realtime.
- `SUBSCRIPTION_MODE=enforced` once plans are real.
- `SEED_DEMO_DATA=false` — never run the demo seed in production.
- TLS terminated at the proxy; cookies become `Secure` automatically in production.
- Put the web app and API behind one origin (the web app already rewrites `/api/*`), or set CORS and
  cookie domains deliberately.

## Migrations

```bash
pnpm --filter @tabletap/api exec prisma migrate deploy
```

Run as a release step, not on every container start, and take a backup first. Migrations are
forward-only in this build.

## Reverse proxy (Nginx sketch)

```nginx
server {
  listen 443 ssl http2;
  server_name app.example.com;

  location / {
    proxy_pass http://web:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /socket.io/ {
    proxy_pass http://api:4000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 300s;
  }

  location /api/ {
    proxy_pass http://api:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

If both apps are behind one origin, the web rewrite can be removed and `/api` proxied directly.

## Scaling caveats

- Realtime requires the Redis Socket.IO adapter before running more than one API instance; it is not
  wired in this build.
- Run exactly one outbox dispatcher, or keep `SKIP LOCKED` claiming (safe) and accept that any
  instance may publish.
- PostgreSQL is the only source of truth; Redis may be flushed without losing business state.

## Before taking real payments

1. Replace cashier-only confirmation with a verified PSP webhook (signature, amount, currency,
   merchant, provider transaction id, idempotent event storage).
2. Implement reconciliation reports.
3. Decide refund execution (provider API) and record provider references.
4. Have the receipt format reviewed against Thai fiscal requirements.
5. Add the Redis adapter, worker, backups/restore drills and monitoring alerts.
