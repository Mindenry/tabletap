import { Body, Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentStaff, RequirePermissions, RequireAnyPermission } from '../auth/decorators';
import type { StaffPrincipal } from '../auth/principal';
import { actorFrom, idempotencyKeyFrom } from '../../common/actor';
import { csvFileName, toCsv } from '../../common/csv';
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

  @Get('export')
  @RequirePermissions('report.export')
  async export(
    @CurrentStaff() principal: StaffPrincipal,
    @Query() query: OrderQueryDto,
    @Res() res: Response,
  ) {
    const rows = await this.orders.exportOrders(principal, query);
    const csv = toCsv(
      [
        { header: 'Order', value: (row) => row.number },
        { header: 'Created', value: (row) => row.createdAt },
        { header: 'Table', value: (row) => row.table },
        { header: 'Status', value: (row) => row.status },
        { header: 'Source', value: (row) => row.source },
        { header: 'Items', value: (row) => row.items },
        { header: 'Total (THB)', value: (row) => row.total },
        { header: 'Bill', value: (row) => row.bill },
        { header: 'Bill status', value: (row) => row.billStatus },
      ],
      rows,
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${csvFileName('orders', query.from, query.to)}"`,
    );
    res.send(csv);
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
