import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BranchAccessService } from '../tenancy/branch-access.service';
import { AuditService } from '../audit/audit.module';
import { OutboxService } from '../realtime/outbox.service';
import { EntitlementsService } from '../tenancy/entitlements.service';
import { convertQuantity, isUnit } from '../../common/units';
import { D, qtyString, roundQty } from '../../common/money';
import { ActorMeta } from '../../common/actor';
import type { StaffPrincipal } from '../auth/principal';
import type {
  AdjustStockDto,
  CreateIngredientDto,
  MovementsQueryDto,
  ReceiveStockDto,
  StockCountDto,
  UpdateIngredientDto,
  UpsertRecipeDto,
  WasteStockDto,
} from './inventory.dto';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branches: BranchAccessService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly entitlements: EntitlementsService,
  ) {}

  private async requireFeature(tenantId: string): Promise<void> {
    await this.entitlements.assertFeature(tenantId, 'inventory');
  }

  // ------------------------------------------------------------ ingredients

  async listIngredients(principal: StaffPrincipal, branchId?: string, search?: string) {
    await this.requireFeature(principal.tenantId);
    const branch = await this.branches.resolve(principal, branchId);
    const ingredients = await this.prisma.ingredient.findMany({
      where: {
        tenantId: principal.tenantId,
        branchId: branch.id,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { sku: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      take: 500,
    });
    return ingredients.map((ingredient) => ({
      id: ingredient.id,
      name: ingredient.name,
      sku: ingredient.sku,
      category: ingredient.category,
      unit: ingredient.unit,
      costPerUnit: ingredient.costPerUnit.toFixed(4),
      minStock: qtyString(ingredient.minStock),
      currentStock: qtyString(ingredient.currentStock),
      storageLocation: ingredient.storageLocation,
      isActive: ingredient.isActive,
      lowStock: ingredient.currentStock.lessThanOrEqualTo(ingredient.minStock),
      stockValue: ingredient.currentStock.times(ingredient.costPerUnit).toDecimalPlaces(2).toFixed(2),
    }));
  }

  async createIngredient(principal: StaffPrincipal, dto: CreateIngredientDto, actor: ActorMeta) {
    await this.requireFeature(principal.tenantId);
    const branch = await this.branches.resolve(principal, dto.branchId);
    if (!isUnit(dto.unit))
      throw new BadRequestException({ message: 'Unsupported unit', code: 'INVALID_UNIT' });

    const ingredient = await this.prisma.$transaction(async (tx) => {
      const created = await tx.ingredient.create({
        data: {
          tenantId: principal.tenantId,
          branchId: branch.id,
          name: dto.name,
          sku: dto.sku,
          category: dto.category,
          unit: dto.unit,
          costPerUnit: D(dto.costPerUnit ?? 0),
          minStock: D(dto.minStock ?? 0),
          currentStock: D(dto.currentStock ?? 0),
          storageLocation: dto.storageLocation,
          isActive: dto.isActive ?? true,
        },
      });
      if ((dto.currentStock ?? 0) > 0) {
        await tx.stockMovement.create({
          data: {
            tenantId: principal.tenantId,
            branchId: branch.id,
            ingredientId: created.id,
            type: 'RECEIVE',
            quantity: D(dto.currentStock as number),
            unit: created.unit,
            balanceAfter: created.currentStock,
            referenceType: 'OPENING',
            referenceId: created.id,
            actorId: principal.userId,
            reason: 'Opening stock',
            idempotencyKey: `opening:${created.id}`,
          },
        });
      }
      return created;
    });

    await this.audit.record(
      {
        tenantId: principal.tenantId,
        branchId: branch.id,
        actorId: principal.userId,
        action: 'inventory.ingredient.created',
        resourceType: 'Ingredient',
        resourceId: ingredient.id,
        after: {
          name: ingredient.name,
          unit: ingredient.unit,
          currentStock: qtyString(ingredient.currentStock),
        },
        requestId: actor.requestId,
      },
      this.prisma,
    );
    return ingredient;
  }

  async updateIngredient(principal: StaffPrincipal, id: string, dto: UpdateIngredientDto, actor: ActorMeta) {
    await this.requireFeature(principal.tenantId);
    const existing = await this.findIngredient(principal, id);
    const updated = await this.prisma.ingredient.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.costPerUnit !== undefined ? { costPerUnit: D(dto.costPerUnit) } : {}),
        ...(dto.minStock !== undefined ? { minStock: D(dto.minStock) } : {}),
        ...(dto.storageLocation !== undefined ? { storageLocation: dto.storageLocation } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.audit.record(
      {
        tenantId: principal.tenantId,
        branchId: existing.branchId,
        actorId: principal.userId,
        action: 'inventory.ingredient.updated',
        resourceType: 'Ingredient',
        resourceId: id,
        before: { name: existing.name, minStock: qtyString(existing.minStock) },
        after: { name: updated.name, minStock: qtyString(updated.minStock) },
        requestId: actor.requestId,
      },
      this.prisma,
    );
    return updated;
  }

  // --------------------------------------------------------------- movements

  async receive(principal: StaffPrincipal, dto: ReceiveStockDto, actor: ActorMeta) {
    await this.requireFeature(principal.tenantId);
    const ingredient = await this.findIngredient(principal, dto.ingredientId);
    const quantity = this.convertOrThrow(dto.quantity, dto.unit ?? ingredient.unit, ingredient.unit);

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.ingredient.update({
        where: { id: ingredient.id },
        data: {
          currentStock: { increment: quantity },
          ...(dto.costPerUnit !== undefined ? { costPerUnit: D(dto.costPerUnit) } : {}),
        },
      });
      const movement = await tx.stockMovement.create({
        data: {
          tenantId: principal.tenantId,
          branchId: ingredient.branchId,
          ingredientId: ingredient.id,
          type: 'RECEIVE',
          quantity,
          unit: ingredient.unit,
          balanceAfter: updated.currentStock,
          referenceType: 'MANUAL',
          referenceId: dto.supplier ?? null,
          actorId: principal.userId,
          reason: dto.reason ?? 'Stock received',
          idempotencyKey: `receive:${Date.now()}:${ingredient.id}:${Math.random().toString(36).slice(2, 10)}`,
        },
      });
      return { updated, movement };
    });

    await this.audit.record(
      {
        tenantId: principal.tenantId,
        branchId: ingredient.branchId,
        actorId: principal.userId,
        action: 'inventory.received',
        resourceType: 'Ingredient',
        resourceId: ingredient.id,
        after: { quantity: qtyString(quantity), balance: qtyString(result.updated.currentStock) },
        requestId: actor.requestId,
      },
      this.prisma,
    );
    return result.movement;
  }

  async adjust(principal: StaffPrincipal, dto: AdjustStockDto, actor: ActorMeta) {
    await this.requireFeature(principal.tenantId);
    const ingredient = await this.findIngredient(principal, dto.ingredientId);
    const target = D(dto.newQuantity);
    const delta = target.minus(ingredient.currentStock);

    const movement = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.ingredient.update({
        where: { id: ingredient.id },
        data: { currentStock: target },
      });
      return tx.stockMovement.create({
        data: {
          tenantId: principal.tenantId,
          branchId: ingredient.branchId,
          ingredientId: ingredient.id,
          type: 'ADJUST',
          quantity: delta,
          unit: ingredient.unit,
          balanceAfter: updated.currentStock,
          referenceType: 'MANUAL',
          actorId: principal.userId,
          reason: dto.reason,
          idempotencyKey: `adjust:${Date.now()}:${ingredient.id}:${Math.random().toString(36).slice(2, 10)}`,
        },
      });
    });

    await this.audit.record(
      {
        tenantId: principal.tenantId,
        branchId: ingredient.branchId,
        actorId: principal.userId,
        action: 'inventory.adjusted',
        resourceType: 'Ingredient',
        resourceId: ingredient.id,
        before: { currentStock: qtyString(ingredient.currentStock) },
        after: { currentStock: qtyString(target) },
        reason: dto.reason,
        requestId: actor.requestId,
      },
      this.prisma,
    );
    return movement;
  }

  async waste(principal: StaffPrincipal, dto: WasteStockDto, actor: ActorMeta) {
    await this.requireFeature(principal.tenantId);
    const ingredient = await this.findIngredient(principal, dto.ingredientId);
    const quantity = D(dto.quantity);
    if (quantity.greaterThan(ingredient.currentStock)) {
      throw new ConflictException({
        message: 'Waste quantity exceeds stock on hand',
        code: 'INSUFFICIENT_STOCK',
        details: { available: qtyString(ingredient.currentStock) },
      });
    }
    const movement = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.ingredient.update({
        where: { id: ingredient.id },
        data: { currentStock: { decrement: quantity } },
      });
      return tx.stockMovement.create({
        data: {
          tenantId: principal.tenantId,
          branchId: ingredient.branchId,
          ingredientId: ingredient.id,
          type: 'WASTE',
          quantity: quantity.negated(),
          unit: ingredient.unit,
          balanceAfter: updated.currentStock,
          referenceType: 'MANUAL',
          actorId: principal.userId,
          reason: dto.reason,
          idempotencyKey: `waste:${Date.now()}:${ingredient.id}:${Math.random().toString(36).slice(2, 10)}`,
        },
      });
    });
    await this.audit.record(
      {
        tenantId: principal.tenantId,
        branchId: ingredient.branchId,
        actorId: principal.userId,
        action: 'inventory.wasted',
        resourceType: 'Ingredient',
        resourceId: ingredient.id,
        after: { quantity: qtyString(quantity) },
        reason: dto.reason,
        requestId: actor.requestId,
      },
      this.prisma,
    );
    return movement;
  }

  async listMovements(principal: StaffPrincipal, query: MovementsQueryDto) {
    await this.requireFeature(principal.tenantId);
    const branch = await this.branches.resolve(principal, query.branchId);
    const rows = await this.prisma.stockMovement.findMany({
      where: {
        tenantId: principal.tenantId,
        branchId: branch.id,
        ...(query.ingredientId ? { ingredientId: query.ingredientId } : {}),
        ...(query.type ? { type: query.type as never } : {}),
      },
      include: {
        ingredient: { select: { name: true, unit: true } },
        actor: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(query.limit ?? 100, 300),
    });
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      quantity: qtyString(row.quantity),
      unit: row.unit,
      balanceAfter: qtyString(row.balanceAfter),
      ingredient: row.ingredient,
      actor: row.actor?.name ?? 'System',
      reason: row.reason,
      referenceType: row.referenceType,
      referenceId: row.referenceId,
      createdAt: row.createdAt,
    }));
  }

  async lowStock(principal: StaffPrincipal, branchId?: string) {
    await this.requireFeature(principal.tenantId);
    const branch = await this.branches.resolve(principal, branchId);
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; name: string; unit: string; currentStock: string; minStock: string }>
    >`
      SELECT "id", "name", "unit", "currentStock"::text, "minStock"::text
      FROM "Ingredient"
      WHERE "branchId" = ${branch.id}::uuid AND "isActive" = true AND "currentStock" <= "minStock"
      ORDER BY ("currentStock" - "minStock") ASC
      LIMIT 200
    `;
    return rows;
  }

  async countStock(principal: StaffPrincipal, dto: StockCountDto, actor: ActorMeta) {
    await this.requireFeature(principal.tenantId);
    const branch = await this.branches.load(principal, dto.branchId);
    const ids = dto.items.map((item) => item.ingredientId);
    const ingredients = await this.prisma.ingredient.findMany({
      where: { id: { in: ids }, branchId: branch.id, tenantId: principal.tenantId },
    });
    if (ingredients.length !== ids.length) {
      throw new BadRequestException({ message: 'Unknown ingredient in count', code: 'INGREDIENT_NOT_FOUND' });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const count = await tx.stockCount.create({
        data: {
          tenantId: principal.tenantId,
          branchId: branch.id,
          status: 'COMPLETED',
          note: dto.note,
          createdById: principal.userId,
          completedAt: new Date(),
        },
      });
      for (const item of dto.items) {
        const ingredient = ingredients.find((row) => row.id === item.ingredientId)!;
        const counted = D(item.countedQty);
        const delta = counted.minus(ingredient.currentStock);
        await tx.stockCountItem.create({
          data: {
            stockCountId: count.id,
            ingredientId: ingredient.id,
            countedQty: counted,
            systemQty: ingredient.currentStock,
          },
        });
        await tx.ingredient.update({
          where: { id: ingredient.id },
          data: { currentStock: counted },
        });
        if (!delta.isZero()) {
          await tx.stockMovement.create({
            data: {
              tenantId: principal.tenantId,
              branchId: branch.id,
              ingredientId: ingredient.id,
              type: 'COUNT',
              quantity: delta,
              unit: ingredient.unit,
              balanceAfter: counted,
              referenceType: 'STOCK_COUNT',
              referenceId: count.id,
              actorId: principal.userId,
              reason: dto.note ?? 'Stock count adjustment',
              idempotencyKey: `count:${count.id}:${ingredient.id}`,
            },
          });
        }
      }
      return count;
    });

    await this.audit.record(
      {
        tenantId: principal.tenantId,
        branchId: branch.id,
        actorId: principal.userId,
        action: 'inventory.counted',
        resourceType: 'StockCount',
        resourceId: result.id,
        after: { lineCount: dto.items.length },
        requestId: actor.requestId,
      },
      this.prisma,
    );
    return result;
  }

  // ----------------------------------------------------------------- recipes

  async listRecipes(principal: StaffPrincipal) {
    await this.requireFeature(principal.tenantId);
    const recipes = await this.prisma.recipe.findMany({
      where: { menuItem: { tenantId: principal.tenantId } },
      include: {
        menuItem: { select: { id: true, name: true, basePrice: true, costEstimate: true } },
        currentVersion: {
          include: { items: { include: { ingredient: true } } },
        },
        versions: { select: { id: true, version: true, createdAt: true }, orderBy: { version: 'desc' } },
      },
    });

    return recipes.map((recipe) => {
      const items = recipe.currentVersion?.items ?? [];
      const cost = items.reduce((acc, item) => {
        const converted = convertQuantity(item.quantity, item.unit, item.ingredient.unit);
        if (!converted) return acc;
        return acc.plus(converted.times(item.ingredient.costPerUnit));
      }, D(0));
      return {
        id: recipe.id,
        menuItem: {
          id: recipe.menuItem.id,
          name: recipe.menuItem.name,
          basePrice: recipe.menuItem.basePrice.toFixed(2),
        },
        version: recipe.currentVersion?.version ?? 0,
        cost: cost.toDecimalPlaces(2).toFixed(2),
        margin:
          recipe.menuItem.basePrice.isZero() || items.length === 0
            ? null
            : recipe.menuItem.basePrice
                .minus(cost)
                .dividedBy(recipe.menuItem.basePrice)
                .times(100)
                .toDecimalPlaces(1)
                .toFixed(1),
        items: items.map((item) => ({
          ingredientId: item.ingredientId,
          name: item.ingredient.name,
          quantity: qtyString(item.quantity),
          unit: item.unit,
          costPerUnit: item.ingredient.costPerUnit.toFixed(4),
        })),
        versionCount: recipe.versions.length,
      };
    });
  }

  async upsertRecipe(principal: StaffPrincipal, dto: UpsertRecipeDto, actor: ActorMeta) {
    await this.requireFeature(principal.tenantId);
    const menuItem = await this.prisma.menuItem.findFirst({
      where: { id: dto.menuItemId, tenantId: principal.tenantId },
    });
    if (!menuItem) throw new NotFoundException({ message: 'Menu item not found', code: 'NOT_FOUND' });

    const ingredients = await this.prisma.ingredient.findMany({
      where: {
        id: { in: dto.items.map((item) => item.ingredientId) },
        tenantId: principal.tenantId,
      },
      include: { branch: { select: { id: true } } },
    });
    if (ingredients.length !== dto.items.length) {
      throw new BadRequestException({ message: 'Unknown ingredient', code: 'INGREDIENT_NOT_FOUND' });
    }
    // Ingredients are branch-scoped. A recipe that mixes branches would make
    // deduction ambiguous, so it is rejected explicitly.
    const branchIds = new Set(ingredients.map((ingredient) => ingredient.branchId));
    if (branchIds.size > 1) {
      throw new BadRequestException({
        message: 'All ingredients in a recipe must belong to one branch',
        code: 'RECIPE_BRANCH_MISMATCH',
      });
    }
    for (const item of dto.items) {
      const ingredient = ingredients.find((row) => row.id === item.ingredientId)!;
      if (!convertQuantity(item.quantity, item.unit, ingredient.unit)) {
        throw new BadRequestException({
          message: `Cannot convert ${item.unit} to ${ingredient.unit} for ${ingredient.name}`,
          code: 'UNIT_MISMATCH',
        });
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      let recipe = await tx.recipe.findUnique({ where: { menuItemId: dto.menuItemId } });
      if (!recipe) {
        recipe = await tx.recipe.create({ data: { menuItemId: dto.menuItemId } });
      }
      const last = await tx.recipeVersion.findFirst({
        where: { recipeId: recipe.id },
        orderBy: { version: 'desc' },
      });
      const version = await tx.recipeVersion.create({
        data: {
          recipeId: recipe.id,
          version: (last?.version ?? 0) + 1,
          notes: dto.notes,
          createdById: principal.userId,
        },
      });
      await tx.recipeItem.createMany({
        data: dto.items.map((item) => ({
          versionId: version.id,
          ingredientId: item.ingredientId,
          quantity: D(item.quantity),
          unit: item.unit,
        })),
      });
      await tx.recipe.update({
        where: { id: recipe.id },
        data: { currentVersionId: version.id },
      });

      const cost = dto.items.reduce((acc, item) => {
        const ingredient = ingredients.find((row) => row.id === item.ingredientId)!;
        const converted = convertQuantity(item.quantity, item.unit, ingredient.unit)!;
        return acc.plus(converted.times(ingredient.costPerUnit));
      }, D(0));
      await tx.menuItem.update({
        where: { id: dto.menuItemId },
        data: { costEstimate: cost.toDecimalPlaces(2) },
      });
      return version;
    });

    await this.audit.record(
      {
        tenantId: principal.tenantId,
        actorId: principal.userId,
        action: 'inventory.recipe.published',
        resourceType: 'RecipeVersion',
        resourceId: result.id,
        after: { menuItemId: dto.menuItemId, version: result.version, itemCount: dto.items.length },
        requestId: actor.requestId,
      },
      this.prisma,
    );
    return result;
  }

  // --------------------------------------------------------- order coupling

  /**
   * Deducts stock for an accepted order exactly once. Movements are written per
   * order item so a rejected kitchen ticket can reverse only its own share.
   * Runs inside the caller's transaction: any shortage rolls the whole
   * acceptance back.
   */
  async deductForOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
    actorId: string | null,
  ): Promise<{ deducted: boolean }> {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          where: { status: { not: 'CANCELLED' } },
          include: {
            menuItem: {
              include: {
                recipes: {
                  include: {
                    currentVersion: { include: { items: { include: { ingredient: true } } } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!order) throw new NotFoundException({ message: 'Order not found', code: 'NOT_FOUND' });

    interface Requirement {
      orderItemId: string;
      ingredientId: string;
      branchId: string;
      name: string;
      unit: string;
      quantity: Prisma.Decimal;
      minStock: Prisma.Decimal;
    }

    const requirements: Requirement[] = [];
    for (const item of order.items) {
      const existing = await tx.stockMovement.count({
        where: {
          referenceType: 'ORDER',
          referenceId: orderId,
          type: 'SALE_DEDUCTION',
          idempotencyKey: { startsWith: `order:${orderId}:item:${item.id}:` },
        },
      });
      if (existing > 0) continue;

      const recipe = item.menuItem.recipes[0];
      for (const recipeItem of recipe?.currentVersion?.items ?? []) {
        // Recipes are tenant-wide; stock is held per branch. An order only
        // consumes ingredients from its own branch, so branches that keep
        // separate stock never draw from each other.
        if (recipeItem.ingredient.branchId !== order.branchId) continue;
        const perUnit = convertQuantity(recipeItem.quantity, recipeItem.unit, recipeItem.ingredient.unit);
        if (!perUnit) {
          throw new ConflictException({
            message: `Recipe unit mismatch for ${recipeItem.ingredient.name}`,
            code: 'UNIT_MISMATCH',
          });
        }
        requirements.push({
          orderItemId: item.id,
          ingredientId: recipeItem.ingredientId,
          branchId: recipeItem.ingredient.branchId,
          name: recipeItem.ingredient.name,
          unit: recipeItem.ingredient.unit,
          quantity: roundQty(perUnit.times(item.quantity)),
          minStock: recipeItem.ingredient.minStock,
        });
      }
    }

    if (requirements.length === 0) return { deducted: false };

    // Deterministic order avoids deadlocks between concurrent deductions.
    requirements.sort((a, b) =>
      a.ingredientId === b.ingredientId
        ? a.orderItemId.localeCompare(b.orderItemId)
        : a.ingredientId.localeCompare(b.ingredientId),
    );

    const shortages: Array<{ ingredient: string; required: string; available: string }> = [];
    const lowStock: Array<{ name: string; remaining: string; unit: string }> = [];

    for (const requirement of requirements) {
      if (requirement.quantity.isZero()) continue;
      const rows = await tx.$queryRaw<Array<{ currentStock: Prisma.Decimal; minStock: Prisma.Decimal }>>`
        UPDATE "Ingredient"
        SET "currentStock" = "currentStock" - ${requirement.quantity.toString()}::numeric,
            "updatedAt" = NOW()
        WHERE "id" = ${requirement.ingredientId}::uuid
          AND "currentStock" >= ${requirement.quantity.toString()}::numeric
        RETURNING "currentStock", "minStock"
      `;
      const row = rows[0];
      if (!row) {
        const available = await tx.ingredient.findUnique({
          where: { id: requirement.ingredientId },
          select: { currentStock: true },
        });
        shortages.push({
          ingredient: requirement.name,
          required: qtyString(requirement.quantity),
          available: qtyString(available?.currentStock ?? 0),
        });
        continue;
      }

      await tx.stockMovement.create({
        data: {
          tenantId: order.tenantId,
          branchId: requirement.branchId,
          ingredientId: requirement.ingredientId,
          type: 'SALE_DEDUCTION',
          quantity: requirement.quantity.negated(),
          unit: requirement.unit,
          balanceAfter: row.currentStock,
          referenceType: 'ORDER',
          referenceId: orderId,
          actorId,
          reason: `Order ${order.number}`,
          idempotencyKey: `order:${orderId}:item:${requirement.orderItemId}:ingredient:${requirement.ingredientId}:deduct`,
        },
      });

      if (row.currentStock.lessThanOrEqualTo(row.minStock)) {
        lowStock.push({
          name: requirement.name,
          remaining: qtyString(row.currentStock),
          unit: requirement.unit,
        });
      }
    }

    if (shortages.length > 0) {
      throw new ConflictException({
        message: 'Insufficient stock to accept this order',
        code: 'INSUFFICIENT_STOCK',
        details: { shortages },
      });
    }

    for (const item of lowStock) {
      await this.outbox.append(tx, {
        tenantId: order.tenantId,
        branchId: order.branchId,
        eventType: 'inventory.low_stock',
        aggregateType: 'Ingredient',
        aggregateId: orderId,
        payload: item,
      });
    }

    return { deducted: true };
  }

  /**
   * Reverses prior deductions once. Pass `orderItemIds` to reverse only the
   * items of a rejected kitchen ticket.
   */
  async reverseForOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
    actorId: string | null,
    reason: string,
    orderItemIds?: string[],
  ): Promise<number> {
    const allDeductions = await tx.stockMovement.findMany({
      where: { referenceType: 'ORDER', referenceId: orderId, type: 'SALE_DEDUCTION' },
    });
    const filtered =
      orderItemIds && orderItemIds.length > 0
        ? allDeductions.filter((movement) =>
            orderItemIds.some((itemId) =>
              movement.idempotencyKey?.startsWith(`order:${orderId}:item:${itemId}:`),
            ),
          )
        : allDeductions;

    let reversed = 0;
    for (const deduction of filtered) {
      const key =
        deduction.idempotencyKey?.replace(/:deduct$/, ':reversal') ??
        `order:${orderId}:reversal:${deduction.id}`;
      const existing = await tx.stockMovement.findUnique({ where: { idempotencyKey: key } });
      if (existing) continue;
      const quantity = deduction.quantity.negated();
      const updated = await tx.ingredient.update({
        where: { id: deduction.ingredientId },
        data: { currentStock: { increment: quantity } },
      });
      await tx.stockMovement.create({
        data: {
          tenantId: deduction.tenantId,
          branchId: deduction.branchId,
          ingredientId: deduction.ingredientId,
          type: 'SALE_REVERSAL',
          quantity,
          unit: deduction.unit,
          balanceAfter: updated.currentStock,
          referenceType: 'ORDER',
          referenceId: orderId,
          actorId,
          reason,
          idempotencyKey: key,
        },
      });
      reversed += 1;
    }
    return reversed;
  }

  // --------------------------------------------------------------- helpers

  private async findIngredient(principal: StaffPrincipal, id: string) {
    const ingredient = await this.prisma.ingredient.findFirst({
      where: { id, tenantId: principal.tenantId },
    });
    if (!ingredient) throw new NotFoundException({ message: 'Ingredient not found', code: 'NOT_FOUND' });
    await this.branches.load(principal, ingredient.branchId);
    return ingredient;
  }

  private convertOrThrow(quantity: Prisma.Decimal.Value, from: string, to: string): Prisma.Decimal {
    const converted = convertQuantity(quantity, from, to);
    if (!converted) {
      throw new BadRequestException({
        message: `Cannot convert ${from} to ${to}`,
        code: 'UNIT_MISMATCH',
      });
    }
    return converted;
  }
}
