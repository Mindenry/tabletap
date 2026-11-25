import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentStaff, RequirePermissions } from '../auth/decorators';
import type { StaffPrincipal } from '../auth/principal';
import { PaginationQueryDto } from '../../common/pagination.dto';
import { TenancyService } from './tenancy.service';

class AuditQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  branchId?: string;
}

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly tenancy: TenancyService) {}

  @Get()
  @RequirePermissions('audit.read')
  list(@CurrentStaff() principal: StaffPrincipal, @Query() query: AuditQueryDto) {
    return this.tenancy.listAuditLogs(principal, {
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      action: query.action,
      branchId: query.branchId,
    });
  }
}
