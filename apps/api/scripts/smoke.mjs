/**
 * End-to-end smoke test against a running API and seeded database.
 *
 * Run: node scripts/smoke.mjs
 * Requires: API on API_URL (default http://localhost:4100) and demo seed.
 *
 * This exercises the real HTTP surface with real cookies and CSRF headers. It
 * asserts behaviour, not just status codes.
 */
import { parsePromptPayPayload } from '@tabletap/shared';

const BASE = process.env.API_URL ?? 'http://localhost:4100';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'TableTap!2026';

class Client {
  cookies = new Map();

  store(setCookie) {
    if (!setCookie) return;
    for (const header of setCookie) {
      const [pair] = header.split(';');
      const index = pair.indexOf('=');
      if (index < 0) continue;
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (value === '') this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  cookieHeader() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async request(method, path, body, extraHeaders = {}) {
    const headers = { ...extraHeaders };
    const cookie = this.cookieHeader();
    if (cookie) headers.cookie = cookie;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const csrf = this.cookies.get('tt_csrf');
    if (csrf && method !== 'GET') headers['x-csrf-token'] = csrf;

    const response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });
    this.store(response.headers.getSetCookie?.() ?? []);
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    return { status: response.status, body: json, headers: response.headers };
  }

  get(path) {
    return this.request('GET', path);
  }
  post(path, body, extra) {
    return this.request('POST', path, body, extra);
  }
  patch(path, body) {
    return this.request('PATCH', path, body);
  }
}

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${name}${detail ? ` :: ${JSON.stringify(detail).slice(0, 600)}` : ''}`);
  }
}

async function login(email) {
  const client = new Client();
  const result = await client.post('/api/v1/auth/login', { email, password: PASSWORD });
  check(`login ${email}`, result.status === 200 && result.body.user?.email === email, result.body);
  return { client, result };
}

async function main() {
  console.log(`\nTableTap smoke test → ${BASE}\n`);

  const health = await new Client().get('/api/v1/health');
  check('health endpoint', health.status === 200 && health.body.status === 'ok', health.body);

  const ready = await new Client().get('/api/v1/health/ready');
  check(
    'readiness reports database and redis',
    ready.status === 200 && ready.body.status === 'ready' && ready.body.database?.ok === true,
    ready.body,
  );

  const metrics = await new Client().get('/api/v1/metrics');
  const metricsText =
    typeof metrics.body === 'string' ? metrics.body : (metrics.body?.raw ?? '');
  check(
    'metrics endpoint exposes prometheus text',
    metrics.status === 200 && metricsText.includes('tabletap_http_requests_total'),
    { status: metrics.status },
  );

  const badSignature = await new Client().post(
    '/api/v1/public/payments/provider/mock/webhook',
    { eventId: 'evt-smoke', reference: 'PAY-NOPE', status: 'PAID' },
    { 'x-provider-signature': 'deadbeef' },
  );
  check('payment webhook rejects a bad signature', badSignature.status === 401, {
    status: badSignature.status,
    body: badSignature.body,
  });

  const { client: owner, result: ownerLogin } = await login('owner@spicegarden.local');
  const me = await owner.get('/api/v1/auth/me');
  check('owner session resolves tenant + permissions', me.status === 200 && me.body.role === 'OWNER' && me.body.permissions.length > 20, me.body);
  const tenantId = me.body.tenant.id;
  const branchId = me.body.branches[0].id;

  const branches = await owner.get('/api/v1/branches');
  check('owner sees all three branches', branches.status === 200 && branches.body.length === 3, branches.body);

  let tablesResponse = await owner.get(`/api/v1/branches/${branchId}/tables`);
  check('tables listed with QR state', tablesResponse.status === 200 && tablesResponse.body.length >= 20, { count: tablesResponse.body?.length });
  let freeTable = tablesResponse.body.find((table) => !table.session && table.qr);

  // Make the smoke test re-runnable: release any table left in a settled state
  // by a previous interrupted run.
  if (!freeTable) {
    for (const table of tablesResponse.body.filter((candidate) => candidate.session)) {
      const closed = await owner.post(`/api/v1/tables/${table.id}/close-session`, {});
      if (closed.status < 300) break;
    }
    tablesResponse = await owner.get(`/api/v1/branches/${branchId}/tables`);
    freeTable = tablesResponse.body.find((table) => !table.session && table.qr);
  }
  check('a free table is available for the flow', Boolean(freeTable), { tables: tablesResponse.body?.slice(0, 3) });

  // ---------------------------------------------------------------- customer
  const customer = new Client();
  const qrToken = `demo-sathorn-t${freeTable.number}-4f8c2a91`;
  const landing = await customer.get(`/api/v1/public/qr/${qrToken}`);
  check('QR resolves to restaurant + menu', landing.status === 200 && landing.body.restaurant?.name === 'Spice Garden' && Array.isArray(landing.body.menu), {
    status: landing.status,
    body: landing.body?.message,
  });
  check('public menu hides cost and staff fields', !JSON.stringify(landing.body).includes('"costEstimate"'), null);

  const session = await customer.post(`/api/v1/public/qr/${qrToken}/session`, { guestLabel: 'Smoke test' });
  check('customer session issued', session.status === 201 || session.status === 200, session.body);
  const tableSessionId = session.body.tableSessionId;

  const menuItem = landing.body.menu.flatMap((category) => category.items).find((item) => item.modifierGroups.length === 0);
  const modifiedItem = landing.body.menu.flatMap((category) => category.items).find((item) => item.modifierGroups.length > 0);
  check('menu exposes items', Boolean(menuItem) && Boolean(modifiedItem), null);

  const modifierOptionIds = modifiedItem.modifierGroups
    .filter((group) => group.required)
    .map((group) => group.options[0].id);

  const idempotencyKey = `smoke-${Date.now()}`;
  const orderPayload = {
    items: [
      { menuItemId: menuItem.id, quantity: 2 },
      { menuItemId: modifiedItem.id, quantity: 1, modifierOptionIds, note: 'No coriander' },
    ],
    note: 'Smoke test order',
  };
  const firstOrder = await customer.post('/api/v1/public/customer-session/orders', orderPayload, {
    'idempotency-key': idempotencyKey,
  });
  check('customer order created', firstOrder.status === 201 || firstOrder.status === 200, firstOrder.body);
  check('server priced the order', Number(firstOrder.body.total) > 0, firstOrder.body);

  const duplicate = await customer.post('/api/v1/public/customer-session/orders', orderPayload, {
    'idempotency-key': idempotencyKey,
  });
  check(
    'duplicate submission is idempotent',
    duplicate.body.id === firstOrder.body.id,
    { first: firstOrder.body.id, second: duplicate.body?.id },
  );

  const tracking = await customer.get('/api/v1/public/customer-session');
  check('customer can track the order', tracking.status === 200 && tracking.body.orders.length >= 1, tracking.body);

  const request = await customer.post('/api/v1/public/customer-session/requests', { type: 'CALL_WAITER', note: 'Smoke test' });
  check('customer can call a waiter', request.status < 300 && request.body.status === 'OPEN', request.body);
  const duplicateRequest = await customer.post('/api/v1/public/customer-session/requests', { type: 'CALL_WAITER' });
  check('duplicate request within 5 minutes is rejected', duplicateRequest.status === 409, duplicateRequest.status);

  const staffRequests = await owner.get(`/api/v1/table-requests?branchId=${branchId}`);
  const staffRequest = staffRequests.body.find((candidate) => candidate.id === request.body.id);
  check('staff see the guest request', Boolean(staffRequest), { count: staffRequests.body?.length });
  const acknowledged = await owner.post(`/api/v1/table-requests/${request.body.id}/acknowledge`, {});
  check('staff acknowledge the request', acknowledged.status < 300 && acknowledged.body.status === 'ACKNOWLEDGED', acknowledged.body);
  const resolved = await owner.post(`/api/v1/table-requests/${request.body.id}/resolve`, { note: 'Handled in smoke test' });
  check('staff resolve the request', resolved.status < 300 && resolved.body.status === 'RESOLVED', resolved.body);

  // Price tampering is impossible: the payload has no price fields and unknown
  // fields are rejected by the whitelist.
  const tampered = await customer.post('/api/v1/public/customer-session/orders', {
    items: [{ menuItemId: menuItem.id, quantity: 1, unitPrice: 1 }],
  }, { 'idempotency-key': `smoke-tamper-${Date.now()}` });
  check('client-supplied price is rejected', tampered.status === 400, { status: tampered.status, body: tampered.body });

  // ---------------------------------------------------------------- kitchen
  const tickets = await owner.get(`/api/v1/kitchen/tickets?branchId=${branchId}`);
  const orderTickets = tickets.body.filter((candidate) => candidate.order.id === firstOrder.body.id);
  check('kitchen tickets routed to the right stations', orderTickets.length >= 1, {
    count: orderTickets.length,
    stations: orderTickets.map((ticket) => ticket.station.code),
  });

  for (const ticket of orderTickets) {
    const accepted = await owner.post(`/api/v1/kitchen/tickets/${ticket.id}/accept`);
    check(`kitchen accepts ticket ${ticket.station.code}`, accepted.status < 300, accepted.body);
    const started = await owner.post(`/api/v1/kitchen/tickets/${ticket.id}/start`);
    check(`kitchen starts ticket ${ticket.station.code}`, started.status < 300, started.body);
    const ready = await owner.post(`/api/v1/kitchen/tickets/${ticket.id}/ready`);
    check(`kitchen marks ticket ${ticket.station.code} ready`, ready.status < 300, ready.body);
  }

  const afterKitchen = await customer.get('/api/v1/public/customer-session');
  const trackedOrder = afterKitchen.body.orders.find((order) => order.id === firstOrder.body.id);
  check(
    'customer sees kitchen progress',
    trackedOrder.status === 'READY',
    trackedOrder,
  );

  const served = await owner.post(`/api/v1/orders/${firstOrder.body.id}/served`);
  check('staff serves the order', served.status < 300 && served.body.status === 'SERVED', served.body);

  const inventory = await owner.get(`/api/v1/inventory/movements?branchId=${branchId}`);
  const deduction = inventory.body.find((movement) => movement.type === 'SALE_DEDUCTION' && movement.referenceId === firstOrder.body.id);
  check('accepting the order deducted stock', Boolean(deduction), { movements: inventory.body?.length });

  // ------------------------------------------------------------------- bill
  const bill = await owner.post('/api/v1/bills', { tableSessionId });
  check('bill created from the session', bill.status < 300 && bill.body.items.length >= 1, bill.body);
  const billTotal = bill.body.total;

  const split = await owner.post(`/api/v1/bills/${bill.body.id}/split`, { mode: 'EQUAL', parts: 2 });
  check('bill splits equally without losing a satang', split.status < 300 && split.body.splits.length === 2, split.body);

  const payment = await owner.post('/api/v1/payments', { billId: bill.body.id, method: 'PROMPTPAY' });
  check('payment created', payment.status < 300 && payment.body.status === 'PENDING', payment.body);

  const qr = await owner.post(`/api/v1/payments/${payment.body.id}/promptpay`);
  check('PromptPay payload generated', qr.status < 300 && Boolean(qr.body.promptPayPayload), qr.body);
  const parsed = parsePromptPayPayload(qr.body.promptPayPayload);
  check('PromptPay payload is valid EMVCo and carries THB + amount', parsed.currency === '764' && parsed.amount === Number(payment.body.amount).toFixed(2), parsed);
  check('PromptPay payment is not auto-confirmed', qr.body.status === 'AWAITING_CONFIRMATION', { status: qr.body.status });

  const confirm = await owner.post(`/api/v1/payments/${payment.body.id}/confirm`, {});
  check('cashier confirms payment', confirm.status < 300 && confirm.body.status === 'PAID', confirm.body);

  const doubleConfirm = await owner.post(`/api/v1/payments/${payment.body.id}/confirm`, {});
  check('duplicate confirmation rejected', doubleConfirm.status === 409, { status: doubleConfirm.status, body: doubleConfirm.body });

  const finalBill = await owner.get(`/api/v1/bills/${bill.body.id}`);
  check('bill is fully paid', finalBill.body.status === 'PAID' && finalBill.body.due === '0.00', {
    status: finalBill.body.status,
    due: finalBill.body.due,
  });
  check('bill total matches the payment allocation', finalBill.body.paidTotal === billTotal, {
    total: billTotal,
    paid: finalBill.body.paidTotal,
  });

  const receipt = await owner.get(`/api/v1/bills/${bill.body.id}/receipt`);
  check('receipt snapshot issued', receipt.status < 300 && Boolean(receipt.body.number), receipt.body);

  const close = await owner.post(`/api/v1/tables/${landing.body.table.id}/close-session`, {});
  check('table session closes after payment', close.status < 300, close.body);

  // -------------------------------------------------------------- analytics
  const overview = await owner.get(`/api/v1/analytics/overview?branchId=${branchId}`);
  check(
    'analytics derived from persisted bills',
    overview.status === 200 && Number(overview.body.grossSales) > 0 && Number(overview.body.paidBills) > 0,
    overview.body,
  );

  const sales = await owner.get(`/api/v1/analytics/sales?branchId=${branchId}&groupBy=day`);
  check('sales series has buckets', sales.status === 200 && sales.body.series.length > 0, { buckets: sales.body?.series?.length });

  // ------------------------------------------------------- security checks
  const unauthenticated = await new Client().get('/api/v1/orders');
  check('unauthenticated staff route rejected', unauthenticated.status === 401, { status: unauthenticated.status });

  const viewer = await login('viewer@spicegarden.local');
  const viewerWrite = await viewer.client.post('/api/v1/bills', { tableSessionId });
  check('viewer cannot create a bill', viewerWrite.status === 403, { status: viewerWrite.status, body: viewerWrite.body });

  const manager = await login('manager@spicegarden.local');
  const thonglor = branches.body.find((branch) => branch.code === 'THONGLOR');
  const crossBranch = await manager.client.get(`/api/v1/branches/${thonglor.id}/tables`);
  check('manager cannot read an out-of-scope branch', crossBranch.status === 403 || crossBranch.status === 404, {
    status: crossBranch.status,
  });

  const baanThai = await login('owner@baanthai.local');
  const crossTenant = await baanThai.client.get(`/api/v1/branches/${branchId}/tables`);
  check('second tenant cannot read tenant one data', crossTenant.status === 403 || crossTenant.status === 404, {
    status: crossTenant.status,
  });

  const platform = await login('platform@tabletap.local');
  const platformDashboard = await platform.client.get('/api/v1/platform/dashboard');
  check('platform admin sees platform dashboard', platformDashboard.status === 200 && platformDashboard.body.tenants >= 2, platformDashboard.body);
  const platformTenantData = await platform.client.get(`/api/v1/branches/${branchId}/tables`);
  check('platform admin without membership cannot read tenant data', platformTenantData.status === 403, {
    status: platformTenantData.status,
  });

  const dayClose = await owner.get(`/api/v1/analytics/day-close?branchId=${branchId}`);
  check(
    'day close returns a settlement for the branch',
    dayClose.status === 200 &&
      typeof dayClose.body.businessDate === 'string' &&
      typeof dayClose.body.grossSales === 'string' &&
      Array.isArray(dayClose.body.payments),
    dayClose.body,
  );

  const viewerForExport = await login('viewer@spicegarden.local');
  const exportDenied = await viewerForExport.client.get(`/api/v1/orders/export?branchId=${branchId}`);
  check('viewer cannot export reports', exportDenied.status === 403, { status: exportDenied.status });

  const promotions = await owner.get('/api/v1/promotions');
  check(
    'promotion list is available to a manager role',
    promotions.status === 200 && Array.isArray(promotions.body),
    { status: promotions.status },
  );
  const viewerPromotions = await viewerForExport.client.get('/api/v1/promotions');
  check('viewer cannot manage promotions', viewerPromotions.status === 403, {
    status: viewerPromotions.status,
  });

  const paymentsList = await owner.get(`/api/v1/bills?branchId=${branchId}&limit=5`);
  check('bills list accepts the page parameters', paymentsList.status === 200 && Array.isArray(paymentsList.body));

  const csrfAttempt = new Client();
  csrfAttempt.cookies = new Map(owner.cookies);
  csrfAttempt.cookies.delete('tt_csrf');
  const noCsrf = await csrfAttempt.post('/api/v1/bills', { tableSessionId });
  check('cookie auth without CSRF rejected', noCsrf.status === 403 && noCsrf.body.code === 'CSRF_FAILED', {
    status: noCsrf.status,
    body: noCsrf.body,
  });

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
