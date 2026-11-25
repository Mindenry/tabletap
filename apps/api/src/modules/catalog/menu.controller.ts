import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentStaff, RequirePermissions } from '../auth/decorators';
import type { StaffPrincipal } from '../auth/principal';
import { actorFrom } from '../../common/actor';
import { CatalogService } from './catalog.service';
import {
  AvailabilityDto,
  CategoryDto,
  CreateMenuItemDto,
  MenuQueryDto,
  ModifierGroupDto,
  UpdateMenuItemDto,
} from './catalog.dto';

@ApiTags('menu')
@ApiBearerAuth()
@Controller('menu/categories')
export class CategoriesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @RequirePermissions('menu.read')
  list(@CurrentStaff() principal: StaffPrincipal) {
    return this.catalog.listCategories(principal);
  }

  @Post()
  @RequirePermissions('menu.create')
  create(@CurrentStaff() principal: StaffPrincipal, @Body() dto: CategoryDto, @Req() req: Request) {
    return this.catalog.createCategory(principal, dto, actorFrom(req));
  }

  @Patch(':id')
  @RequirePermissions('menu.update')
  update(
    @CurrentStaff() principal: StaffPrincipal,
    @Param('id') id: string,
    @Body() dto: CategoryDto,
    @Req() req: Request,
  ) {
    return this.catalog.updateCategory(principal, id, dto, actorFrom(req));
  }

  @Delete(':id')
  @RequirePermissions('menu.delete')
  @HttpCode(204)
  async archive(
    @CurrentStaff() principal: StaffPrincipal,
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.catalog.archiveCategory(principal, id, actorFrom(req));
  }
}

@ApiTags('menu')
@ApiBearerAuth()
@Controller('menu/items')
export class MenuItemsController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @RequirePermissions('menu.read')
  list(@CurrentStaff() principal: StaffPrincipal, @Query() query: MenuQueryDto) {
    return this.catalog.listItems(principal, query);
  }

  @Post()
  @RequirePermissions('menu.create')
  create(@CurrentStaff() principal: StaffPrincipal, @Body() dto: CreateMenuItemDto, @Req() req: Request) {
    return this.catalog.createItem(principal, dto, actorFrom(req));
  }

  @Get(':id')
  @RequirePermissions('menu.read')
  get(@CurrentStaff() principal: StaffPrincipal, @Param('id') id: string) {
    return this.catalog.getItem(principal, id);
  }

  @Patch(':id')
  @RequirePermissions('menu.update')
  update(
    @CurrentStaff() principal: StaffPrincipal,
    @Param('id') id: string,
    @Body() dto: UpdateMenuItemDto,
    @Req() req: Request,
  ) {
    return this.catalog.updateItem(principal, id, dto, actorFrom(req));
  }

  @Post(':id/availability')
  @RequirePermissions('menu.update')
  @HttpCode(200)
  setAvailability(
    @CurrentStaff() principal: StaffPrincipal,
    @Param('id') id: string,
    @Body() dto: AvailabilityDto,
    @Req() req: Request,
  ) {
    return this.catalog.setAvailability(principal, id, dto, actorFrom(req));
  }
}

@ApiTags('menu')
@ApiBearerAuth()
@Controller('menu/modifier-groups')
export class ModifierGroupsController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @RequirePermissions('menu.read')
  list(@CurrentStaff() principal: StaffPrincipal) {
    return this.catalog.listModifierGroups(principal);
  }

  @Post()
  @RequirePermissions('menu.create')
  create(@CurrentStaff() principal: StaffPrincipal, @Body() dto: ModifierGroupDto, @Req() req: Request) {
    return this.catalog.createModifierGroup(principal, dto, actorFrom(req));
  }

  @Patch(':id')
  @RequirePermissions('menu.update')
  update(
    @CurrentStaff() principal: StaffPrincipal,
    @Param('id') id: string,
    @Body() dto: ModifierGroupDto,
    @Req() req: Request,
  ) {
    return this.catalog.updateModifierGroup(principal, id, dto, actorFrom(req));
  }

  @Delete(':id')
  @RequirePermissions('menu.delete')
  @HttpCode(204)
  async remove(
    @CurrentStaff() principal: StaffPrincipal,
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.catalog.deleteModifierGroup(principal, id, actorFrom(req));
  }
}
