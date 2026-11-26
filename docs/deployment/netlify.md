# Deploying to Netlify

## What Netlify can host

Netlify runs the Next.js app. It cannot run the NestJS process, PostgreSQL, or a long-lived Socket.IO
server, so the API and the database live somewhere else.

## The current demo

- **Web** — the Netlify site `tabletap-728`, built from this repository.
- **API** — the Nest process on a development machine, exposed through a Cloudflare tunnel.
- **Database** — a separate `tabletap_demo` database, seeded without real account data. Its PromptPay
  target is the non-payable placeholder `0000000000000`.
- **Realtime** — the browser socket points at the tunnel. A cross-site socket does not send the
  Netlify cookie, so the socket is unauthenticated from the public origin and the demo relies on the
  polling fallbacks: the guest session, the kitchen board and the POS bill refresh. Every write still
  goes through REST and PostgreSQL.

The tunnel URL is baked into the build through `API_URL` and `NEXT_PUBLIC_SOCKET_URL`. When the tunnel
changes, redeploy the site.

## Build settings

`netlify.toml` at the repository root:

```toml
[build]
  base = "apps/web"
  command = "pnpm --filter @tabletap/shared build && pnpm --filter @tabletap/web build"
  publish = "apps/web/.next"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

Build on Linux. A Windows build embeds backslashes in the server handler import, and the deployed
function fails with `ERR_MODULE_NOT_FOUND` for a path like `\u000bar\taskappsweb`. Netlify's build image
is Linux, so the simplest permanent setup is to connect the repository in the Netlify UI and let
Netlify build on push.

## Environment

| Variable                 | Used by                     | Value                |
| ------------------------ | --------------------------- | -------------------- |
| `API_URL`                | Next rewrites, server calls | public API origin    |
| `NEXT_PUBLIC_SOCKET_URL` | browser socket              | public API origin    |
| `WEB_URL`                | API, QR links               | the Netlify site URL |
| `CORS_ORIGINS`           | API                         | the Netlify site URL |

## Making it permanent

Run the API on a host that keeps a process alive and supports WebSockets, such as Render, Railway or
Fly.io, with a managed PostgreSQL instance. Then:

1. Point `API_URL` and `NEXT_PUBLIC_SOCKET_URL` at that API origin and redeploy the site.
2. Set `NODE_ENV=production`, real `JWT_ACCESS_SECRET` and `JWT_CUSTOMER_SECRET`, and
   `CORS_ORIGINS` to the site origin on the API.
3. Run `prisma migrate deploy` and the seed against the managed database.
4. Set `WEB_URL` to the public site so printed QR links resolve.

The API exposes `/api/v1/health`, `/api/v1/health/ready` and `/api/v1/metrics` for the platform's
health checks.

A serverless adaptation of the API is possible but not done here: the outbox dispatcher and the
payment-expiry timer assume a running process, and Socket.IO cannot run inside a Netlify Function.
