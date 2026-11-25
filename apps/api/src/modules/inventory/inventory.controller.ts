import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentStaff, RequirePermissions } from '../auth/decorators';
import type { StaffPrincipal } from '../auth/principal';
import { actorFrom } from '../../common/actor';
import { InventoryService } from './inventory.service';
import {
  AdjustStockDto,
  CreateIngredientDto,
  MovementsQueryDto,
  ReceiveStockDto,
  StockCountDto,
  UpdateIngredientDto,
  UpsertRecipeDto,
  WasteStockDto,
} from './inventory.dto';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('ingredients')
  @RequirePermissions('inventory.read')
  ingredients(
    @CurrentStaff() principal: StaffPrincipal,
    @Query('branchId') branchId?: string,
    @Query('search') search?: string,
  ) {
    return this.inventory.listIngredients(principal, branchId, search);
  }

  @Post('ingredients')
  @RequirePermissions('inventory.adjust')
  create(@CurrentStaff() principal: StaffPrincipal, @Body() dto: CreateIngredientDto, @Req() req: Request) {
    return this.inventory.createIngredient(principal, dto, actorFrom(req));
  }

  @Patch('ingredients/:id')
  @RequirePermissions('inventory.adjust')
  update(
    @CurrentStaff() principal: StaffPrincipal,
    @Param('id') id: string,
    @Body() dto: UpdateIngredientDto,
    @Req() req: Request,
  ) {
    return this.inventory.updateIngredient(principal, id, dto, actorFrom(req));
  }

  @Post('receive')
  @RequirePermissions('inventory.receive')
  receive(@CurrentStaff() principal: StaffPrincipal, @Body() dto: ReceiveStockDto, @Req() req: Request) {
    return this.inventory.receive(principal, dto, actorFrom(req));
  }

  @Post('adjust')
  @RequirePermissions('inventory.adjust')
  adjust(@CurrentStaff() principal: StaffPrincipal, @Body() dto: AdjustStockDto, @Req() req: Request) {
    return this.inventory.adjust(principal, dto, actorFrom(req));
  }

  @Post('waste')
  @RequirePermissions('inventory.adjust')
  waste(@CurrentStaff() principal: StaffPrincipal, @Body() dto: WasteStockDto, @Req() req: Request) {
    return this.inventory.waste(principal, dto, actorFrom(req));
  }

  @Post('count')
  @RequirePermissions('inventory.adjust')
  count(@CurrentStaff() principal: StaffPrincipal, @Body() dto: StockCountDto, @Req() req: Request) {
    return this.inventory.countStock(principal, dto, actorFrom(req));
  }

  @Get('movements')
  @RequirePermissions('inventory.read')
  movements(@CurrentStaff() principal: StaffPrincipal, @Query() query: MovementsQueryDto) {
    return this.inventory.listMovements(principal, query);
  }

  @Get('low-stock')
  @RequirePermissions('inventory.read')
  lowStock(@CurrentStaff() principal: StaffPrincipal, @Query('branchId') branchId?: string) {
    return this.inventory.lowStock(principal, branchId);
  }
}

@ApiTags('recipes')
@ApiBearerAuth()
@Controller('recipes')
export class RecipesController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @RequirePermissions('inventory.read')
  list(@CurrentStaff() principal: StaffPrincipal) {
    return this.inventory.listRecipes(principal);
  }

  @Post()
  @RequirePermissions('inventory.adjust')
  upsert(@CurrentStaff() principal: StaffPrincipal, @Body() dto: UpsertRecipeDto, @Req() req: Request) {
    return this.inventory.upsertRecipe(principal, dto, actorFrom(req));
  }
}
