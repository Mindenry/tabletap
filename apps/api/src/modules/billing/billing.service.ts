import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DocumentNumberService } from '../../common/common.module';
import { AuditService } from '../audit/audit.module';
import { OutboxService } from '../realtime/outbox.service';
import { BranchAccessService } from '../tenancy/branch-access.service';
import { D, moneyString } from '../../common/money';
import { ActorMeta } from '../../common/actor';
import type { StaffPrincipal } from '../auth/principal';
import { splitEqually } from '../orders/pricing';
import type { BillQueryDto, SplitBillDto } from './billing.dto';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbers: DocumentNumberService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly branches: BranchAccessService,
  ) {}

  /**
   * Creates a bill from every unbilled order in a live table session.
   * Bill totals are the sum of the linked orders' snapshotted totals, so the
   * bill can never disagree with what the customer was shown, and a later menu
   * edit cannot change it.
   */
  async createBill(principal: StaffPrincipal, tableSessionId: string, actor: ActorMeta) {
    const session = await this.prisma.tableSession.findUnique({
      where: { id: tableSessionId },
      include: { branch: true, table: true },
    });
    if (!session || session.tenantId !== principal.tenantId) {
      throw new NotFoundException({ message: 'Table session not found', code: 'NOT_FOUND' });
    }
    await this.branches.load(principal, session.branchId);
    if (['CLOSED', 'ABANDONED'].includes(session.status)) {
      throw new ConflictException({ message: 'Table session is closed', code: 'SESSION_CLOSED' });
    }

    const existing = await this.prisma.bill.findFirst({
      where: { tableSessionId, status: { in: ['OPEN', 'PARTIALLY_PAID', 'DRAFT'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      throw new ConflictException({
        message: 'This table already has an open bill',
        code: 'BILL_ALREADY_OPEN',
        details: { billId: existing.id, number: existing.number },
      });
    }

    const orders = await this.prisma.order.findMany({
      where: {
        tableSessionId,
        status: { not: 'CANCELLED' },
        billOrders: { none: { bill: { status: { not: 'CANCELLED' } } } },
      },
      include: { items: true },
      orderBy: { createdAt: 'asc' },
    });
    if (orders.length === 0) {
      throw new BadRequestException({
        message: 'There are no unbilled orders on this table',
        code: 'NO_ELIGIBLE_ORDERS',
      });
    }

    const totals = orders.reduce(
      (acc, order) => ({
        subtotal: acc.subtotal.plus(order.subtotal),
        discount: acc.discount.plus(order.discountTotal),
        service: acc.service.plus(order.serviceCharge),
        tax: acc.tax.plus(order.taxTotal),
        total: acc.total.plus(order.total),
      }),
      { subtotal: D(0), discount: D(0), service: D(0), tax: D(0), total: D(0) },
    );

    const bill = await this.prisma.$transaction(async (tx) => {
      const number = await this.numbers.next(tx, {
        tenantId: principal.tenantId,
        branchId: session.branchId,
        branchCode: session.branch.code,
        type: 'BILL',
      });
      const created = await tx.bill.create({
        data: {
          tenantId: principal.tenantId,
          branchId: session.branchId,
          tableSessionId,
          number,
          status: 'OPEN',
          subtotal: totals.subtotal,
          discountTotal: totals.discount,
          serviceCharge: totals.service,
          taxTotal: totals.tax,
          total: totals.total,
          paidTotal: D(0),
          currency: session.branch.currency,
          taxRate: session.branch.vatRate,
          taxInclusive: session.branch.vatInclusive,
          serviceChargeType: session.branch.serviceChargeType,
          serviceChargeValue: session.branch.serviceChargeValue,
          createdById: principal.userId,
        },
      });

      for (const order of orders) {
        await tx.billOrder.create({ data: { billId: created.id, orderId: order.id } });
        for (const item of order.items) {
          if (item.status === 'CANCELLED') continue;
          await tx.billItem.create({
            data: {
              billId: created.id,
              orderItemId: item.id,
              nameSnapshot: item.nameSnapshot,
              variantName: item.variantName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              modifiersTotal: item.modifiersTotal,
              lineSubtotal: item.lineSubtotal,
              lineDiscount: item.lineDiscount,
              lineTax: item.lineTax,
              lineTotal: item.lineTotal,
            },
          });
        }
      }

      await tx.tableSession.update({ where: { id: tableSessionId }, data: { status: 'BILL_REQUESTED' } });
      await tx.diningTable.update({ where: { id: session.tableId }, data: { status: 'BILL_REQUESTED' } });
      await this.outbox.append(tx, {
        tenantId: principal.tenantId,
        branchId: session.branchId,
        eventType: 'bill.created',
        aggregateType: 'Bill',
        aggregateId: created.id,
        payload: {
          billId: created.id,
          number: created.number,
          total: moneyString(created.total),
          tableNumber: session.table.number,
          tableSessionId,
        },
      });
      return created;
    });

    await this.audit.record(
      {
        tenantId: principal.tenantId,
        branchId: session.branchId,
        actorId: principal.userId,
        action: 'bill.created',
        resourceType: 'Bill',
        resourceId: bill.id,
        after: { number: bill.number, total: moneyString(bill.total), orders: orders.length },
        requestId: actor.requestId,
      },
      this.prisma,
    );
    return this.getBill(principal, bill.id);
  }

  async listBills(principal: StaffPrincipal, query: BillQueryDto) {
    const branch = await this.branches.resolve(principal, query.branchId);
    const rows = await this.prisma.bill.findMany({
      where: {
        tenantId: principal.tenantId,
        branchId: branch.id,
        ...(query.status ? { status: query.status as never } : {}),
        ...(query.search ? { number: { contains: query.search, mode: 'insensitive' } } : {}),
      },
      include: {
        tableSession: { include: { table: { select: { number: true, name: true } } } },
        payments: { select: { id: true, method: true, status: true, amount: true } },
        _count: { select: { items: true, orders: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(query.limit ?? 50, 200),
    });
    return rows.map((bill) => ({
      id: bill.id,
      number: bill.number,
      status: bill.status,
      tableSessionId: bill.tableSessionId,
      table: bill.tableSession.table,
      total: moneyString(bill.total),
      paidTotal: moneyString(bill.paidTotal),
      due: moneyString(bill.total.minus(bill.paidTotal)),
      itemCount: bill._count.items,
      orderCount: bill._count.orders,
      paymentCount: bill.payments.length,
      createdAt: bill.createdAt,
      paidAt: bill.paidAt,
      payments: bill.payments.map((payment) => ({
        id: payment.id,
        method: payment.method,
        status: payment.status,
        amount: moneyString(payment.amount),
      })),
    }));
  }

  async getBill(principal: StaffPrincipal, billId: string) {
    const bill = await this.prisma.bill.findUnique({
      where: { id: billId },
      include: {
        items: true,
        orders: { include: { order: { select: { id: true, number: true, status: true } } } },
        splits: { include: { items: true } },
        payments: { include: { refunds: true }, orderBy: { createdAt: 'asc' } },
        receipt: true,
        tableSession: { include: { table: { select: { id: true, number: true, name: true } } } },
        branch: {
          select: { id: true, name: true, address: true, phone: true, vatRate: true, vatInclusive: true },
        },
      },
    });
    if (!bill || bill.tenantId !== principal.tenantId) {
      throw new NotFoundException({ message: 'Bill not found', code: 'NOT_FOUND' });
    }
    await this.branches.load(principal, bill.branchId);

    const pendingPayments = bill.payments
      .filter((payment) => ['PENDING', 'AWAITING_CONFIRMATION'].includes(payment.status))
      .reduce((acc, payment) => acc.plus(payment.amount), D(0));

    return {
      id: bill.id,
      number: bill.number,
      status: bill.status,
      table: bill.tableSession.table,
      tableSessionId: bill.tableSessionId,
      branch: bill.branch,
      currency: bill.currency,
      subtotal: moneyString(bill.subtotal),
      discountTotal: moneyString(bill.discountTotal),
      serviceCharge: moneyString(bill.serviceCharge),
      taxTotal: moneyString(bill.taxTotal),
      total: moneyString(bill.total),
      paidTotal: moneyString(bill.paidTotal),
      pendingTotal: moneyString(pendingPayments),
      due: moneyString(bill.total.minus(bill.paidTotal)),
      availableToPay: moneyString(
        Prisma.Decimal.max(0, bill.total.minus(bill.paidTotal).minus(pendingPayments)),
      ),
      taxRate: bill.taxRate.toFixed(2),
      taxInclusive: bill.taxInclusive,
      serviceChargeType: bill.serviceChargeType,
      serviceChargeValue: bill.serviceChargeValue.toFixed(2),
      createdAt: bill.createdAt,
      paidAt: bill.paidAt,
      items: bill.items.map((item) => ({
        id: item.id,
        name: item.nameSnapshot,
        variantName: item.variantName,
        quantity: item.quantity,
        unitPrice: moneyString(item.unitPrice),
        lineTotal: moneyString(item.lineTotal),
        lineTax: moneyString(item.lineTax),
        lineDiscount: moneyString(item.lineDiscount),
      })),
      orders: bill.orders.map((link) => ({
        id: link.order.id,
        number: link.order.number,
        status: link.order.status,
      })),
      splits: bill.splits.map((split) => ({
        id: split.id,
        label: split.label,
        amount: moneyString(split.amount),
        status: split.status,
        paidAt: split.paidAt,
        items: split.items.map((item) => ({
          billItemId: item.billItemId,
          quantity: item.quantity,
          amount: moneyString(item.amount),
        })),
      })),
      payments: bill.payments.map((payment) => ({
        id: payment.id,
        reference: payment.reference,
        method: payment.method,
        status: payment.status,
        amount: moneyString(payment.amount),
        amountPaid: moneyString(payment.amountPaid),
        promptPayPayload: payment.promptPayPayload,
        expiresAt: payment.expiresAt,
        confirmedAt: payment.confirmedAt,
        createdAt: payment.createdAt,
        refunds: payment.refunds.map((refund) => ({
          id: refund.id,
          amount: moneyString(refund.amount),
          reason: refund.reason,
          createdAt: refund.createdAt,
        })),
      })),
      receipt: bill.receipt
        ? { id: bill.receipt.id, number: bill.receipt.number, issuedAt: bill.receipt.issuedAt }
        : null,
    };
  }

  async splitBill(principal: StaffPrincipal, billId: string, dto: SplitBillDto, actor: ActorMeta) {
    const bill = await this.prisma.bill.findUnique({
      where: { id: billId },
      include: { items: true, splits: true },
    });
    if (!bill || bill.tenantId !== principal.tenantId) {
      throw new NotFoundException({ message: 'Bill not found', code: 'NOT_FOUND' });
    }
    await this.branches.load(principal, bill.branchId);
    if (!['OPEN', 'PARTIALLY_PAID'].includes(bill.status)) {
      throw new ConflictException({
        message: `Cannot split a ${bill.status} bill`,
        code: 'BILL_NOT_SPLITTABLE',
      });
    }
    if (bill.splits.length > 0) {
      throw new ConflictException({
        message: 'This bill has already been split',
        code: 'BILL_ALREADY_SPLIT',
      });
    }

    const total = bill.total;

    if (dto.mode === 'EQUAL') {
      const parts = dto.parts ?? 0;
      if (parts < 2)
        throw new BadRequestException({ message: 'Choose at least 2 parts', code: 'INVALID_SPLIT' });
      const amounts = splitEqually(total, parts);
      return this.persistSplits(
        principal,
        bill.id,
        amounts.map((amount, index) => ({ label: `Guest ${index + 1}`, amount, items: [] })),
        actor,
      );
    }

    if (dto.mode === 'AMOUNT') {
      const amounts = (dto.amounts ?? []).map((amount) => D(amount));
      const sum = amounts.reduce((acc, amount) => acc.plus(amount), D(0));
      if (!sum.equals(total)) {
        throw new BadRequestException({
          message: 'Split amounts must add up to the bill total',
          code: 'SPLIT_TOTAL_MISMATCH',
          details: { total: moneyString(total), provided: moneyString(sum) },
        });
      }
      return this.persistSplits(
        principal,
        bill.id,
        amounts.map((amount, index) => ({ label: `Guest ${index + 1}`, amount, items: [] })),
        actor,
      );
    }

    // ITEMS mode: allocate each bill item's amount by quantity.
    const groups = dto.groups ?? [];
    if (groups.length < 2) {
      throw new BadRequestException({ message: 'Provide at least 2 split groups', code: 'INVALID_SPLIT' });
    }
    const itemTotals = new Map(bill.items.map((item) => [item.id, item]));

    const persisted = groups.map((group, index) => {
      let amount = D(0);
      const items = group.items.map((line) => {
        const billItem = itemTotals.get(line.billItemId);
        if (!billItem) {
          throw new BadRequestException({
            message: 'Unknown bill item in split',
            code: 'INVALID_SPLIT_ITEM',
          });
        }
        if (line.quantity > billItem.quantity) {
          throw new BadRequestException({
            message: `Cannot split ${line.quantity} of ${billItem.quantity} × ${billItem.nameSnapshot}`,
            code: 'SPLIT_QUANTITY_EXCEEDED',
          });
        }
        const lineAmount = billItem.lineTotal
          .times(line.quantity)
          .dividedBy(billItem.quantity)
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        amount = amount.plus(lineAmount);
        return { billItemId: line.billItemId, quantity: line.quantity, amount: lineAmount };
      });
      return { label: group.label || `Guest ${index + 1}`, amount, items };
    });

    const unassigned = bill.items.reduce((acc, item) => {
      const assigned = groups.reduce(
        (sum, group) =>
          sum + group.items.filter((line) => line.billItemId === item.id).reduce((s, l) => s + l.quantity, 0),
        0,
      );
      return acc + Math.max(0, item.quantity - assigned);
    }, 0);
    if (unassigned > 0) {
      throw new BadRequestException({
        message: 'Every quantity on the bill must be assigned to a guest',
        code: 'SPLIT_INCOMPLETE',
        details: { unassigned },
      });
    }

    return this.persistSplits(principal, bill.id, persisted, actor);
  }

  private async persistSplits(
    principal: StaffPrincipal,
    billId: string,
    splits: Array<{
      label: string;
      amount: Prisma.Decimal;
      items: Array<{ billItemId: string; quantity: number; amount: Prisma.Decimal }>;
    }>,
    actor: ActorMeta,
  ) {
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.billSplit.deleteMany({ where: { billId } });
      for (const split of splits) {
        const row = await tx.billSplit.create({
          data: { billId, label: split.label, amount: split.amount },
        });
        if (split.items.length > 0) {
          await tx.billSplitItem.createMany({
            data: split.items.map((item) => ({
              splitId: row.id,
              billItemId: item.billItemId,
              quantity: item.quantity,
              amount: item.amount,
            })),
          });
        }
      }
      const bill = await tx.bill.findUniqueOrThrow({ where: { id: billId } });
      return bill;
    });

    await this.audit.record(
      {
        tenantId: principal.tenantId,
        branchId: created.branchId,
        actorId: principal.userId,
        action: 'bill.split',
        resourceType: 'Bill',
        resourceId: billId,
        after: { parts: splits.length, total: moneyString(created.total) },
        requestId: actor.requestId,
      },
      this.prisma,
    );
    return this.getBill(principal, billId);
  }

  async cancelBill(principal: StaffPrincipal, billId: string, reason: string, actor: ActorMeta) {
    const bill = await this.prisma.bill.findUnique({
      where: { id: billId },
      include: { payments: true },
    });
    if (!bill || bill.tenantId !== principal.tenantId) {
      throw new NotFoundException({ message: 'Bill not found', code: 'NOT_FOUND' });
    }
    await this.branches.load(principal, bill.branchId);
    if (bill.payments.some((payment) => payment.status === 'PAID')) {
      throw new ConflictException({
        message: 'A bill with a confirmed payment cannot be cancelled. Record a refund instead.',
        code: 'BILL_HAS_PAYMENT',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({
        where: { billId, status: { in: ['PENDING', 'AWAITING_CONFIRMATION'] } },
        data: { status: 'FAILED', failureReason: `Bill cancelled: ${reason}` },
      });
      await tx.bill.update({
        where: { id: billId },
        data: { status: 'CANCELLED', cancelledAt: new Date(), note: reason },
      });
      await tx.billOrder.deleteMany({ where: { billId } });
      const session = await tx.tableSession.findUniqueOrThrow({ where: { id: bill.tableSessionId } });
      if (session.status === 'BILL_REQUESTED') {
        await tx.tableSession.update({ where: { id: session.id }, data: { status: 'OPEN' } });
        await tx.diningTable.update({ where: { id: session.tableId }, data: { status: 'OCCUPIED' } });
      }
      await this.audit.record(
        {
          tenantId: principal.tenantId,
          branchId: bill.branchId,
          actorId: principal.userId,
          action: 'bill.cancelled',
          resourceType: 'Bill',
          resourceId: billId,
          reason,
          requestId: actor.requestId,
        },
        tx,
      );
    });
    return { id: billId, status: 'CANCELLED' };
  }

  /** Creates (or returns) the immutable receipt snapshot for a paid bill. */
  async ensureReceipt(principal: StaffPrincipal, billId: string) {
    const bill = await this.prisma.bill.findUnique({
      where: { id: billId },
      include: {
        items: true,
        payments: { include: { refunds: true } },
        tableSession: { include: { table: true } },
        branch: true,
        tenant: true,
        receipt: true,
        orders: { include: { order: { select: { number: true } } } },
      },
    });
    if (!bill || bill.tenantId !== principal.tenantId) {
      throw new NotFoundException({ message: 'Bill not found', code: 'NOT_FOUND' });
    }
    await this.branches.load(principal, bill.branchId);
    if (bill.status !== 'PAID') {
      throw new ConflictException({
        message: 'Receipts are available once the bill is paid',
        code: 'BILL_NOT_PAID',
      });
    }
    if (bill.receipt) {
      return { number: bill.receipt.number, issuedAt: bill.receipt.issuedAt, payload: bill.receipt.payload };
    }

    const number = await this.prisma.$transaction(async (tx) => {
      const generated = await this.numbers.next(tx, {
        tenantId: bill.tenantId,
        branchId: bill.branchId,
        branchCode: bill.branch.code,
        type: 'RCP',
      });
      const payload = {
        restaurant: { name: bill.tenant.name, taxId: bill.tenant.taxId, address: bill.tenant.address },
        branch: {
          name: bill.branch.name,
          address: bill.branch.address,
          phone: bill.branch.phone,
          vatRate: bill.taxRate.toFixed(2),
          vatInclusive: bill.taxInclusive,
        },
        billNumber: bill.number,
        receiptNumber: generated,
        orderNumbers: bill.orders.map((link) => link.order.number),
        table: bill.tableSession.table.number,
        issuedAt: new Date().toISOString(),
        currency: bill.currency,
        items: bill.items.map((item) => ({
          name: item.nameSnapshot,
          variantName: item.variantName,
          quantity: item.quantity,
          unitPrice: moneyString(item.unitPrice),
          lineTotal: moneyString(item.lineTotal),
          lineTax: moneyString(item.lineTax),
        })),
        subtotal: moneyString(bill.subtotal),
        discountTotal: moneyString(bill.discountTotal),
        serviceCharge: moneyString(bill.serviceCharge),
        taxTotal: moneyString(bill.taxTotal),
        total: moneyString(bill.total),
        payments: bill.payments.map((payment) => ({
          method: payment.method,
          status: payment.status,
          amount: moneyString(payment.amount),
          amountPaid: moneyString(payment.amountPaid),
          reference: payment.reference,
        })),
        refunds: bill.payments.flatMap((payment) =>
          payment.refunds.map((refund) => ({
            amount: moneyString(refund.amount),
            reason: refund.reason,
            createdAt: refund.createdAt.toISOString(),
          })),
        ),
        notice:
          'This is a TableTap sales receipt, not a Thai e-Tax invoice. Confirm fiscal requirements before legal use.',
      };
      await tx.receipt.create({
        data: {
          billId,
          number: generated,
          payload: payload as Prisma.InputJsonValue,
          createdById: principal.userId,
        },
      });
      return generated;
    });

    const receipt = await this.prisma.receipt.findUniqueOrThrow({ where: { billId } });
    await this.audit.record(
      {
        tenantId: principal.tenantId,
        branchId: bill.branchId,
        actorId: principal.userId,
        action: 'receipt.issued',
        resourceType: 'Receipt',
        resourceId: receipt.id,
        after: { number },
        requestId: undefined,
      },
      this.prisma,
    );
    return { number: receipt.number, issuedAt: receipt.issuedAt, payload: receipt.payload };
  }
}
