# API endpoints

Base path: `/api/v1`. Swagger UI: `/api/docs`. All responses are JSON; money is a decimal string.
Errors use `{ statusCode, code, message, details?, requestId, timestamp, path }`.

Auth column: **public** = no session, **staff** = staff cookie/bearer, **customer** = table session
cookie, **platform** = platform administrator.

## Auth

| Method | Path                      | Auth                    | Notes                                     |
| ------ | ------------------------- | ----------------------- | ----------------------------------------- |
| POST   | `/auth/login`             | public                  | Sets `tt_at`, `tt_rt`, `tt_csrf`          |
| POST   | `/auth/register`          | public                  | Creates restaurant + owner + first branch |
| POST   | `/auth/refresh`           | public (refresh cookie) | Rotates refresh token, detects reuse      |
| POST   | `/auth/logout`            | public                  | Revokes the session, clears cookies       |
| GET    | `/auth/me`                | staff                   | User, tenant, role, permissions, branches |
| GET    | `/auth/sessions`          | staff                   | Active sessions                           |
| DELETE | `/auth/sessions/:id`      | staff                   | Revoke a session                          |
| POST   | `/auth/change-password`   | staff                   | Revokes other sessions                    |
| POST   | `/auth/forgot-password`   | public                  | Always 204                                |
| POST   | `/auth/reset-password`    | public                  | Single-use token                          |
| POST   | `/auth/accept-invitation` | public                  | Creates/activates the member              |
| POST   | `/auth/switch-tenant`     | staff                   | New session bound to another membership   |

## Tenancy, staff, audit

| Method    | Path                            | Permission                              |
| --------- | ------------------------------- | --------------------------------------- |
| GET/PATCH | `/tenants/current`              | `restaurant.read` / `restaurant.update` |
| GET       | `/tenants/current/entitlements` | `restaurant.read`                       |
| GET/POST  | `/branches`                     | `branch.read` / `branch.create`         |
| GET/PATCH | `/branches/:id`                 | `branch.read` / `branch.update`         |
| GET       | `/staff`, `/staff/invitations`  | `staff.read`                            |
| POST      | `/staff/invitations`            | `staff.invite`                          |
| DELETE    | `/staff/invitations/:id`        | `staff.invite`                          |
| PATCH     | `/staff/:id`                    | `staff.update`                          |
| GET       | `/audit-logs`                   | `audit.read`                            |

## Floor, tables, QR, requests

| Method       | Path                                                                       | Permission                     |
| ------------ | -------------------------------------------------------------------------- | ------------------------------ |
| GET          | `/branches/:branchId/zones`, `/tables`                                     | `table.read`                   |
| POST         | `/branches/:branchId/zones`, `/tables`                                     | `table.update`                 |
| PATCH        | `/branches/:branchId/zones/:zoneId`, `/branches/:branchId/floor/positions` | `table.update`                 |
| DELETE       | `/branches/:branchId/zones/:zoneId`                                        | `table.update`                 |
| PATCH/DELETE | `/tables/:id`                                                              | `table.update`                 |
| POST         | `/tables/:id/open-session`                                                 | `table.update`                 |
| POST         | `/tables/:id/close-session`                                                | `table.update` + `bill.create` |
| POST         | `/tables/:id/move`, `/merge`, `/cleaned`                                   | `table.update`                 |
| POST         | `/tables/:id/qr`, `/qr/rotate`, `/qr/revoke`                               | `table.update`                 |
| GET          | `/tables/:id/qr/download?format=png                                        | svg`                           | `table.read` |
| GET          | `/table-requests?branchId=&status=`                                        | `table.read`                   |
| POST         | `/table-requests/:id/acknowledge`, `/resolve`                              | `table.update` or `order.read` |

## Menu and kitchen

