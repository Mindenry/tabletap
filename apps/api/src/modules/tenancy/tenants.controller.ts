import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentStaff, RequirePermissions } from '../auth/decorators';
import type { StaffPrincipal } from '../auth/principal';
import { actorFrom } from '../../common/actor';
import { EntitlementsService } from './entitlements.service';
import { TenancyService } from './tenancy.service';
import { UpdateTenantDto } from './tenancy.dto';

@ApiTags('tenants')
@ApiBearerAuth()
@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly entitlements: EntitlementsService,
  ) {}

  @Get('current')
  @RequirePermissions('restaurant.read')
  current(@CurrentStaff() principal: StaffPrincipal) {
    return this.tenancy.tenant(principal);
  }

  @Patch('current')
  @RequirePermissions('restaurant.update')
  update(@CurrentStaff() principal: StaffPrincipal, @Body() dto: UpdateTenantDto, @Req() req: Request) {
    return this.tenancy.updateTenant(principal, dto, actorFrom(req));
  }

  @Get('current/entitlements')
  @RequirePermissions('restaurant.read')
  entitlementSummary(@CurrentStaff() principal: StaffPrincipal) {
    return this.entitlements.summary(principal.tenantId);
  }
}
