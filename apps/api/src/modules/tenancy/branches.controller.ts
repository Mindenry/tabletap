import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentStaff, RequirePermissions } from '../auth/decorators';
import type { StaffPrincipal } from '../auth/principal';
import { actorFrom } from '../../common/actor';
import { TenancyService } from './tenancy.service';
import { CreateBranchDto, UpdateBranchDto } from './tenancy.dto';

@ApiTags('branches')
@ApiBearerAuth()
@Controller('branches')
export class BranchesController {
  constructor(private readonly tenancy: TenancyService) {}

  @Get()
  @RequirePermissions('branch.read')
  list(@CurrentStaff() principal: StaffPrincipal) {
    return this.tenancy.listBranches(principal);
  }

  @Post()
  @RequirePermissions('branch.create')
  create(@CurrentStaff() principal: StaffPrincipal, @Body() dto: CreateBranchDto, @Req() req: Request) {
    return this.tenancy.createBranch(principal, dto, actorFrom(req));
  }

  @Get(':id')
  @RequirePermissions('branch.read')
  get(@CurrentStaff() principal: StaffPrincipal, @Param('id') id: string) {
    return this.tenancy.getBranch(principal, id);
  }

  @Patch(':id')
  @RequirePermissions('branch.update')
  update(
    @CurrentStaff() principal: StaffPrincipal,
    @Param('id') id: string,
    @Body() dto: UpdateBranchDto,
    @Req() req: Request,
  ) {
    return this.tenancy.updateBranch(principal, id, dto, actorFrom(req));
  }
}
