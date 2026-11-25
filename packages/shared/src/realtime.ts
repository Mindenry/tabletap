/**
 * Realtime contract shared by the API gateway and browser clients.
 *
 * Every event travels inside the same envelope and carries a monotonic
 * per-tenant sequence number. Clients dedupe by eventId and detect gaps by
 * sequence; on a gap they call the REST resync endpoint. PostgreSQL remains the
 * source of truth — a dropped socket can never lose an order.
 */

export const REALTIME_EVENTS = [
  'order.created',
  'order.accepted',
  'order.updated',
  'order.cancelled',
  'kitchen.ticket.created',
  'kitchen.ticket.updated',
  'kitchen.item.ready',
  'table.updated',
  'table.request.created',
  'table.request.updated',
  'bill.created',
  'payment.updated',
  'inventory.low_stock',
  'notification.created',
] as const;

export type RealtimeEventType = (typeof REALTIME_EVENTS)[number];

export interface RealtimeEnvelope<T = unknown> {
  eventId: string;
  eventType: RealtimeEventType;
  tenantId: string;
  branchId: string | null;
  aggregateType: string;
  aggregateId: string;
  sequence: number;
  occurredAt: string;
  payloadVersion: number;
  payload: T;
}

export type RoomName = string;

export function tenantRoom(tenantId: string): RoomName {
  return `tenant:${tenantId}`;
}
export function branchRoom(branchId: string): RoomName {
  return `branch:${branchId}`;
}
export function branchKitchenRoom(branchId: string, stationId: string): RoomName {
  return `branch:${branchId}:kitchen:${stationId}`;
}
export function branchTablesRoom(branchId: string): RoomName {
  return `branch:${branchId}:tables`;
}
export function customerSessionRoom(sessionId: string): RoomName {
  return `customer-session:${sessionId}`;
}

/**
 * Which rooms a staff connection may join. Branch-scoped rooms are only joined
 * for branches the membership is allowed to see.
 */
export function staffRooms(input: {
  tenantId: string;
  branchIds: string[];
  role: string;
  stationIds?: string[];
}): RoomName[] {
  const rooms: RoomName[] = [tenantRoom(input.tenantId)];
  for (const branchId of input.branchIds) {
    rooms.push(branchRoom(branchId));
    if (
      input.role === 'WAITER' ||
      input.role === 'CASHIER' ||
      input.role === 'MANAGER' ||
      input.role === 'OWNER'
    ) {
      rooms.push(branchTablesRoom(branchId));
    }
    if (input.role === 'KITCHEN' || input.role === 'MANAGER' || input.role === 'OWNER') {
      for (const stationId of input.stationIds ?? []) {
        rooms.push(branchKitchenRoom(branchId, stationId));
      }
    }
  }
  return rooms;
}

export const QUEUE_NAMES = {
  orderEvents: 'order-events',
  kitchenAlerts: 'kitchen-alerts',
  notifications: 'notifications',
  email: 'email',
  reports: 'reports',
  inventoryAlerts: 'inventory-alerts',
  paymentExpiration: 'payment-expiration',
  scheduledTasks: 'scheduled-tasks',
  cleanup: 'cleanup',
  exports: 'exports',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
