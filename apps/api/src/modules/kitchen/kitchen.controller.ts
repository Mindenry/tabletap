import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import type { Request } from 'express';
import { CurrentStaff, RequirePermissions, RequireAnyPermission } from '../auth/decorators';
import type { StaffPrincipal } from '../auth/principal';
import { actorFrom } from '../../common/actor';
import { KitchenService } from './kitchen.service';

class TicketQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  branchId?: string;

  @IsOptional()
  @IsUUID('4')
  stationId?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeServed?: boolean;
}

class RejectTicketDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

@ApiTags('kitchen')
@ApiBearerAuth()
@Controller('kitchen')
export class KitchenController {
  constructor(private readonly kitchen: KitchenService) {}

  @Get('stations')
  @RequirePermissions('kitchen.read')
  stations(@CurrentStaff() principal: StaffPrincipal, @Query('branchId') branchId: string) {
    return this.kitchen.listStations(principal, branchId);
  }

  @Get('tickets')
  @RequirePermissions('kitchen.read')
  tickets(@CurrentStaff() principal: StaffPrincipal, @Query() query: TicketQueryDto) {
    return this.kitchen.listTickets(principal, query);
  }

  @Post('tickets/:id/accept')
  @RequirePermissions('kitchen.update')
  accept(@CurrentStaff() principal: StaffPrincipal, @Param('id') id: string, @Req() req: Request) {
    return this.kitchen.acceptTicket(principal, id, actorFrom(req));
  }

  @Post('tickets/:id/start')
  @RequirePermissions('kitchen.update')
  start(@CurrentStaff() principal: StaffPrincipal, @Param('id') id: string, @Req() req: Request) {
    return this.kitchen.startTicket(principal, id, actorFrom(req));
  }

  @Post('tickets/:id/ready')
  @RequirePermissions('kitchen.update')
  ready(@CurrentStaff() principal: StaffPrincipal, @Param('id') id: string, @Req() req: Request) {
    return this.kitchen.readyTicket(principal, id, actorFrom(req));
  }

  @Post('tickets/:id/reject')
  @RequirePermissions('kitchen.update')
  reject(
    @CurrentStaff() principal: StaffPrincipal,
    @Param('id') id: string,
    @Body() dto: RejectTicketDto,
    @Req() req: Request,
  ) {
    return this.kitchen.rejectTicket(principal, id, dto.reason, actorFrom(req));
  }

  @Post('tickets/:id/served')
  @RequireAnyPermission('kitchen.update', 'table.update')
  servedTicket(@CurrentStaff() principal: StaffPrincipal, @Param('id') id: string, @Req() req: Request) {
    return this.kitchen.serveTicket(principal, id, actorFrom(req));
  }

  @Post('items/:id/ready')
  @RequirePermissions('kitchen.update')
  readyItem(@CurrentStaff() principal: StaffPrincipal, @Param('id') id: string, @Req() req: Request) {
    return this.kitchen.readyItem(principal, id, actorFrom(req));
  }

  @Post('items/:id/served')
  @RequireAnyPermission('kitchen.update', 'table.update')
  served(@CurrentStaff() principal: StaffPrincipal, @Param('id') id: string, @Req() req: Request) {
    return this.kitchen.serveItem(principal, id, actorFrom(req));
  }
}
