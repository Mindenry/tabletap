import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentStaff, RequirePermissions, RequireAnyPermission } from '../auth/decorators';
import type { StaffPrincipal } from '../auth/principal';
import { actorFrom, idempotencyKeyFrom } from '../../common/actor';
import { OrdersService } from './orders.service';
import { CancelOrderDto, OrderQueryDto, StaffCreateOrderDto } from './orders.dto';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @RequirePermissions('order.read')
  list(@CurrentStaff() principal: StaffPrincipal, @Query() query: OrderQueryDto) {
    return this.orders.listOrders(principal, query);
  }

  @Post()
  @RequirePermissions('order.create')
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  create(@CurrentStaff() principal: StaffPrincipal, @Body() dto: StaffCreateOrderDto, @Req() req: Request) {
    return this.orders.createStaffOrder(principal, dto, idempotencyKeyFrom(req), actorFrom(req));
  }

  @Get(':id')
  @RequirePermissions('order.read')
  get(@CurrentStaff() principal: StaffPrincipal, @Param('id') id: string) {
    return this.orders.getOrder(principal, id);
  }

  @Post(':id/accept')
  @RequirePermissions('kitchen.update')
  accept(@CurrentStaff() principal: StaffPrincipal, @Param('id') id: string, @Req() req: Request) {
    return this.orders.acceptOrder(principal, id, actorFrom(req));
  }

  @Post(':id/preparing')
  @RequirePermissions('kitchen.update')
  preparing(@CurrentStaff() principal: StaffPrincipal, @Param('id') id: string, @Req() req: Request) {
    return this.orders.startPreparing(principal, id, actorFrom(req));
  }

  @Post(':id/ready')
  @RequirePermissions('kitchen.update')
  ready(@CurrentStaff() principal: StaffPrincipal, @Param('id') id: string, @Req() req: Request) {
    return this.orders.markReady(principal, id, actorFrom(req));
  }

  @Post(':id/served')
  @RequireAnyPermission('table.update', 'kitchen.update')
  served(@CurrentStaff() principal: StaffPrincipal, @Param('id') id: string, @Req() req: Request) {
    return this.orders.markServed(principal, id, actorFrom(req));
  }

  @Post(':id/cancel')
  @RequirePermissions('order.cancel')
  cancel(
    @CurrentStaff() principal: StaffPrincipal,
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
    @Req() req: Request,
  ) {
    return this.orders.cancelOrder(principal, id, dto.reason, actorFrom(req));
  }
}
