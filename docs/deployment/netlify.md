# Deploying to Netlify

## What Netlify can host

Netlify runs the Next.js app. It cannot run the NestJS process, PostgreSQL or a long-lived Socket.IO
server, so the full product needs an API host and a database somewhere else.

## The public demo

The site at <https://tabletap-728.netlify.app> runs with no backend at all:

- Server renders resolve from `apps/web/lib/demo/fixtures.json`, a snapshot of the seeded restaurant.
- `DEMO_MODE` replaces the login form with a role picker. The chosen role is stored in a
  `demo_role` cookie and `/auth/me` resolves to that role's fixture.
- Client reads resolve from the same snapshot. Guest and staff writes share one `localStorage`
  store: guest orders create kitchen tickets, ticket transitions move the guest status, POS payments
  settle the guest bill, and request actions update the guest view.
- Sockets are replaced by a no-op object; the guest screen, kitchen board and POS poll instead.
- Actions outside the sandbox return a short demo message.
- The badge at the bottom of the screen resets the browser state and links back to the role picker.
- The PromptPay target is the non-payable placeholder `0000000000000`. The guest sheet settles on
  **Check payment**.

The build sets `NEXT_PUBLIC_DEMO_MODE=1`. Without it, the app calls the real API.

## Build settings

`netlify.toml` at the repository root:

```toml
[build]
  base = "apps/web"
  command = "pnpm --filter @tabletap/shared build && pnpm --filter @tabletap/web build"
  publish = "apps/web/.next"

[build.environment]
  NEXT_PUBLIC_DEMO_MODE = "1"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

Build on Linux. A Windows build embeds backslashes in the server handler import, and the deployed
function fails with `ERR_MODULE_NOT_FOUND` for a path like `\u000bar\taskappsweb`. Netlify's build image
is Linux, so connecting the repository in the Netlify UI and letting Netlify build on push is the
simplest setup.

## Running the full stack

To serve the real application:

1. Run the API on a host that keeps a process alive and supports WebSockets (Render, Railway, Fly.io)
   with a managed PostgreSQL instance.
2. Build the web app without `NEXT_PUBLIC_DEMO_MODE` and set `API_URL` to the API origin.
3. Set `NEXT_PUBLIC_SOCKET_URL` to the same origin.
4. On the API, set `NODE_ENV=production`, real `JWT_ACCESS_SECRET` and `JWT_CUSTOMER_SECRET`,
   `CORS_ORIGINS` to the site origin, and `WEB_URL` to the public site for printed QR links.
5. Run `prisma migrate deploy` and the seed against the managed database.

The API exposes `/api/v1/health`, `/api/v1/health/ready` and `/api/v1/metrics` for health checks.

A serverless adaptation of the API is possible but not done here: the outbox dispatcher and the
payment-expiry timer assume a running process, and Socket.IO cannot run inside a Netlify Function.
