# Security model

## Authentication

- Passwords hashed with **Argon2id** (memory 19 MiB, time cost 2, parallelism 1).
- Password policy: at least 10 characters, containing a letter and a digit; max 128.
- Login is rate-limited (30/min/IP) and locks the account for 15 minutes after 10 failed attempts.
- Access token: HS256 JWT, 15 minutes, `{ sub, sid, tid, typ: "staff" }`, delivered as an HttpOnly,
  SameSite=Lax cookie (`tt_at`); `Secure` in production.
- Refresh token: 48 random bytes, only its SHA-256 hash is stored in `UserSession`, rotated on every
  refresh. Reuse of a rotated token revokes the entire token family and is audited.
- Logout revokes the session row and clears cookies. Password change/reset revokes other sessions.
- Customer sessions: opaque 32-byte token, hash stored, scoped to a table session, revoked when the
  table closes, expires after 6 hours by default.

## Authorization

- Roles: OWNER, MANAGER, CASHIER, KITCHEN, WAITER, VIEWER, PLATFORM_ADMIN.
- Permissions are rows (`RolePermission`) mapped to codes such as `payment.confirm`. Routes declare
  required permissions; a global guard evaluates them per request.
- Memberships can be restricted to specific branches. `BranchAccessService` is the only resolver for
  branch-scoped operations and validates tenant ownership and branch scope.
- Permission checks are never cached in the token; deactivation and role changes take effect on the
  next request.
- The web app also checks permissions per page (defence in depth), but the API is authoritative.

## Tenant isolation

- Every business table carries `tenantId`; branch-scoped tables also carry `branchId`.
- Services filter by the authenticated membership’s tenant and never accept a tenant id from the
  client.
- Cross-tenant and cross-branch attempts are covered by the integration suite (manager outside
  branch scope, second tenant, platform admin without membership).
- PostgreSQL RLS is **not** enabled; do not claim it.

## CSRF

- Cookie-authenticated mutations require `X-CSRF-Token` equal to the readable `tt_csrf` cookie.
- Bootstrap endpoints (login, register, refresh, forgot/reset, accept-invitation, first QR session)
  are exempt and rely on SameSite plus their own single-use tokens.
- Bearer-token clients are exempt because browsers never attach bearer headers automatically.

## QR and invitation tokens

- Table QR: 24 random bytes. Stored as SHA-256 for lookup and AES-256-GCM ciphertext so staff can
  re-download without invalidating. Rotation revokes all previous tokens for the table.
- Invitations and password resets: random, hashed, single-use, expiring (7 days / 60 minutes).
- Raw tokens are never written to logs or audit records.

## Input validation

- Global `ValidationPipe` with `whitelist` and `forbidNonWhitelisted`, so extra fields (for example a
  client-supplied `unitPrice`) are rejected with `400`.
- IDs are validated as UUIDs; enum values are constrained; string lengths bounded.
- Prisma parameterises queries; raw SQL uses tagged templates and explicit casts.

## Error handling and logging

- Uniform error envelope: `{ statusCode, code, message, details?, requestId, timestamp, path }`.
- Internal errors and Prisma details are logged, never returned.
- Request IDs are accepted only if they match a safe pattern, otherwise generated.
- Request logs contain method, path, status, duration and user id — never bodies or tokens.

## Transport and headers

- Helmet with a cross-origin resource policy suitable for images/exports; CSP disabled at the API
  (the web app owns CSP).
- CORS allow-list from `CORS_ORIGINS`, credentials enabled.
- Next.js sets `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`.

## Payments

- PromptPay payload generation is local and validated (CRC + structural parsing).
- Without a verified PSP integration, no payment is marked paid automatically.
- Confirmation requires `payment.confirm`, locks the row, checks state and amount, and is audited.
- Refunds require `payment.refund`, are capped, and are audited; the UI states money is not moved.

## Auditing

Recorded: logins and failures, logout, password changes/resets, invitation lifecycle, staff role and
branch changes, branch/tenant updates, menu creation and price changes, availability changes, order
creation/acceptance/cancellation, ticket rejection, bill creation/cancellation, payment
confirmation/expiry/refund, inventory adjustments, QR rotation/revocation, platform tenant changes.

Each record stores tenant/branch, actor and type, action, resource, safe before/after values, reason,
request id, IP and user agent. Passwords, tokens and payment secrets are never recorded.
