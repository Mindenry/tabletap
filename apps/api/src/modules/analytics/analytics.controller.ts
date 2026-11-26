import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { CurrentStaff, RequirePermissions, RequireAnyPermission } from '../auth/decorators';
import type { StaffPrincipal } from '../auth/principal';
import { AnalyticsService } from './analytics.service';

class PeriodQueryDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

class SalesQueryDto extends PeriodQueryDto {
  @IsOptional()
  @IsIn(['day', 'hour'])
  groupBy?: 'day' | 'hour';
}

class MenuQueryDto extends PeriodQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

class DayCloseQueryDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  /** YYYY-MM-DD in the restaurant's timezone. Defaults to today in Bangkok. */
  @IsOptional()
  @IsString()
  date?: string;
}

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  @RequirePermissions('analytics.read')
  overview(@CurrentStaff() principal: StaffPrincipal, @Query() query: PeriodQueryDto) {
    return this.analytics.overview(principal, query);
  }

  @Get('sales')
  @RequirePermissions('analytics.read')
  sales(@CurrentStaff() principal: StaffPrincipal, @Query() query: SalesQueryDto) {
    return this.analytics.salesSeries(principal, query);
  }

  @Get('menu-performance')
  @RequirePermissions('analytics.read')
  menu(@CurrentStaff() principal: StaffPrincipal, @Query() query: MenuQueryDto) {
    return this.analytics.menuPerformance(principal, query);
  }

  @Get('operations')
  @RequirePermissions('analytics.read')
  operations(@CurrentStaff() principal: StaffPrincipal, @Query() query: PeriodQueryDto) {
    return this.analytics.operations(principal, query);
  }

  @Get('branches')
  @RequirePermissions('analytics.read')
  branches(@CurrentStaff() principal: StaffPrincipal, @Query() query: PeriodQueryDto) {
    return this.analytics.branchComparison(principal, query);
  }

  @Get('day-close')
  @RequireAnyPermission('analytics.read', 'payment.read')
  dayClose(@CurrentStaff() principal: StaffPrincipal, @Query() query: DayCloseQueryDto) {
    return this.analytics.dayClose(principal, query);
  }
}
