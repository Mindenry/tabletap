# Database

Schema: `apps/api/prisma/schema.prisma` · migration: `apps/api/prisma/migrations/0001_init`.

PostgreSQL 16. Identifiers are UUIDs (`gen_random_uuid()`), timestamps are `timestamptz`, money is
`NUMERIC(12,2)`, quantities `NUMERIC(12,3)`, unit costs `NUMERIC(12,4)`.

## Domain groups

| Group        | Tables                                                                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity     | `User`, `UserSession`, `PasswordResetToken`, `Tenant`, `Membership`, `Role`, `Permission`, `RolePermission`, `MembershipBranch`, `Invitation`                                         |
| SaaS         | `SubscriptionPlan`, `Subscription`, `UsageRecord`                                                                                                                                     |
| Organisation | `Branch`, `StaffProfile`, `StaffShift`, `StaffAttendance`                                                                                                                             |
| Floor        | `TableZone`, `DiningTable`, `TableQrToken`, `TableSession`, `CustomerSession`, `TableRequest`                                                                                         |
| Menu         | `MenuCategory`, `MenuItem`, `MenuItemVariant`, `ModifierGroup`, `ModifierOption`, `MenuItemModifierGroup`, `MenuItemAvailability`, `Allergen`, `MenuItemAllergen`, `MenuPriceHistory` |
| Orders       | `Order`, `OrderItem`, `OrderItemModifier`, `OrderEvent`, `OrderCancellation`                                                                                                          |
| Kitchen      | `KitchenStation`, `MenuItemStation`, `KitchenTicket`, `KitchenTicketItem`, `KitchenEvent`                                                                                             |
| Billing      | `Bill`, `BillItem`, `BillOrder`, `BillSplit`, `BillSplitItem`, `Receipt`                                                                                                              |
| Payments     | `Payment`, `PaymentAttempt`, `PaymentProof`, `Refund`, `PaymentProviderEvent`                                                                                                         |
| Inventory    | `Ingredient`, `Recipe`, `RecipeVersion`, `RecipeItem`, `StockMovement`, `StockCount`, `StockCountItem`                                                                                |
| Growth       | `Promotion`, `PromotionRedemption`, `LoyaltyAccount`, `LoyaltyTransaction`                                                                                                            |
| Platform     | `AuditLog`, `UploadedFile`, `IdempotencyRecord`, `OutboxEvent`, `DocumentCounter`, `ExportJob`                                                                                        |

## Key constraints

- `Order (tenantId, number)` unique; `Order (tenantId, idempotencyKey)` unique.
- `Bill (tenantId, number)` unique; `BillOrder.orderId` unique (an order is on at most one bill).
- `Payment.reference` unique; `Refund.reference` unique; `Receipt.number` unique.
- `Membership (tenantId, userId)` unique; `Role (tenantId, key)` unique.
- `DiningTable (branchId, number)` unique; `TableZone (branchId, name)` unique.
- `MenuItem (tenantId, slug)` unique; `MenuCategory (tenantId, slug)` unique.
- `KitchenTicket (orderId, stationId)` unique (one ticket per station per order).
- `StockMovement.idempotencyKey` unique (deduction/reversal safety).
- `DocumentCounter (tenantId, branchId, type, period)` unique.
- Partial unique index `table_session_one_live_per_table` — one live session per table.

## Indexes chosen from query patterns

- Orders: `(tenantId, branchId, createdAt)`, `(branchId, status, createdAt)`, `(tableSessionId)`.
- Bills: `(tenantId, branchId, status, createdAt)`, `(tableSessionId)`.
- Payments: `(billId, status)`, `(tenantId, status, createdAt)`, `(expiresAt)`.
- Kitchen tickets: `(branchId, stationId, status, createdAt)`.
- Menu items: `(tenantId, categoryId, status)`, `(tenantId, isFeatured)`.
- Availability: `(menuItemId, branchId)` unique, `(branchId, isAvailable)`.
- Stock movements: `(branchId, createdAt)`, `(ingredientId, createdAt)`, `(referenceType, referenceId)`.
- Audit: `(tenantId, createdAt)`, `(tenantId, resourceType, resourceId)`, `(actorId, createdAt)`.
- Outbox: `(status, availableAt)`, `(tenantId, sequence)`.

## Historical integrity

- Orders and bills store price/name/variant snapshots.
- `MenuPriceHistory` records every base-price change with actor and reason.
- `OrderEvent` and `KitchenEvent` are append-only.
- Deleting a tenant cascades identity/menu rows, but orders/bills/payments use `Restrict` on branch
  and tenant references so financial history cannot be destroyed silently.

## Migrations

`prisma migrate deploy` applies migrations in order. `prisma migrate reset` is destructive and only
for local development. `prisma migrate dev` may hang in constrained environments when creating a
shadow database; generate SQL with `prisma migrate diff` and apply with `deploy` if so.
