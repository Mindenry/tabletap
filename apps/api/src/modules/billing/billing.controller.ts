import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentStaff, RequirePermissions } from '../auth/decorators';
import type { StaffPrincipal } from '../auth/principal';
import { actorFrom, idempotencyKeyFrom } from '../../common/actor';
import { csvFileName, toCsv } from '../../common/csv';
import { BillingService } from './billing.service';
import { PaymentsService } from './payments.service';
import {
  BillQueryDto,
  CancelBillDto,
  ConfirmPaymentDto,
  CreateBillDto,
  CreatePaymentDto,
  RefundDto,
  SplitBillDto,
} from './billing.dto';

@ApiTags('billing')
@ApiBearerAuth()
@Controller('bills')
export class BillsController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  @RequirePermissions('payment.read')
  list(@CurrentStaff() principal: StaffPrincipal, @Query() query: BillQueryDto) {
    return this.billing.listBills(principal, query);
  }

  @Post()
  @RequirePermissions('bill.create')
  create(@CurrentStaff() principal: StaffPrincipal, @Body() dto: CreateBillDto, @Req() req: Request) {
    return this.billing.createBill(principal, dto.tableSessionId, actorFrom(req));
  }

  @Get('export')
  @RequirePermissions('report.export')
  async export(
    @CurrentStaff() principal: StaffPrincipal,
    @Query() query: BillQueryDto,
    @Res() res: Response,
  ) {
    const rows = await this.billing.exportBills(principal, query);
    const csv = toCsv(
      [
        { header: 'Bill', value: (row) => row.number },
        { header: 'Created', value: (row) => row.createdAt },
        { header: 'Paid at', value: (row) => row.paidAt },
        { header: 'Table', value: (row) => row.table },
        { header: 'Status', value: (row) => row.status },
        { header: 'Total (THB)', value: (row) => row.total },
        { header: 'Paid (THB)', value: (row) => row.paid },
        { header: 'Due (THB)', value: (row) => row.due },
      ],
      rows,
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${csvFileName('bills', query.from, query.to)}"`,
    );
    res.send(csv);
  }

  @Get(':id')
  @RequirePermissions('payment.read')
  get(@CurrentStaff() principal: StaffPrincipal, @Param('id') id: string) {
    return this.billing.getBill(principal, id);
  }

  @Post(':id/split')
  @RequirePermissions('bill.split')
  split(
    @CurrentStaff() principal: StaffPrincipal,
    @Param('id') id: string,
    @Body() dto: SplitBillDto,
    @Req() req: Request,
  ) {
    return this.billing.splitBill(principal, id, dto, actorFrom(req));
  }

  @Post(':id/cancel')
  @RequirePermissions('bill.create')
  cancel(
    @CurrentStaff() principal: StaffPrincipal,
    @Param('id') id: string,
    @Body() dto: CancelBillDto,
    @Req() req: Request,
  ) {
    return this.billing.cancelBill(principal, id, dto.reason, actorFrom(req));
  }

  @Get(':id/receipt')
  @RequirePermissions('payment.read')
  async receipt(@CurrentStaff() principal: StaffPrincipal, @Param('id') id: string) {
    return this.billing.ensureReceipt(principal, id);
  }
}

@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @RequirePermissions('payment.confirm')
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  create(@CurrentStaff() principal: StaffPrincipal, @Body() dto: CreatePaymentDto, @Req() req: Request) {
    return this.payments.createPayment(principal, dto, actorFrom(req), idempotencyKeyFrom(req));
  }

  @Get(':id')
  @RequirePermissions('payment.read')
  get(@CurrentStaff() principal: StaffPrincipal, @Param('id') id: string) {
    return this.payments.getPayment(principal, id);
  }

  @Post(':id/promptpay')
  @RequirePermissions('payment.confirm')
  @HttpCode(200)
  promptPay(@CurrentStaff() principal: StaffPrincipal, @Param('id') id: string, @Req() req: Request) {
    return this.payments.generatePromptPay(principal, id, actorFrom(req));
  }

  @Post(':id/confirm')
  @RequirePermissions('payment.confirm')
  @HttpCode(200)
  confirm(
    @CurrentStaff() principal: StaffPrincipal,
    @Param('id') id: string,
    @Body() dto: ConfirmPaymentDto,
    @Req() req: Request,
  ) {
    return this.payments.confirmPayment(principal, id, dto, actorFrom(req));
  }

  @Post(':id/expire')
  @RequirePermissions('payment.confirm')
  @HttpCode(200)
  expire(@CurrentStaff() principal: StaffPrincipal, @Param('id') id: string, @Req() req: Request) {
    return this.payments.expirePayment(principal, id, actorFrom(req));
  }

  @Post(':id/refund')
  @RequirePermissions('payment.refund')
  @HttpCode(200)
  refund(
    @CurrentStaff() principal: StaffPrincipal,
    @Param('id') id: string,
    @Body() dto: RefundDto,
    @Req() req: Request,
  ) {
    return this.payments.refund(principal, id, dto, actorFrom(req));
  }

  @Get(':id/qr')
  @RequirePermissions('payment.read')
  async qr(
    @CurrentStaff() principal: StaffPrincipal,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.payments.qrImage(principal, id);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  }
}
