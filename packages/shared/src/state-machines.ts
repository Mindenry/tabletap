/**
 * Domain state machines.
 *
 * Every transition is declared once here so that the API, the UI and the tests
 * cannot drift apart. The API still re-validates inside a transaction; these
 * helpers are a guard, not the transaction itself.
 */

export const ORDER_STATUSES = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'CANCELLED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_ITEM_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'SERVED',
  'CANCELLED',
] as const;
export type OrderItemStatus = (typeof ORDER_ITEM_STATUSES)[number];

export const KITCHEN_TICKET_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'SERVED',
  'REJECTED',
] as const;
export type KitchenTicketStatus = (typeof KITCHEN_TICKET_STATUSES)[number];

export const BILL_STATUSES = [
  'DRAFT',
  'OPEN',
  'PARTIALLY_PAID',
  'PAID',
  'CANCELLED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
] as const;
export type BillStatus = (typeof BILL_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'PENDING',
  'AWAITING_CONFIRMATION',
  'PAID',
  'EXPIRED',
  'FAILED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const TABLE_STATUSES = [
  'AVAILABLE',
  'OCCUPIED',
  'ORDERING',
  'BILL_REQUESTED',
  'PAYMENT_PENDING',
  'CLEANING',
] as const;
export type TableStatus = (typeof TABLE_STATUSES)[number];

export const TABLE_SESSION_STATUSES = [
  'OPEN',
  'BILL_REQUESTED',
  'PAYMENT_PENDING',
  'CLOSED',
  'ABANDONED',
] as const;
export type TableSessionStatus = (typeof TABLE_SESSION_STATUSES)[number];

export const TABLE_REQUEST_STATUSES = [
  'OPEN',
  'ACKNOWLEDGED',
  'IN_PROGRESS',
  'RESOLVED',
  'CANCELLED',
] as const;
export type TableRequestStatus = (typeof TABLE_REQUEST_STATUSES)[number];

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['SERVED'],
  SERVED: [],
  CANCELLED: [],
};

export const ORDER_ITEM_TRANSITIONS: Record<OrderItemStatus, OrderItemStatus[]> = {
  PENDING: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['SERVED'],
  SERVED: [],
  CANCELLED: [],
};

export const KITCHEN_TICKET_TRANSITIONS: Record<KitchenTicketStatus, KitchenTicketStatus[]> = {
  PENDING: ['ACCEPTED', 'REJECTED'],
  ACCEPTED: ['PREPARING', 'REJECTED'],
  PREPARING: ['READY', 'REJECTED'],
  READY: ['SERVED'],
  SERVED: [],
  REJECTED: ['PENDING'], // reopen requires kitchen.update plus a reason
};

export const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  PENDING: ['AWAITING_CONFIRMATION', 'PAID', 'EXPIRED', 'FAILED'],
  AWAITING_CONFIRMATION: ['PAID', 'FAILED', 'EXPIRED'],
  PAID: ['REFUNDED', 'PARTIALLY_REFUNDED'],
  EXPIRED: [],
  FAILED: [],
  REFUNDED: [],
  PARTIALLY_REFUNDED: ['REFUNDED'],
};

export const BILL_TRANSITIONS: Record<BillStatus, BillStatus[]> = {
  DRAFT: ['OPEN', 'CANCELLED'],
  OPEN: ['PARTIALLY_PAID', 'PAID', 'CANCELLED'],
  PARTIALLY_PAID: ['PAID', 'PARTIALLY_REFUNDED', 'CANCELLED'],
  PAID: ['REFUNDED', 'PARTIALLY_REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
  PARTIALLY_REFUNDED: ['REFUNDED'],
};

export const TABLE_SESSION_TRANSITIONS: Record<TableSessionStatus, TableSessionStatus[]> = {
  OPEN: ['BILL_REQUESTED', 'PAYMENT_PENDING', 'CLOSED', 'ABANDONED'],
  BILL_REQUESTED: ['PAYMENT_PENDING', 'OPEN', 'CLOSED'],
  PAYMENT_PENDING: ['CLOSED', 'BILL_REQUESTED'],
  CLOSED: [],
  ABANDONED: [],
};

export const TABLE_REQUEST_TRANSITIONS: Record<TableRequestStatus, TableRequestStatus[]> = {
  OPEN: ['ACKNOWLEDGED', 'RESOLVED', 'CANCELLED'],
  ACKNOWLEDGED: ['IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
  IN_PROGRESS: ['RESOLVED', 'CANCELLED'],
  RESOLVED: [],
  CANCELLED: [],
};

export function canTransition<S extends string>(machine: Record<S, S[]>, from: S, to: S): boolean {
  return machine[from]?.includes(to) ?? false;
}

/** A cancellation is only allowed while the kitchen has not started cooking. */
export function canCancelOrder(status: OrderStatus): boolean {
  return status === 'PENDING' || status === 'ACCEPTED' || status === 'PREPARING';
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, { en: string; th: string }> = {
  PENDING: { en: 'Received', th: 'รับออเดอร์แล้ว' },
  ACCEPTED: { en: 'Accepted', th: 'ครัวรับแล้ว' },
  PREPARING: { en: 'Preparing', th: 'กำลังทำ' },
  READY: { en: 'Ready', th: 'พร้อมเสิร์ฟ' },
  SERVED: { en: 'Served', th: 'เสิร์ฟแล้ว' },
  CANCELLED: { en: 'Cancelled', th: 'ยกเลิก' },
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, { en: string; th: string }> = {
  PENDING: { en: 'Pending', th: 'รอชำระ' },
  AWAITING_CONFIRMATION: { en: 'Awaiting confirmation', th: 'รอยืนยัน' },
  PAID: { en: 'Paid', th: 'ชำระแล้ว' },
  EXPIRED: { en: 'Expired', th: 'หมดอายุ' },
  FAILED: { en: 'Failed', th: 'ล้มเหลว' },
  REFUNDED: { en: 'Refunded', th: 'คืนเงินแล้ว' },
  PARTIALLY_REFUNDED: { en: 'Partially refunded', th: 'คืนเงินบางส่วน' },
};
