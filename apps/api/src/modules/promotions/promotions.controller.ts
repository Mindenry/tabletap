import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import type { Request } from 'express';
import { CurrentStaff, RequirePermissions } from '../auth/decorators';
import type { StaffPrincipal } from '../auth/principal';
import { actorFrom } from '../../common/actor';
import { PromotionsService } from './promotions.service';
import { CreatePromotionDto, UpdatePromotionDto } from './promotions.dto';

class PromotionQueryDto {
  @IsOptional()
  @IsUUID('4')
  branchId?: string;
}

@ApiTags('promotions')
@ApiBearerAuth()
@Controller('promotions')
@RequirePermissions('promotion.manage')
export class PromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get()
  list(@CurrentStaff() principal: StaffPrincipal, @Query() query: PromotionQueryDto) {
    return this.promotions.list(principal, query.branchId);
  }

  @Post()
  create(@CurrentStaff() principal: StaffPrincipal, @Body() dto: CreatePromotionDto, @Req() req: Request) {
    return this.promotions.create(principal, dto, actorFrom(req));
  }

  @Patch(':id')
  update(
    @CurrentStaff() principal: StaffPrincipal,
    @Param('id') id: string,
    @Body() dto: UpdatePromotionDto,
    @Req() req: Request,
  ) {
    return this.promotions.update(principal, id, dto, actorFrom(req));
  }
}