| Method       | Path                                    | Permission                         |
| ------------ | --------------------------------------- | ---------------------------------- |
| GET/POST     | `/menu/categories`                      | `menu.read` / `menu.create`        |
| PATCH/DELETE | `/menu/categories/:id`                  | `menu.update` / `menu.delete`      |
| GET/POST     | `/menu/items`                           | `menu.read` / `menu.create`        |
| GET/PATCH    | `/menu/items/:id`                       | `menu.read` / `menu.update`        |
| POST         | `/menu/items/:id/availability`          | `menu.update`                      |
| GET/POST     | `/menu/modifier-groups`                 | `menu.read` / `menu.create`        |
| PATCH/DELETE | `/menu/modifier-groups/:id`             | `menu.update` / `menu.delete`      |
| GET          | `/kitchen/stations?branchId=`           | `kitchen.read`                     |
| GET          | `/kitchen/tickets?branchId=&stationId=` | `kitchen.read`                     |
| POST         | `/kitchen/tickets/:id/accept            | start                              | ready | reject` | `kitchen.update` |
| POST         | `/kitchen/items/:id/ready`              | `kitchen.update`                   |
| POST         | `/kitchen/items/:id/served`             | `kitchen.update` or `table.update` |

## Public customer flow

| Method   | Path                                         | Auth                                                   |
| -------- | -------------------------------------------- | ------------------------------------------------------ |
| GET      | `/public/qr/:token`                          | public — restaurant, table, live session, menu         |
| POST     | `/public/qr/:token/session`                  | public — opens/joins table session, sets `tt_customer` |
| GET      | `/public/customer-session`                   | customer — orders, requests, bill                      |
| GET      | `/public/customer-session/menu`              | customer                                               |
| POST     | `/public/customer-session/orders`            | customer — `Idempotency-Key` supported                 |
| POST     | `/public/customer-session/orders/:id/cancel` | customer — only while `PENDING`                        |
| GET/POST | `/public/customer-session/requests`          | customer                                               |

## Orders

| Method | Path                                                | Permission                         |
| ------ | --------------------------------------------------- | ---------------------------------- |
| GET    | `/orders?branchId=&status=&tableSessionId=&search=` | `order.read`                       |
| GET    | `/orders/:id`                                       | `order.read`                       |
| POST   | `/orders`                                           | `order.create`                     |
| POST   | `/orders/:id/accept                                 | preparing                          | ready` | `kitchen.update` |
| POST   | `/orders/:id/served`                                | `table.update` or `kitchen.update` |
| POST   | `/orders/:id/cancel`                                | `order.cancel`                     |

## Billing and payments

| Method | Path                                | Permission        |
| ------ | ----------------------------------- | ----------------- |
| GET    | `/bills?branchId=&status=`          | `payment.read`    |
| POST   | `/bills`                            | `bill.create`     |
| GET    | `/bills/:id`, `/bills/:id/receipt`  | `payment.read`    |
| POST   | `/bills/:id/split`                  | `bill.split`      |
| POST   | `/bills/:id/cancel`                 | `bill.create`     |
| POST   | `/payments`                         | `payment.confirm` |
| GET    | `/payments/:id`, `/payments/:id/qr` | `payment.read`    |
| POST   | `/payments/:id/promptpay            | confirm           | expire` | `payment.confirm` |
| POST   | `/payments/:id/refund`              | `payment.refund`  |

## Inventory, analytics, realtime, platform

| Method   | Path                                                                     | Permission                            |
| -------- | ------------------------------------------------------------------------ | ------------------------------------- |
| GET      | `/inventory/ingredients`, `/inventory/movements`, `/inventory/low-stock` | `inventory.read`                      |
| POST     | `/inventory/ingredients`, `/adjust`, `/waste`, `/count`                  | `inventory.adjust`                    |
| POST     | `/inventory/receive`                                                     | `inventory.receive`                   |
| GET/POST | `/recipes`                                                               | `inventory.read` / `inventory.adjust` |
| GET      | `/analytics/overview                                                     | sales                                 | menu-performance | operations    | branches` | `analytics.read` |
| GET      | `/realtime/events?since=&limit=`                                         | `order.read`                          |
| GET      | `/realtime/metrics`                                                      | `settings.manage`                     |
| GET      | `/platform/dashboard                                                     | tenants                               | plans            | subscriptions | usage     | system-health    | audit-logs` | platform admin |
| POST     | `/platform/tenants/:id/status`                                           | platform admin                        |
| PATCH    | `/platform/subscriptions/:tenantId`                                      | platform admin                        |

## Idempotency

`POST /public/customer-session/orders` and `POST /orders` accept `Idempotency-Key`. A repeat with the
same key returns the original order instead of creating a second one.
