import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { Request } from 'express';
import { PlatformAdminOnly, CurrentPrincipal } from '../auth/decorators';
import type { PlatformPrincipal } from '../auth/principal';
import { PlatformService } from './platform.service';

class TenantStatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED', 'CANCELLED'])
  status!: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

class UpdateSubscriptionDto {
  @IsOptional()
  @IsIn(['STARTER', 'GROWTH', 'ENTERPRISE'])
  planKey?: string;

  @IsOptional()
  @IsIn(['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED'])
  status?: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED' | 'EXPIRED';
}

class AuditQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

@ApiTags('platform')
@ApiBearerAuth()
@PlatformAdminOnly()
@Controller('platform')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get('dashboard')
  dashboard() {
    return this.platform.dashboard();
  }

  @Get('tenants')
  tenants(@Query('search') search?: string) {
    return this.platform.tenants(search);
  }

  @Get('tenants/:id')
  tenant(@Param('id') id: string) {
    return this.platform.tenant(id);
  }

  @Post('tenants/:id/status')
  setStatus(
    @CurrentPrincipal() principal: PlatformPrincipal,
    @Param('id') id: string,
    @Body() dto: TenantStatusDto,
    @Req() req: Request,
  ) {
    return this.platform.setTenantStatus(
      principal,
      id,
      dto.status,
      dto.reason,
      (req as Request & { requestId?: string }).requestId,
    );
  }

  @Get('plans')
  plans() {
    return this.platform.plans();
  }

  @Get('subscriptions')
  subscriptions() {
    return this.platform.subscriptions();
  }

  @Patch('subscriptions/:tenantId')
  updateSubscription(
    @CurrentPrincipal() principal: PlatformPrincipal,
    @Param('tenantId') tenantId: string,
    @Body() dto: UpdateSubscriptionDto,
    @Req() req: Request,
  ) {
    return this.platform.updateSubscription(
      principal,
      tenantId,
      dto,
      (req as Request & { requestId?: string }).requestId,
    );
  }

  @Get('usage')
  usage() {
    return this.platform.usage();
  }

  @Get('system-health')
  health() {
    return this.platform.systemHealth();
  }

  @Get('audit-logs')
  auditLogs(@Query() query: AuditQueryDto) {
    return this.platform.auditLogs(query.limit ?? 100);
  }
}
