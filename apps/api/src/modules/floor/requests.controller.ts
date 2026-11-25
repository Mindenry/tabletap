import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request } from 'express';
import { CurrentStaff, RequirePermissions, RequireAnyPermission } from '../auth/decorators';
import type { StaffPrincipal } from '../auth/principal';
import { actorFrom } from '../../common/actor';
import { FloorService } from './floor.service';

class RequestQueryDto {
  @IsString()
  branchId!: string;

  @IsOptional()
  @IsIn(['ALL', 'OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'])
  status?: string;
}

class ResolveRequestDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  note?: string;
}

@ApiTags('requests')
@ApiBearerAuth()
@Controller('table-requests')
export class TableRequestsController {
  constructor(private readonly floor: FloorService) {}

  @Get()
  @RequirePermissions('table.read')
  list(@CurrentStaff() principal: StaffPrincipal, @Query() query: RequestQueryDto) {
    return this.floor.listRequests(principal, query.branchId, query.status);
  }

  @Post(':id/acknowledge')
  @RequireAnyPermission('table.update', 'order.read')
  acknowledge(@CurrentStaff() principal: StaffPrincipal, @Param('id') id: string, @Req() req: Request) {
    return this.floor.acknowledgeRequest(principal, id, actorFrom(req));
  }

  @Post(':id/resolve')
  @RequireAnyPermission('table.update', 'order.read')
  resolve(
    @CurrentStaff() principal: StaffPrincipal,
    @Param('id') id: string,
    @Body() dto: ResolveRequestDto,
    @Req() req: Request,
  ) {
    return this.floor.resolveRequest(principal, id, dto.note, actorFrom(req));
  }
}
