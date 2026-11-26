import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Promotion } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.module';
import { BranchAccessService } from '../tenancy/branch-access.service';
import { D, moneyString } from '../../common/money';
import type { ActorMeta } from '../../common/actor';
import type { StaffPrincipal } from '../auth/principal';
import type { CreatePromotionDto, UpdatePromotionDto } from './promotions.dto';

type PromotionRow = Promotion & { branch: { id: string; name: string } | null };

function serialize(promotion: PromotionRow) {
  return {
    id: promotion.id,
    name: promotion.name,
    code: promotion.code,
    type: promotion.type,
    value: moneyString(promotion.value),
    minOrderAmount: moneyString(promotion.minOrderAmount),
    maxDiscount: promotion.maxDiscount ? moneyString(promotion.maxDiscount) : null,
    maxRedemptions: promotion.maxRedemptions,
    redemptionCount: promotion.redemptionCount,
    startsAt: promotion.startsAt,
    endsAt: promotion.endsAt,
    isActive: promotion.isActive,
    branch: promotion.branch,
    createdAt: promotion.createdAt,
  };
}

@Injectable()
export class PromotionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branches: BranchAccessService,
    private readonly audit: AuditService,
  ) {}

  async list(principal: StaffPrincipal, branchId?: string) {
    if (branchId) await this.branches.load(principal, branchId);
    const rows = await this.prisma.promotion.findMany({
      where: {
        tenantId: principal.tenantId,
        ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : {}),
      },
      include: { branch: { select: { id: true, name: true } } },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return rows.map(serialize);
  }

  async create(principal: StaffPrincipal, dto: CreatePromotionDto, actor: ActorMeta) {
    const data = this.normalize(dto);
    if (!data.name || !data.type || data.value === undefined) {
      throw new BadRequestException({
        message: 'Name, type and value are required',
        code: 'PROMOTION_INVALID',
      });
    }
    if (dto.branchId) await this.branches.load(principal, dto.branchId);
    this.assertDates(data.startsAt, data.endsAt);

    try {
      const created = await this.prisma.promotion.create({
        data: {
          tenantId: principal.tenantId,
          branchId: dto.branchId ?? null,
          name: data.name,
          code: data.code ?? null,
          type: data.type,
          value: D(data.value),
          minOrderAmount: D(data.minOrderAmount ?? 0),
          maxDiscount: data.maxDiscount === undefined ? null : D(data.maxDiscount),
          maxRedemptions: data.maxRedemptions ?? null,
          startsAt: data.startsAt ?? null,
          endsAt: data.endsAt ?? null,
          isActive: data.isActive ?? true,
        },
        include: { branch: { select: { id: true, name: true } } },
      });
      await this.record(principal, actor, 'promotion.created', created.id, {
        name: created.name,
        code: created.code,
        type: created.type,
        value: moneyString(created.value),
      });
      return serialize(created);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          message: 'This promotion code is already used',
          code: 'PROMOTION_CODE_TAKEN',
        });
      }
      throw error;
    }
  }

  async update(principal: StaffPrincipal, promotionId: string, dto: UpdatePromotionDto, actor: ActorMeta) {
    const existing = await this.prisma.promotion.findUnique({ where: { id: promotionId } });
    if (!existing || existing.tenantId !== principal.tenantId) {
      throw new NotFoundException({ message: 'Promotion not found', code: 'NOT_FOUND' });
    }
    if (dto.branchId) await this.branches.load(principal, dto.branchId);
    const data = this.normalize(dto);
    this.assertDates(
      data.startsAt ?? existing.startsAt ?? undefined,
      data.endsAt ?? existing.endsAt ?? undefined,
    );

    try {
      const updated = await this.prisma.promotion.update({
        where: { id: promotionId },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.code !== undefined ? { code: data.code } : {}),
          ...(data.type !== undefined ? { type: data.type } : {}),
          ...(data.value !== undefined ? { value: D(data.value) } : {}),
          ...(data.minOrderAmount !== undefined ? { minOrderAmount: D(data.minOrderAmount) } : {}),
          ...(data.maxDiscount !== undefined
            ? { maxDiscount: data.maxDiscount === null ? null : D(data.maxDiscount) }
            : {}),
          ...(data.maxRedemptions !== undefined ? { maxRedemptions: data.maxRedemptions } : {}),
          ...(data.startsAt !== undefined ? { startsAt: data.startsAt } : {}),
          ...(data.endsAt !== undefined ? { endsAt: data.endsAt } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          ...(dto.branchId !== undefined ? { branchId: dto.branchId } : {}),
        },
        include: { branch: { select: { id: true, name: true } } },
      });
      await this.record(principal, actor, 'promotion.updated', updated.id, {
        name: updated.name,
        code: updated.code,
        isActive: updated.isActive,
      });
      return serialize(updated);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          message: 'This promotion code is already used',
          code: 'PROMOTION_CODE_TAKEN',
        });
      }
      throw error;
    }
  }

  private normalize(dto: CreatePromotionDto | UpdatePromotionDto) {
    if (dto.type === 'PERCENTAGE' && dto.value !== undefined && dto.value > 100) {
      throw new BadRequestException({
        message: 'A percentage promotion cannot exceed 100%',
        code: 'PROMOTION_PERCENT_TOO_HIGH',
      });
    }
    return {
      ...dto,
      code: dto.code ? dto.code.toUpperCase() : dto.code,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
    };
  }

  private assertDates(startsAt?: Date, endsAt?: Date) {
    if (startsAt && endsAt && endsAt <= startsAt) {
      throw new BadRequestException({
        message: 'The end date must be after the start date',
        code: 'PROMOTION_DATE_ORDER',
      });
    }
  }

  private async record(
    principal: StaffPrincipal,
    actor: ActorMeta,
    action: string,
    promotionId: string,
    after: Record<string, unknown>,
  ) {
    await this.audit.record(
      {
        tenantId: principal.tenantId,
        actorId: principal.userId,
        action,
        resourceType: 'Promotion',
        resourceId: promotionId,
        after,
        requestId: actor.requestId,
      },
      this.prisma,
    );
  }
}
