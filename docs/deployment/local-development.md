# Local development

## Requirements

- Node 20+ (developed on Node 26)
- pnpm 9+ (developed on 10.34)
- Docker + Docker Compose

## Ports

| Service                  | Port        | Why                       |
| ------------------------ | ----------- | ------------------------- |
| Web                      | 3100        | 3000 is commonly occupied |
| API                      | 4100        | 4000 is commonly occupied |
| PostgreSQL               | 5440        | avoids a local 5432/5433  |
| Redis                    | 6390        | avoids a local 6379/6380  |
| Mailpit SMTP / UI        | 1125 / 8125 |                           |
| MinIO (optional profile) | 9100 / 9101 | image may be unavailable  |

## Steps

```bash
cp .env.example .env
pnpm install
docker compose up -d postgres redis mailpit
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`pnpm dev` runs the shared package watcher, the API (Nest watch) and the web app (Next dev).

Useful commands:

```bash
pnpm --filter @tabletap/api test          # unit
pnpm --filter @tabletap/api test:integration
pnpm --filter @tabletap/web test:integration
pnpm --filter @tabletap/api db:studio
pnpm db:reset && pnpm db:seed             # clean demo
```

## Environment

The API loads `apps/api/.env` then the repository `.env`. The web app reads `apps/web/.env.local`
for `API_URL` and `NEXT_PUBLIC_API_URL`.

Key variables:

| Variable                                   | Purpose                                                       |
| ------------------------------------------ | ------------------------------------------------------------- |
| `DATABASE_URL`                             | PostgreSQL connection                                         |
| `REDIS_URL`                                | Optional Redis; used for health and future queues             |
| `JWT_ACCESS_SECRET`, `JWT_CUSTOMER_SECRET` | Token signing; must differ, 32+ chars                         |
| `QR_ENCRYPTION_KEY`                        | Optional; falls back to `JWT_ACCESS_SECRET` for QR ciphertext |
| `CORS_ORIGINS`                             | Comma-separated web origins                                   |
| `SUBSCRIPTION_MODE`                        | `development` (all features) or `enforced` (plan limits)      |
| `SEED_DEMO_DATA`, `DEMO_PASSWORD`          | Seed behaviour                                                |

`validateEnv()` refuses to start in production with the documented development secrets or with
`localhost` in `CORS_ORIGINS`.

## Common problems

- **`prisma migrate dev` hangs** — shadow database creation can be slow/blocked. Generate SQL with
  `prisma migrate diff` and apply with `prisma migrate deploy` (the committed migration is already
  generated).
- **CSS 404 / unstyled page** — almost always `next build` was run while `next dev` was live. Stop
  the dev server, delete `apps/web/.next`, and start dev again (or serve the production build).
- **Port in use** — change the mapping in `docker-compose.yml` and the matching `DATABASE_URL` /
  `REDIS_URL`.
- **Prisma generate fails with EPERM on Windows** — stop the running API (it holds the query engine
  DLL), regenerate, then restart.
- **Cookies not sent** — the browser must use the web origin (3100); the `/api/*` rewrite keeps
  requests same-origin.
