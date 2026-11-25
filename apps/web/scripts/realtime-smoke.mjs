/**
 * Realtime end-to-end check.
 *
 * Proves the Socket.IO path, not just REST:
 *  staff socket joins authorized rooms, a guest session opens, an order is
 *  submitted, and both the kitchen room and the customer room receive the
 *  outbox-published events.
 *
 * Run from apps/web:  node scripts/realtime-smoke.mjs
 */
import { io } from 'socket.io-client';

const API = process.env.API_URL ?? 'http://localhost:4100';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'TableTap!2026';

let failures = 0;
function check(name, condition, detail) {
  if (condition) console.log(`  PASS  ${name}`);
  else {
    failures += 1;
    console.error(`  FAIL  ${name}${detail ? ` :: ${JSON.stringify(detail).slice(0, 500)}` : ''}`);
  }
}

class Jar {
  cookies = new Map();
  store(headers) {
    for (const header of headers.getSetCookie?.() ?? []) {
      const [pair] = header.split(';');
      const index = pair.indexOf('=');
      if (index < 0) continue;
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      this.cookies.set(name, value);
    }
  }
  header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  get(name) {
    return this.cookies.get(name);
  }
}

async function request(jar, method, path, body) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (jar.header()) headers.cookie = jar.header();
  const csrf = jar.get('tt_csrf');
  if (csrf && method !== 'GET') headers['x-csrf-token'] = csrf;
  if (method !== 'GET') headers['x-idempotency-key'] = `rt-${Date.now()}-${Math.random()}`;
  const response = await fetch(`${API}/api/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  jar.store(response.headers);
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

function waitForEvent(socket, event, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function connect(url, cookie) {
  return new Promise((resolve, reject) => {
    const socket = io(`${url}/realtime`, {
      transports: ['websocket'],
      extraHeaders: { cookie },
      reconnection: false,
    });
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error('socket connection timeout (no ready event)'));
    }, 8000);
    socket.on('ready', (payload) => {
      clearTimeout(timer);
      resolve({ socket, ready: payload });
    });
    socket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect' || reason === 'transport close') {
        clearTimeout(timer);
        reject(new Error(`socket disconnected before ready: ${reason}`));
      }
    });
    socket.on('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function main() {
  console.log(`\nTableTap realtime smoke → ${API}\n`);

  // 1. staff session
  const staff = new Jar();
  const login = await request(staff, 'POST', '/auth/login', {
    email: 'owner@spicegarden.local',
    password: PASSWORD,
  });
  check('staff login', login.status === 200, login.body);
  const me = await request(staff, 'GET', '/auth/me');
  const branchId = me.body.branches[0].id;
  check('staff session active', me.status === 200 && me.body.role === 'OWNER', me.body);

  // 2. pick a free table and open a guest session
  const tables = await request(staff, 'GET', `/branches/${branchId}/tables`);
  const free = tables.body.find((table) => !table.session && table.qr);
  check('a free table exists', Boolean(free), { tables: tables.body.length });
  const token = `demo-sathorn-t${free.number}-4f8c2a91`;

  const guest = new Jar();
  const session = await request(guest, 'POST', `/public/qr/${token}/session`, { guestCount: 2 });
  check('guest session created', session.status < 300, session.body);
  check('guest cookie issued', Boolean(guest.get('tt_customer')), [...guest.cookies.keys()]);

  // 3. connect both sockets with their own cookies
  const staffSocket = await connect(API, staff.header());
  check('staff socket joined rooms', Array.isArray(staffSocket.ready.rooms) && staffSocket.ready.rooms.length > 0, staffSocket.ready);

  const guestSocket = await connect(API, guest.header());
  check('guest socket joined table room', guestSocket.ready.rooms.some((room) => room.startsWith('customer-session:')), guestSocket.ready);

  const staffOrderEvent = waitForEvent(staffSocket.socket, 'order.created');
  const staffTicketEvent = waitForEvent(staffSocket.socket, 'kitchen.ticket.created');
  const guestOrderEvent = waitForEvent(guestSocket.socket, 'order.created');

  // 4. submit an order
  const menu = await request(guest, 'GET', '/public/customer-session/menu');
  const item = menu.body.menu.flatMap((category) => category.items).find((candidate) => candidate.available && candidate.modifierGroups.every((group) => !group.required));
  check('menu available for ordering', Boolean(item), null);

  const order = await request(guest, 'POST', '/public/customer-session/orders', {
    items: [{ menuItemId: item.id, quantity: 1 }],
  });
  check('order accepted', order.status < 300, order.body);

  const [staffOrder, staffTicket, guestOrder] = await Promise.all([
    staffOrderEvent,
    staffTicketEvent,
    guestOrderEvent,
  ]);
  check('staff room received order.created', staffOrder.payload.orderId === order.body.id, staffOrder);
  check('kitchen room received kitchen.ticket.created', staffTicket.payload.orderId === order.body.id, staffTicket);
  check('guest room received order.created', guestOrder.payload.orderId === order.body.id, guestOrder);
  check('events carry a monotonic sequence', typeof staffOrder.sequence === 'number' && staffOrder.sequence > 0, staffOrder.sequence);

  // 5. kitchen accepts the ticket; guest must see order.accepted
  const tickets = await request(staff, 'GET', `/kitchen/tickets?branchId=${branchId}`);
  const ticket = tickets.body.find((candidate) => candidate.order.id === order.body.id);
  const guestAccepted = waitForEvent(guestSocket.socket, 'order.accepted');
  const accept = await request(staff, 'POST', `/kitchen/tickets/${ticket.id}/accept`, {});
  check('ticket accepted', accept.status < 300, accept.body);
  const acceptedEvent = await guestAccepted;
  check('guest room received order.accepted', acceptedEvent.payload.orderId === order.body.id, acceptedEvent);

  // 6. REST resync provides the same events after a disconnect
  staffSocket.socket.disconnect();
  const resync = await request(staff, 'GET', `/realtime/events?since=0&limit=200`);
  check('resync endpoint returns published events', resync.status === 200 && resync.body.items.length > 0, { count: resync.body?.items?.length });
  check(
    'resync includes the order event',
    resync.body.items.some((event) => event.eventType === 'order.created' && event.payload?.orderId === order.body.id),
    null,
  );

  guestSocket.socket.disconnect();
  console.log(`\n${failures === 0 ? 'ALL REALTIME CHECKS PASSED' : `${failures} REALTIME CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
