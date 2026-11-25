import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

/**
 * TableTap load profile (provided, not executed in the delivery environment).
 *
 *   k6 run tests/load/menu-and-order.js
 *
 * Environment:
 *   BASE_URL   default http://localhost:4100
 *   QR_TOKEN   a seeded table QR token
 *
 * It reads the menu and submits small orders with an idempotency key per
 * iteration. Run against a disposable database: it creates real orders.
 */

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4100';
const QR_TOKEN = __ENV.QR_TOKEN || 'demo-sathorn-t10-4f8c2a91';

const menuLatency = new Trend('menu_latency');
const orderLatency = new Trend('order_latency');
const orderFailures = new Rate('order_failures');

export const options = {
  scenarios: {
    guests: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '30s', target: 20 },
        { duration: '1m', target: 20 },
        { duration: '20s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    menu_latency: ['p(95)<800'],
    order_latency: ['p(95)<1500'],
    order_failures: ['rate<0.02'],
  },
};

export default function () {
  const menuResponse = http.get(`${BASE_URL}/api/v1/public/qr/${QR_TOKEN}`);
  menuLatency.add(menuResponse.timings.duration);
  check(menuResponse, { 'menu 200': (r) => r.status === 200 });

  if (menuResponse.status !== 200) {
    sleep(1);
    return;
  }

  const menu = menuResponse.json();
  const item = menu.menu.flatMap((category) => category.items).find((candidate) => candidate.available);
  if (!item) {
    sleep(1);
    return;
  }

  const session = http.post(`${BASE_URL}/api/v1/public/qr/${QR_TOKEN}/session`, JSON.stringify({}), {
    headers: { 'Content-Type': 'application/json' },
  });
  check(session, { 'session created': (r) => r.status === 200 || r.status === 201 });

  const jar = session.cookies;
  const csrf = jar.tt_csrf ? jar.tt_csrf[0].value : '';
  const order = http.post(
    `${BASE_URL}/api/v1/public/customer-session/orders`,
    JSON.stringify({ items: [{ menuItemId: item.id, quantity: 1 }] }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': `k6-${__VU}-${__ITER}-${Date.now()}`,
        'X-CSRF-Token': csrf,
      },
      cookies: jar,
    },
  );
  orderLatency.add(order.timings.duration);
  orderFailures.add(order.status >= 400);
  check(order, { 'order accepted': (r) => r.status === 200 || r.status === 201 });

  sleep(1);
}
