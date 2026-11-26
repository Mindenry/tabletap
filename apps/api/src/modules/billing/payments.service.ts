import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import QRCode from 'qrcode';
import {
  buildPromptPayPayload,
  canTransition,
  PAYMENT_TRANSITIONS,
  type PaymentStatus,
} from '@tabletap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.module';
import { OutboxService } from '../realtime/outbox.service';
import { BranchAccessService } from '../tenancy/branch-access.service';
import { BillingService } from './billing.service';
import { D, moneyString } from '../../common/money';
import { randomCode } from '../../common/crypto';
import { ActorMeta } from '../../common/actor';
import type { StaffPrincipal } from '../auth/principal';
import type { ConfirmPaymentDto, CreatePaymentDto, RefundDto } from './billing.dto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly branches: BranchAccessService,
    private readonly billing: BillingService,
  ) {}

  async createPayment(
    principal: StaffPrincipal,
    dto: CreatePaymentDto,
    actor: ActorMeta,
    idempotencyKey?: string,
  ) {
    const scope = 'payment.create';
    if (idempotencyKey) {
      const existing = await this.prisma.idempotencyRecord.findUnique({
        where: { tenantId_scope_key: { tenantId: principal.tenantId, scope, key: idempotencyKey } },
      });
      if (existing) {
        if (existing.requestHash !== JSON.stringify(dto)) {
          throw new ConflictException({
            message: 'This idempotency key was already used with a different request',
            code: 'IDEMPOTENCY_KEY_REUSED',
          });
        }
        return existing.responseBody;
      }
    }
    const bill = await this.prisma.bill.findUnique({
      where: { id: dto.billId },
      include: { payments: true },
    });
    if (!bill || bill.tenantId !== principal.tenantId) {
      throw new NotFoundException({ message: 'Bill not found', code: 'NOT_FOUND' });
    }
    await this.branches.load(principal, bill.branchId);
    if (!['OPEN', 'PARTIALLY_PAID'].includes(bill.status)) {
      throw new ConflictException({
        message: `Cannot take a payment for a ${bill.status} bill`,
        code: 'BILL_NOT_PAYABLE',
      });
    }

    const pending = bill.payments
      .filter((payment) => ['PENDING', 'AWAITING_CONFIRMATION'].includes(payment.status))
      .reduce((acc, payment) => acc.plus(payment.amount), D(0));
    const due = Prisma.Decimal.max(0, bill.total.minus(bill.paidTotal).minus(pending));
    const amount = dto.amount !== undefined ? D(dto.amount) : due;

    if (amount.lessThanOrEqualTo(0)) {
      throw new ConflictException({ message: 'This bill has no balance due', code: 'NOTHING_DUE' });
    }
    if (amount.greaterThan(due)) {
      throw new BadRequestException({
        message: 'Payment exceeds the outstanding balance',
        code: 'OVERPAYMENT',
        details: { due: moneyString(due) },
      });
    }

    if (dto.splitId) {
      const split = await this.prisma.billSplit.findFirst({
        where: { id: dto.splitId, billId: bill.id },
      });
      if (!split) throw new BadRequestException({ message: 'Unknown split', code: 'SPLIT_NOT_FOUND' });
      if (split.status === 'PAID') {
        throw new ConflictException({ message: 'This split is already paid', code: 'SPLIT_ALREADY_PAID' });
      }
    }

    const reference = `PAY-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomCode(8)}`;
    let payment: ReturnType<PaymentsService['serialize']>;
    try {
      payment = await this.prisma.$transaction(async (tx) => {
        const created = await tx.payment.create({
          data: {
            tenantId: principal.tenantId,
            branchId: bill.branchId,
            billId: bill.id,
            method: dto.method,
            status: 'PENDING',
            amount,
            amountPaid: D(0),
            currency: bill.currency,
            reference,
            splitId: dto.splitId ?? null,
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          },
        });
        await tx.paymentAttempt.create({
          data: {
            paymentId: created.id,
            action: 'CREATE',
            actorId: principal.userId,
            result: 'SUCCESS',
            detail: dto.referenceNote ?? null,
          },
        });
        const serialized = this.serialize(created);
        if (idempotencyKey) {
          // Written in the same transaction as the payment, so a duplicate key can
          // never produce a second PENDING row.
          await tx.idempotencyRecord.create({
            data: {
              tenantId: principal.tenantId,
              scope,
              key: idempotencyKey,
              requestHash: JSON.stringify(dto),
              responseCode: 201,
              responseBody: serialized as unknown as Prisma.InputJsonValue,
            },
          });
        }
        return serialized;
      });
    } catch (error) {
      if (idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // A concurrent request with the same key won the race. Its record is the
        // canonical response; the loser must not create a second payment.
        const existing = await this.prisma.idempotencyRecord.findUnique({
          where: { tenantId_scope_key: { tenantId: principal.tenantId, scope, key: idempotencyKey } },
        });
        if (existing) return existing.responseBody;
      }
      throw error;
    }

    await this.audit.record(
      {
        tenantId: principal.tenantId,
        branchId: bill.branchId,
        actorId: principal.userId,
        action: 'payment.created',
        resourceType: 'Payment',
        resourceId: payment.id,
        after: { reference, method: dto.method, amount: moneyString(amount) },
        requestId: actor.requestId,
      },
      this.prisma,
    );
    return payment;
  }

  async generatePromptPay(principal: StaffPrincipal, paymentId: string, actor: ActorMeta) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { bill: true, branch: true },
    });
    if (!payment || payment.tenantId !== principal.tenantId) {
      throw new NotFoundException({ message: 'Payment not found', code: 'NOT_FOUND' });
    }
    await this.branches.load(principal, payment.branchId);
    if (!payment.branch.promptPayId) {
      throw new BadRequestException({
        message: 'PromptPay is not configured for this branch',
        code: 'PROMPTPAY_NOT_CONFIGURED',
      });
    }
    if (!['PENDING', 'AWAITING_CONFIRMATION'].includes(payment.status)) {
      throw new ConflictException({
        message: `Cannot generate a QR for a ${payment.status} payment`,
        code: 'PAYMENT_NOT_PENDING',
      });
    }

    const payload = buildPromptPayPayload({
      target: { id: payment.branch.promptPayId },
      amount: moneyString(payment.amount),
      reference: payment.reference.slice(0, 25),
    });
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const updated = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        provider: 'PROMPTPAY',
        promptPayPayload: payload,
        status: 'AWAITING_CONFIRMATION',
        expiresAt,
      },
    });
    await this.prisma.paymentAttempt.create({
      data: {
        paymentId,
        action: 'PROMPTPAY_QR_GENERATED',
        actorId: principal.userId,
        result: 'SUCCESS',
      },
    });

    const qrPngDataUrl = await QRCode.toDataURL(payload, { margin: 2, width: 640 });
    await this.audit.record(
      {
        tenantId: principal.tenantId,
        branchId: payment.branchId,
        actorId: principal.userId,
        action: 'payment.promptpay_generated',
        resourceType: 'Payment',
        resourceId: paymentId,
        after: { amount: moneyString(payment.amount), expiresAt },
        requestId: actor.requestId,
      },
      this.prisma,
    );

    return {
      ...this.serialize(updated),
      promptPayPayload: payload,
      qrPngDataUrl,
      // Explicitly tells the client that a QR is a request, not a payment.
      requiresConfirmation: true,
    };
  }

  async confirmPayment(
    principal: StaffPrincipal,
    paymentId: string,
    dto: ConfirmPaymentDto,
    actor: ActorMeta,
  ) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.tenantId !== principal.tenantId) {
      throw new NotFoundException({ message: 'Payment not found', code: 'NOT_FOUND' });
    }
    await this.branches.load(principal, payment.branchId);

    const amountPaid = dto.amountPaid !== undefined ? D(dto.amountPaid) : payment.amount;
    if (amountPaid.lessThan(payment.amount)) {
      throw new BadRequestException({
        message: 'Amount received is less than the payment amount',
        code: 'UNDERPAYMENT',
        details: { required: moneyString(payment.amount), received: moneyString(amountPaid) },
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockPayment(tx, paymentId);
      return this.applySettlement(tx, {
        paymentId,
        locked,
        amountPaid,
        confirmedById: principal.userId,
        tenantId: principal.tenantId,
        branchId: payment.branchId,
        detail: `Received ${moneyString(amountPaid)}`,
      });
    });

    await this.audit.record(
      {
        tenantId: principal.tenantId,
        branchId: payment.branchId,
        actorId: principal.userId,
        action: 'payment.confirmed',
        resourceType: 'Payment',
        resourceId: paymentId,
        after: {
          amount: moneyString(payment.amount),
          amountPaid: moneyString(amountPaid),
          billStatus: result.bill.status,
        },
        requestId: actor.requestId,
      },
      this.prisma,
    );

    if (result.fullyPaid) {
      // Receipt generation is idempotent and must never fail the payment.
      void this.billing.ensureReceipt(principal, payment.billId).catch((error: unknown) => {
        this.logger.warn(
          { err: error instanceof Error ? error.message : error, billId: payment.billId },
          'Receipt generation failed after payment',
        );
      });
    }

    return {
      ...this.serialize(result.payment),
      bill: {
        id: result.bill.id,
        number: result.bill.number,
        status: result.bill.status,
        total: moneyString(result.bill.total),
        paidTotal: moneyString(result.bill.paidTotal),
        due: moneyString(result.bill.total.minus(result.bill.paidTotal)),
      },
    };
  }

  /**
   * Shared settlement used by a cashier confirmation and a verified provider
   * webhook. The caller owns the transaction and the audit entry.
   */
  private async lockPayment(tx: Prisma.TransactionClient, paymentId: string) {
    const rows = await tx.$queryRaw<
      Array<{ status: PaymentStatus; amount: Prisma.Decimal; billId: string; splitId: string | null }>
    >`
      SELECT "status", "amount", "billId", "splitId" FROM "Payment" WHERE "id" = ${paymentId}::uuid FOR UPDATE
    `;
    const locked = rows[0];
    if (!locked) throw new NotFoundException({ message: 'Payment not found', code: 'NOT_FOUND' });
    if (!canTransition(PAYMENT_TRANSITIONS, locked.status, 'PAID')) {
      throw new ConflictException({
        message:
          locked.status === 'PAID'
            ? 'This payment has already been confirmed'
            : `A ${locked.status} payment cannot be confirmed`,
        code: locked.status === 'PAID' ? 'PAYMENT_ALREADY_CONFIRMED' : 'INVALID_TRANSITION',
      });
    }
    return locked;
  }

  private async applySettlement(
    tx: Prisma.TransactionClient,
    input: {
      paymentId: string;
      locked: { status: PaymentStatus; amount: Prisma.Decimal; billId: string; splitId: string | null };
      amountPaid: Prisma.Decimal;
      confirmedById: string | null;
      tenantId: string;
      branchId: string;
      detail: string;
    },
  ) {
    const { paymentId, locked, amountPaid, confirmedById, tenantId, branchId, detail } = input;

    const updated = await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: 'PAID',
        amountPaid,
        confirmedById,
        confirmedAt: new Date(),
      },
    });

    await tx.paymentAttempt.create({
      data: {
        paymentId,
        action: 'CONFIRM',
        actorId: confirmedById,
        result: 'SUCCESS',
        detail,
      },
    });

    const billRows = await tx.$queryRaw<Array<{ paidTotal: Prisma.Decimal; total: Prisma.Decimal }>>`
      UPDATE "Bill"
      SET "paidTotal" = "paidTotal" + ${locked.amount.toString()}::numeric,
          "updatedAt" = NOW()
      WHERE "id" = ${locked.billId}::uuid
        AND "paidTotal" + ${locked.amount.toString()}::numeric <= "total" + 0.001
      RETURNING "paidTotal", "total"
    `;
    const billRow = billRows[0];
    if (!billRow) {
      throw new ConflictException({
        message: 'This would overpay the bill',
        code: 'OVERPAYMENT',
      });
    }

    const fullyPaid = billRow.paidTotal.greaterThanOrEqualTo(billRow.total.minus(D('0.001')));
    const bill = await tx.bill.update({
      where: { id: locked.billId },
      data: {
        status: fullyPaid ? 'PAID' : 'PARTIALLY_PAID',
        ...(fullyPaid ? { paidAt: new Date() } : {}),
      },
      include: { tableSession: true },
    });

    // A payment taken against a split settles that share, so the POS and the
    // printed check can show which parts of the bill are still open.
    if (locked.splitId) {
      await tx.billSplit.updateMany({
        where: { id: locked.splitId, billId: locked.billId, status: { not: 'PAID' } },
        data: { status: 'PAID', paidAt: new Date() },
      });
    }

    if (fullyPaid) {
      await tx.tableSession.update({
        where: { id: bill.tableSessionId },
        data: { status: 'PAYMENT_PENDING' },
      });
      await tx.diningTable.update({
        where: { id: bill.tableSession.tableId },
        data: { status: 'PAYMENT_PENDING' },
      });
    }

    await this.outbox.append(tx, {
      tenantId,
      branchId,
      eventType: 'payment.updated',
      aggregateType: 'Payment',
      aggregateId: paymentId,
      payload: {
        paymentId,
        billId: locked.billId,
        status: 'PAID',
        amount: moneyString(locked.amount),
        billStatus: bill.status,
      },
    });

    return { payment: updated, bill, fullyPaid };
  }

  /**
   * Confirms a payment from a verified provider webhook. No staff member is
   * involved, so `confirmedById` stays null and the audit entry is SYSTEM.
   */
  async confirmFromProvider(input: {
    provider: string;
    reference: string;
    amount?: string;
    eventId: string;
  }) {
    const payment = await this.prisma.payment.findUnique({ where: { reference: input.reference } });
    if (!payment) {
      throw new NotFoundException({
        message: 'Unknown payment reference',
        code: 'PAYMENT_NOT_FOUND',
      });
    }
    if (payment.status === 'PAID') {
      return { status: 'already-paid' as const, paymentId: payment.id };
    }
    if (!['PENDING', 'AWAITING_CONFIRMATION'].includes(payment.status)) {
      throw new ConflictException({
        message: `A ${payment.status} payment cannot be confirmed`,
        code: 'INVALID_TRANSITION',
      });
    }

    const amountPaid = input.amount ? D(input.amount) : payment.amount;
    if (amountPaid.lessThan(payment.amount)) {
      throw new BadRequestException({
        message: 'The provider reported less than the payment amount',
        code: 'PROVIDER_UNDERPAYMENT',
        details: { required: moneyString(payment.amount), reported: moneyString(amountPaid) },
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockPayment(tx, payment.id);
      return this.applySettlement(tx, {
        paymentId: payment.id,
        locked,
        amountPaid,
        confirmedById: null,
        tenantId: payment.tenantId,
        branchId: payment.branchId,
        detail: `Confirmed by ${input.provider} event ${input.eventId}`,
      });
    });

    await this.audit.record(
      {
        tenantId: payment.tenantId,
        branchId: payment.branchId,
        actorType: 'SYSTEM',
        action: 'payment.confirmed',
        resourceType: 'Payment',
        resourceId: payment.id,
        after: {
          provider: input.provider,
          eventId: input.eventId,
          amount: moneyString(payment.amount),
          amountPaid: moneyString(amountPaid),
          billStatus: result.bill.status,
        },
      },
      this.prisma,
    );

    return {
      status: 'confirmed' as const,
      paymentId: payment.id,
      billId: result.bill.id,
      billStatus: result.bill.status,
      fullyPaid: result.fullyPaid,
    };
  }

  async expirePayment(principal: StaffPrincipal, paymentId: string, actor: ActorMeta) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.tenantId !== principal.tenantId) {
      throw new NotFoundException({ message: 'Payment not found', code: 'NOT_FOUND' });
    }
    await this.branches.load(principal, payment.branchId);

    const expired = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ status: PaymentStatus }>>`
        SELECT "status" FROM "Payment" WHERE "id" = ${paymentId}::uuid FOR UPDATE
      `;
      const current = rows[0];
      if (!current) throw new NotFoundException({ message: 'Payment not found', code: 'NOT_FOUND' });
      if (!canTransition(PAYMENT_TRANSITIONS, current.status, 'EXPIRED')) {
        throw new ConflictException({ message: 'Payment cannot be expired', code: 'INVALID_TRANSITION' });
      }
      if (payment.expiresAt && payment.expiresAt.getTime() > Date.now()) {
        throw new ConflictException({
          message: 'Payment has not expired yet',
          code: 'PAYMENT_NOT_EXPIRED',
          details: { expiresAt: payment.expiresAt },
        });
      }
      return tx.payment.update({ where: { id: paymentId }, data: { status: 'EXPIRED' } });
    });

    await this.audit.record(
      {
        tenantId: principal.tenantId,
        branchId: payment.branchId,
        actorId: principal.userId,
        action: 'payment.expired',
        resourceType: 'Payment',
        resourceId: paymentId,
        requestId: actor.requestId,
      },
      this.prisma,
    );
    return this.serialize(expired);
  }

  async refund(principal: StaffPrincipal, paymentId: string, dto: RefundDto, actor: ActorMeta) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { refunds: true, bill: true },
    });
    if (!payment || payment.tenantId !== principal.tenantId) {
      throw new NotFoundException({ message: 'Payment not found', code: 'NOT_FOUND' });
    }
    await this.branches.load(principal, payment.branchId);
    if (!['PAID', 'PARTIALLY_REFUNDED'].includes(payment.status)) {
      throw new ConflictException({
        message: 'Only a paid payment can be refunded',
        code: 'PAYMENT_NOT_REFUNDABLE',
      });
    }

    const refunded = payment.refunds.reduce((acc, refund) => acc.plus(refund.amount), D(0));
    const remaining = payment.amountPaid.minus(refunded);
    const amount = D(dto.amount);
    if (amount.greaterThan(remaining)) {
      throw new BadRequestException({
        message: 'Refund exceeds the refundable amount',
        code: 'REFUND_EXCEEDS_AMOUNT',
        details: { remaining: moneyString(remaining) },
      });
    }

    const reference = `RFD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomCode(8)}`;
    const result = await this.prisma.$transaction(async (tx) => {
      const created = await tx.refund.create({
        data: {
          paymentId,
          amount,
          reason: dto.reason,
          authorizedById: principal.userId,
          reference,
        },
      });
      const totalRefunded = refunded.plus(amount);
      const fullyRefunded = totalRefunded.greaterThanOrEqualTo(payment.amountPaid);
      const updated = await tx.payment.update({
        where: { id: paymentId },
        data: { status: fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
      });
      await tx.bill.update({
        where: { id: payment.billId },
        data: { status: fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
      });
      if (payment.splitId && fullyRefunded) {
        await tx.billSplit.updateMany({
          where: { id: payment.splitId, billId: payment.billId },
          data: { status: 'OPEN', paidAt: null },
        });
      }
      await tx.paymentAttempt.create({
        data: {
          paymentId,
          action: 'REFUND',
          actorId: principal.userId,
          result: 'SUCCESS',
          detail: `Refunded ${moneyString(amount)}: ${dto.reason}`,
        },
      });
      await this.outbox.append(tx, {
        tenantId: principal.tenantId,
        branchId: payment.branchId,
        eventType: 'payment.updated',
        aggregateType: 'Payment',
        aggregateId: paymentId,
        payload: {
          paymentId,
          billId: payment.billId,
          status: updated.status,
          refunded: moneyString(amount),
          // Recording a refund does not move money. Staff must complete the
          // transfer in their bank or PSP separately.
          moneyMoved: false,
        },
      });
      return { updated, created, fullyRefunded };
    });

    await this.audit.record(
      {
        tenantId: principal.tenantId,
        branchId: payment.branchId,
        actorId: principal.userId,
        action: 'payment.refunded',
        resourceType: 'Payment',
        resourceId: paymentId,
        after: { amount: moneyString(amount), reference, fullyRefunded: result.fullyRefunded },
        reason: dto.reason,
        requestId: actor.requestId,
      },
      this.prisma,
    );

    return {
      ...this.serialize(result.updated),
      refund: {
        id: result.created.id,
        amount: moneyString(result.created.amount),
        reference,
        // The application records the refund; it does not execute it.
        fundsReturned: false,
      },
    };
  }

  async getPayment(principal: StaffPrincipal, paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { refunds: true, attempts: { orderBy: { createdAt: 'asc' } }, bill: true },
    });
    if (!payment || payment.tenantId !== principal.tenantId) {
      throw new NotFoundException({ message: 'Payment not found', code: 'NOT_FOUND' });
    }
    await this.branches.load(principal, payment.branchId);
    return {
      ...this.serialize(payment),
      bill: { id: payment.bill.id, number: payment.bill.number, status: payment.bill.status },
      attempts: payment.attempts.map((attempt) => ({
        id: attempt.id,
        action: attempt.action,
        result: attempt.result,
        detail: attempt.detail,
        createdAt: attempt.createdAt,
      })),
      refunds: payment.refunds.map((refund) => ({
        id: refund.id,
        amount: moneyString(refund.amount),
        reason: refund.reason,
        reference: refund.reference,
        createdAt: refund.createdAt,
      })),
    };
  }

  async qrImage(principal: StaffPrincipal, paymentId: string): Promise<Buffer> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.tenantId !== principal.tenantId) {
      throw new NotFoundException({ message: 'Payment not found', code: 'NOT_FOUND' });
    }
    await this.branches.load(principal, payment.branchId);
    if (!payment.promptPayPayload) {
      throw new BadRequestException({ message: 'No PromptPay QR for this payment', code: 'NO_QR' });
    }
    return QRCode.toBuffer(payment.promptPayPayload, {
      width: 1024,
      margin: 2,
      color: { dark: '#111111', light: '#FFFFFF' },
    });
  }

  private serialize(payment: {
    id: string;
    reference: string;
    method: string;
    status: string;
    amount: Prisma.Decimal;
    amountPaid: Prisma.Decimal;
    currency: string;
    provider: string | null;
    promptPayPayload: string | null;
    expiresAt: Date | null;
    confirmedAt: Date | null;
    createdAt: Date;
    billId: string;
  }) {
    return {
      id: payment.id,
      reference: payment.reference,
      billId: payment.billId,
      method: payment.method,
      status: payment.status,
      amount: moneyString(payment.amount),
      amountPaid: moneyString(payment.amountPaid),
      currency: payment.currency,
      provider: payment.provider,
      promptPayPayload: payment.promptPayPayload,
      expiresAt: payment.expiresAt,
      confirmedAt: payment.confirmedAt,
      createdAt: payment.createdAt,
    };
  }
}
