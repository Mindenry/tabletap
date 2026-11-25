import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.module';
import { BranchAccessService } from '../tenancy/branch-access.service';
import { ActorMeta } from '../../common/actor';
import type { StaffPrincipal } from '../auth/principal';
import { D, moneyString } from '../../common/money';
import type {
  AvailabilityDto,
  CategoryDto,
  CreateMenuItemDto,
  MenuQueryDto,
  ModifierGroupDto,
  UpdateMenuItemDto,
} from './catalog.dto';

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base.length > 0 ? base : `item-${randomBytes(3).toString('hex')}`;
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly branches: BranchAccessService,
  ) {}

  // -------------------------------------------------------------- categories

  async listCategories(principal: StaffPrincipal) {
    const categories = await this.prisma.menuCategory.findMany({
      where: { tenantId: principal.tenantId },
      include: { _count: { select: { items: { where: { status: { not: 'ARCHIVED' } } } } } },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
    return categories.map((category) => ({
      id: category.id,
      name: category.name,
      nameEn: category.nameEn,
      slug: category.slug,
      description: category.description,
      imageUrl: category.imageUrl,
      displayOrder: category.displayOrder,
      isActive: category.isActive,
      itemCount: category._count.items,
    }));
  }

  async createCategory(principal: StaffPrincipal, dto: CategoryDto, actor: ActorMeta) {
    const slug = await this.uniqueCategorySlug(principal.tenantId, dto.slug ?? dto.nameEn ?? dto.name);
    const category = await this.prisma.menuCategory.create({
      data: {
        tenantId: principal.tenantId,
        name: dto.name,
        nameEn: dto.nameEn,
        slug,
        description: dto.description,
        imageUrl: dto.imageUrl,
        displayOrder: dto.displayOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
    await this.audit.record(
      {
        tenantId: principal.tenantId,
        actorId: principal.userId,
        action: 'menu.category.created',
        resourceType: 'MenuCategory',
        resourceId: category.id,
        after: { name: category.name },
        requestId: actor.requestId,
      },
      this.prisma,
    );
    return category;
  }

  async updateCategory(principal: StaffPrincipal, id: string, dto: CategoryDto, actor: ActorMeta) {
    const existing = await this.prisma.menuCategory.findFirst({
      where: { id, tenantId: principal.tenantId },
    });
    if (!existing) throw new NotFoundException({ message: 'Category not found', code: 'NOT_FOUND' });

    const category = await this.prisma.menuCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl || null } : {}),
        ...(dto.displayOrder !== undefined ? { displayOrder: dto.displayOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.audit.record(
      {
        tenantId: principal.tenantId,
        actorId: principal.userId,
        action: 'menu.category.updated',
        resourceType: 'MenuCategory',
        resourceId: id,
        before: { name: existing.name, isActive: existing.isActive },
        after: { name: category.name, isActive: category.isActive },
        requestId: actor.requestId,
      },
      this.prisma,
    );
    return category;
  }

  async archiveCategory(principal: StaffPrincipal, id: string, actor: ActorMeta) {
    const category = await this.prisma.menuCategory.findFirst({
      where: { id, tenantId: principal.tenantId },
      include: { _count: { select: { items: { where: { status: { not: 'ARCHIVED' } } } } } },
    });
    if (!category) throw new NotFoundException({ message: 'Category not found', code: 'NOT_FOUND' });
    if (category._count.items > 0) {
      throw new BadRequestException({
        message: 'Move or archive the items in this category first',
        code: 'CATEGORY_NOT_EMPTY',
      });
    }
    await this.prisma.menuCategory.update({ where: { id }, data: { isActive: false } });
    await this.audit.record(
      {
        tenantId: principal.tenantId,
        actorId: principal.userId,
        action: 'menu.category.archived',
        resourceType: 'MenuCategory',
        resourceId: id,
        requestId: actor.requestId,
      },
      this.prisma,
    );
  }

  private async uniqueCategorySlug(tenantId: string, source: string): Promise<string> {
    const base = slugify(source);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const slug = attempt === 0 ? base : `${base}-${randomBytes(2).toString('hex')}`;
      const clash = await this.prisma.menuCategory.findUnique({
        where: { tenantId_slug: { tenantId, slug } },
      });
      if (!clash) return slug;
    }
    throw new ConflictException({ message: 'Could not allocate a unique slug', code: 'SLUG_CONFLICT' });
  }

  private async uniqueItemSlug(tenantId: string, source: string, ignoreId?: string): Promise<string> {
    const base = slugify(source);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const slug = attempt === 0 ? base : `${base}-${randomBytes(2).toString('hex')}`;
      const clash = await this.prisma.menuItem.findUnique({
        where: { tenantId_slug: { tenantId, slug } },
      });
      if (!clash || clash.id === ignoreId) return slug;
    }
    throw new ConflictException({ message: 'Could not allocate a unique slug', code: 'SLUG_CONFLICT' });
  }

  // ------------------------------------------------------------- menu items

  async listItems(principal: StaffPrincipal, query: MenuQueryDto) {
    const branchId = query.branchId ?? (await this.branches.resolve(principal)).id;
    await this.branches.load(principal, branchId);

    const items = await this.prisma.menuItem.findMany({
      where: {
        tenantId: principal.tenantId,
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.status ? { status: query.status } : { status: { not: 'ARCHIVED' } }),
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { nameEn: { contains: query.search, mode: 'insensitive' } },
                { sku: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        category: { select: { id: true, name: true, nameEn: true } },
        variants: { orderBy: { displayOrder: 'asc' } },
        availability: { where: { branchId } },
        modifierGroups: { include: { group: { include: { options: true } } } },
        allergens: { include: { allergen: true } },
        stations: true,
      },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      take: 500,
    });

    const soldOutUntil = new Map(
      items.map((item) => {
        const availability = item.availability[0];
        const effective =
          item.status === 'ACTIVE' &&
          (availability?.isAvailable ?? true) &&
          (!availability?.soldOutUntil || availability.soldOutUntil.getTime() < Date.now());
        return [item.id, effective];
      }),
    );

    return items.map((item) => ({
      id: item.id,
      name: item.name,
      nameEn: item.nameEn,
      slug: item.slug,
      description: item.description,
      descriptionEn: item.descriptionEn,
      imageUrl: item.imageUrl,
      sku: item.sku,
      basePrice: moneyString(item.basePrice),
      costEstimate: moneyString(item.costEstimate),
      prepMinutes: item.prepMinutes,
      status: item.status,
      isFeatured: item.isFeatured,
      isPopular: item.isPopular,
      displayOrder: item.displayOrder,
      category: item.category,
      availableInBranch: soldOutUntil.get(item.id) ?? false,
      variants: item.variants.map((variant) => ({
        id: variant.id,
        name: variant.name,
        nameEn: variant.nameEn,
        priceDelta: moneyString(variant.priceDelta),
        isDefault: variant.isDefault,
        isAvailable: variant.isAvailable,
      })),
      modifierGroups: item.modifierGroups.map((link) => ({
        id: link.group.id,
        name: link.group.name,
        nameEn: link.group.nameEn,
        required: link.group.required,
        minSelect: link.group.minSelect,
        maxSelect: link.group.maxSelect,
        options: link.group.options.map((option) => ({
          id: option.id,
          name: option.name,
          nameEn: option.nameEn,
          priceDelta: moneyString(option.priceDelta),
          isAvailable: option.isAvailable,
        })),
      })),
      allergens: item.allergens.map((link) => ({ code: link.allergen.code, name: link.allergen.name })),
      stationIds: item.stations.map((s) => s.stationId),
    }));
  }

  async getItem(principal: StaffPrincipal, id: string) {
    const branch = await this.branches.resolve(principal);
    const items = await this.listItems(principal, { branchId: branch.id });
    const found = items.find((item) => item.id === id);
    if (!found) throw new NotFoundException({ message: 'Menu item not found', code: 'NOT_FOUND' });
    return found;
  }

  async createItem(principal: StaffPrincipal, dto: CreateMenuItemDto, actor: ActorMeta) {
    const category = await this.prisma.menuCategory.findFirst({
      where: { id: dto.categoryId, tenantId: principal.tenantId },
    });
    if (!category) throw new NotFoundException({ message: 'Category not found', code: 'NOT_FOUND' });

    if (dto.stationId) {
      await this.assertStationInTenant(principal, dto.stationId);
    }
    if (dto.modifierGroupIds?.length) {
      await this.assertGroupsInTenant(principal, dto.modifierGroupIds);
    }

    const slug = await this.uniqueItemSlug(principal.tenantId, dto.slug ?? dto.nameEn ?? dto.name);

    const item = await this.prisma.$transaction(async (tx) => {
      const created = await tx.menuItem.create({
        data: {
          tenantId: principal.tenantId,
          categoryId: dto.categoryId,
          name: dto.name,
          nameEn: dto.nameEn,
          slug,
          description: dto.description,
          descriptionEn: dto.descriptionEn,
          imageUrl: dto.imageUrl,
          sku: dto.sku,
          basePrice: D(dto.basePrice),
          costEstimate: D(dto.costEstimate ?? 0),
          prepMinutes: dto.prepMinutes ?? 10,
          status: dto.status ?? 'ACTIVE',
          isFeatured: dto.isFeatured ?? false,
          isPopular: dto.isPopular ?? false,
          displayOrder: dto.displayOrder ?? 0,
        },
      });

      if (dto.variants?.length) {
        await tx.menuItemVariant.createMany({
          data: dto.variants.map((variant, index) => ({
            menuItemId: created.id,
            name: variant.name,
            nameEn: variant.nameEn,
            sku: variant.sku,
            priceDelta: D(variant.priceDelta ?? 0),
            isDefault: variant.isDefault ?? index === 0,
            isAvailable: variant.isAvailable ?? true,
            displayOrder: variant.displayOrder ?? index,
          })),
        });
      }

      if (dto.modifierGroupIds?.length) {
        await tx.menuItemModifierGroup.createMany({
          data: dto.modifierGroupIds.map((modifierGroupId, index) => ({
            menuItemId: created.id,
            modifierGroupId,
            displayOrder: index,
          })),
        });
      }

      if (dto.stationId) {
        await tx.menuItemStation.create({
          data: { menuItemId: created.id, stationId: dto.stationId },
        });
      }

      if (dto.allergenCodes?.length) {
        const allergens = await tx.allergen.findMany({
          where: { code: { in: dto.allergenCodes } },
        });
        if (allergens.length > 0) {
          await tx.menuItemAllergen.createMany({
            data: allergens.map((allergen) => ({ menuItemId: created.id, allergenId: allergen.id })),
          });
        }
      }

      if (dto.branchId) {
        await this.branches.load(principal, dto.branchId);
      }

      return created;
    });

    await this.audit.record(
      {
        tenantId: principal.tenantId,
        actorId: principal.userId,
        action: 'menu.item.created',
        resourceType: 'MenuItem',
        resourceId: item.id,
        after: { name: item.name, basePrice: moneyString(item.basePrice) },
        requestId: actor.requestId,
      },
      this.prisma,
    );
    return item;
  }

  async updateItem(principal: StaffPrincipal, id: string, dto: UpdateMenuItemDto, actor: ActorMeta) {
    const existing = await this.prisma.menuItem.findFirst({
      where: { id, tenantId: principal.tenantId },
      include: { variants: true },
    });
    if (!existing) throw new NotFoundException({ message: 'Menu item not found', code: 'NOT_FOUND' });

    if (dto.categoryId) {
      const category = await this.prisma.menuCategory.findFirst({
        where: { id: dto.categoryId, tenantId: principal.tenantId },
      });
      if (!category) throw new NotFoundException({ message: 'Category not found', code: 'NOT_FOUND' });
    }
    if (dto.modifierGroupIds) await this.assertGroupsInTenant(principal, dto.modifierGroupIds);
    if (dto.stationId) await this.assertStationInTenant(principal, dto.stationId);

    const priceChanged = dto.basePrice !== undefined && !D(dto.basePrice).equals(existing.basePrice);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.menuItem.update({
        where: { id },
        data: {
          ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.descriptionEn !== undefined ? { descriptionEn: dto.descriptionEn } : {}),
          ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl || null } : {}),
          ...(dto.basePrice !== undefined ? { basePrice: D(dto.basePrice) } : {}),
          ...(dto.costEstimate !== undefined ? { costEstimate: D(dto.costEstimate) } : {}),
          ...(dto.prepMinutes !== undefined ? { prepMinutes: dto.prepMinutes } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.isFeatured !== undefined ? { isFeatured: dto.isFeatured } : {}),
          ...(dto.isPopular !== undefined ? { isPopular: dto.isPopular } : {}),
          ...(dto.displayOrder !== undefined ? { displayOrder: dto.displayOrder } : {}),
        },
      });

      if (priceChanged) {
        await tx.menuPriceHistory.create({
          data: {
            menuItemId: id,
            oldPrice: existing.basePrice,
            newPrice: D(dto.basePrice as number),
            changedById: principal.userId,
            reason: dto.priceChangeReason ?? 'Menu update',
          },
        });
      }

      if (dto.modifierGroupIds) {
        await tx.menuItemModifierGroup.deleteMany({ where: { menuItemId: id } });
        if (dto.modifierGroupIds.length > 0) {
          await tx.menuItemModifierGroup.createMany({
            data: dto.modifierGroupIds.map((modifierGroupId, index) => ({
              menuItemId: id,
              modifierGroupId,
              displayOrder: index,
            })),
          });
        }
      }

      if (dto.stationId) {
        await tx.menuItemStation.deleteMany({ where: { menuItemId: id } });
        await tx.menuItemStation.create({ data: { menuItemId: id, stationId: dto.stationId } });
      }

      return result;
    });

    await this.audit.record(
      {
        tenantId: principal.tenantId,
        actorId: principal.userId,
        action: priceChanged ? 'menu.price.changed' : 'menu.item.updated',
        resourceType: 'MenuItem',
        resourceId: id,
        before: {
          name: existing.name,
          status: existing.status,
          basePrice: moneyString(existing.basePrice),
        },
        after: {
          name: updated.name,
          status: updated.status,
          basePrice: moneyString(updated.basePrice),
        },
        reason: priceChanged ? dto.priceChangeReason : undefined,
        requestId: actor.requestId,
      },
      this.prisma,
    );
    return updated;
  }

  async setAvailability(principal: StaffPrincipal, id: string, dto: AvailabilityDto, actor: ActorMeta) {
    const item = await this.prisma.menuItem.findFirst({
      where: { id, tenantId: principal.tenantId },
    });
    if (!item) throw new NotFoundException({ message: 'Menu item not found', code: 'NOT_FOUND' });
    await this.branches.load(principal, dto.branchId);

    const availability = await this.prisma.menuItemAvailability.upsert({
      where: { menuItemId_branchId: { menuItemId: id, branchId: dto.branchId } },
      create: {
        menuItemId: id,
        branchId: dto.branchId,
        isAvailable: dto.isAvailable,
        soldOutUntil: null,
      },
      update: { isAvailable: dto.isAvailable, soldOutUntil: null },
    });

    await this.audit.record(
      {
        tenantId: principal.tenantId,
        branchId: dto.branchId,
        actorId: principal.userId,
        action: 'menu.availability.changed',
        resourceType: 'MenuItem',
        resourceId: id,
        after: { isAvailable: dto.isAvailable },
        requestId: actor.requestId,
      },
      this.prisma,
    );
    return availability;
  }

  // -------------------------------------------------------- modifier groups

  async listModifierGroups(principal: StaffPrincipal) {
    const groups = await this.prisma.modifierGroup.findMany({
      where: { tenantId: principal.tenantId },
      include: {
        options: { orderBy: { displayOrder: 'asc' } },
        _count: { select: { items: true } },
      },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
    return groups.map((group) => ({
      id: group.id,
      name: group.name,
      nameEn: group.nameEn,
      required: group.required,
      minSelect: group.minSelect,
      maxSelect: group.maxSelect,
      displayOrder: group.displayOrder,
      itemCount: group._count.items,
      options: group.options.map((option) => ({
        id: option.id,
        name: option.name,
        nameEn: option.nameEn,
        priceDelta: moneyString(option.priceDelta),
        isAvailable: option.isAvailable,
        displayOrder: option.displayOrder,
      })),
    }));
  }

  async createModifierGroup(principal: StaffPrincipal, dto: ModifierGroupDto, actor: ActorMeta) {
    if (dto.maxSelect < dto.minSelect) {
      throw new BadRequestException({
        message: 'maxSelect must be greater than or equal to minSelect',
        code: 'INVALID_SELECTION_RANGE',
      });
    }
    if (dto.required && dto.minSelect === 0) {
      throw new BadRequestException({
        message: 'A required group needs minSelect of at least 1',
        code: 'INVALID_SELECTION_RANGE',
      });
    }
    const group = await this.prisma.modifierGroup.create({
      data: {
        tenantId: principal.tenantId,
        name: dto.name,
        nameEn: dto.nameEn,
        required: dto.required,
        minSelect: dto.minSelect,
        maxSelect: dto.maxSelect,
        displayOrder: dto.displayOrder ?? 0,
        options: {
          create: dto.options.map((option, index) => ({
            name: option.name,
            nameEn: option.nameEn,
            priceDelta: D(option.priceDelta ?? 0),
            isAvailable: option.isAvailable ?? true,
            displayOrder: option.displayOrder ?? index,
          })),
        },
      },
      include: { options: true },
    });
    await this.audit.record(
      {
        tenantId: principal.tenantId,
        actorId: principal.userId,
        action: 'menu.modifier_group.created',
        resourceType: 'ModifierGroup',
        resourceId: group.id,
        after: { name: group.name },
        requestId: actor.requestId,
      },
      this.prisma,
    );
    return group;
  }

  async updateModifierGroup(principal: StaffPrincipal, id: string, dto: ModifierGroupDto, actor: ActorMeta) {
    const existing = await this.prisma.modifierGroup.findFirst({
      where: { id, tenantId: principal.tenantId },
      include: { options: true },
    });
    if (!existing) throw new NotFoundException({ message: 'Modifier group not found', code: 'NOT_FOUND' });
    if (dto.maxSelect < dto.minSelect || (dto.required && dto.minSelect === 0)) {
      throw new BadRequestException({
        message: 'Invalid selection range',
        code: 'INVALID_SELECTION_RANGE',
      });
    }

    const group = await this.prisma.$transaction(async (tx) => {
      await tx.modifierGroup.update({
        where: { id },
        data: {
          name: dto.name,
          nameEn: dto.nameEn,
          required: dto.required,
          minSelect: dto.minSelect,
          maxSelect: dto.maxSelect,
          displayOrder: dto.displayOrder ?? existing.displayOrder,
        },
      });

      const keepIds = new Set(dto.options.map((option) => option.id).filter(Boolean) as string[]);
      await tx.modifierOption.deleteMany({
        where: { modifierGroupId: id, id: { notIn: [...keepIds] } },
      });
      for (const [index, option] of dto.options.entries()) {
        if (option.id) {
          await tx.modifierOption.update({
            where: { id: option.id },
            data: {
              name: option.name,
              nameEn: option.nameEn,
              priceDelta: D(option.priceDelta ?? 0),
              isAvailable: option.isAvailable ?? true,
              displayOrder: option.displayOrder ?? index,
            },
          });
        } else {
          await tx.modifierOption.create({
            data: {
              modifierGroupId: id,
              name: option.name,
              nameEn: option.nameEn,
              priceDelta: D(option.priceDelta ?? 0),
              isAvailable: option.isAvailable ?? true,
              displayOrder: option.displayOrder ?? index,
            },
          });
        }
      }
      return tx.modifierGroup.findUniqueOrThrow({ where: { id }, include: { options: true } });
    });

    await this.audit.record(
      {
        tenantId: principal.tenantId,
        actorId: principal.userId,
        action: 'menu.modifier_group.updated',
        resourceType: 'ModifierGroup',
        resourceId: id,
        before: { name: existing.name },
        after: { name: group.name },
        requestId: actor.requestId,
      },
      this.prisma,
    );
    return group;
  }

  async deleteModifierGroup(principal: StaffPrincipal, id: string, actor: ActorMeta) {
    const group = await this.prisma.modifierGroup.findFirst({
      where: { id, tenantId: principal.tenantId },
      include: { _count: { select: { items: true } } },
    });
    if (!group) throw new NotFoundException({ message: 'Modifier group not found', code: 'NOT_FOUND' });
    if (group._count.items > 0) {
      throw new BadRequestException({
        message: 'Remove this group from its menu items first',
        code: 'MODIFIER_GROUP_IN_USE',
      });
    }
    await this.prisma.modifierGroup.delete({ where: { id } });
    await this.audit.record(
      {
        tenantId: principal.tenantId,
        actorId: principal.userId,
        action: 'menu.modifier_group.deleted',
        resourceType: 'ModifierGroup',
        resourceId: id,
        requestId: actor.requestId,
      },
      this.prisma,
    );
  }

  // -------------------------------------------------------------- public menu

  /**
   * Authoritative public menu for a branch. Only ACTIVE categories and items are
   * returned; per-branch availability and sold-out windows are resolved here and
   * again at order submission.
   */
  async publicMenu(tenantId: string, branchId: string) {
    const categories = await this.prisma.menuCategory.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      include: {
        items: {
          where: { status: { in: ['ACTIVE', 'SOLD_OUT'] } },
          orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
          include: {
            variants: { where: { isAvailable: true }, orderBy: { displayOrder: 'asc' } },
            availability: { where: { branchId } },
            modifierGroups: {
              orderBy: { displayOrder: 'asc' },
              include: {
                group: {
                  include: {
                    options: { where: { isAvailable: true }, orderBy: { displayOrder: 'asc' } },
                  },
                },
              },
            },
            allergens: { include: { allergen: true } },
          },
        },
      },
    });

    return categories
      .filter((category) => category.items.length > 0)
      .map((category) => ({
        id: category.id,
        name: category.name,
        nameEn: category.nameEn,
        slug: category.slug,
        description: category.description,
        imageUrl: category.imageUrl,
        items: category.items.map((item) => {
          const availability = item.availability[0];
          const soldOut =
            item.status === 'SOLD_OUT' ||
            (availability?.soldOutUntil ? availability.soldOutUntil.getTime() > Date.now() : false);
          const available = !soldOut && (availability?.isAvailable ?? true);
          return {
            id: item.id,
            name: item.name,
            nameEn: item.nameEn,
            slug: item.slug,
            description: item.description,
            descriptionEn: item.descriptionEn,
            imageUrl: item.imageUrl,
            basePrice: moneyString(item.basePrice),
            prepMinutes: item.prepMinutes,
            isFeatured: item.isFeatured,
            isPopular: item.isPopular,
            available,
            soldOut: !available,
            variants: item.variants.map((variant) => ({
              id: variant.id,
              name: variant.name,
              nameEn: variant.nameEn,
              priceDelta: moneyString(variant.priceDelta),
              isDefault: variant.isDefault,
            })),
            modifierGroups: item.modifierGroups.map((link) => ({
              id: link.group.id,
              name: link.group.name,
              nameEn: link.group.nameEn,
              required: link.group.required,
              minSelect: link.group.minSelect,
              maxSelect: link.group.maxSelect,
              options: link.group.options.map((option) => ({
                id: option.id,
                name: option.name,
                nameEn: option.nameEn,
                priceDelta: moneyString(option.priceDelta),
              })),
            })),
            allergens: item.allergens.map((link) => ({
              code: link.allergen.code,
              name: link.allergen.name,
              nameTh: link.allergen.nameTh,
            })),
          };
        }),
      }));
  }

  private async assertGroupsInTenant(principal: StaffPrincipal, ids: string[]): Promise<void> {
    const count = await this.prisma.modifierGroup.count({
      where: { id: { in: ids }, tenantId: principal.tenantId },
    });
    if (count !== ids.length) {
      throw new BadRequestException({ message: 'Unknown modifier group', code: 'MODIFIER_GROUP_NOT_FOUND' });
    }
  }

  private async assertStationInTenant(principal: StaffPrincipal, stationId: string): Promise<void> {
    const station = await this.prisma.kitchenStation.findUnique({ where: { id: stationId } });
    if (!station) throw new NotFoundException({ message: 'Kitchen station not found', code: 'NOT_FOUND' });
    await this.branches.load(principal, station.branchId);
  }
}
