/**
 * Web smoke test: drives the Next.js app the way a browser does, through the
 * same-origin /api rewrite, and asserts that authenticated pages render real
 * server data.
 *
 * Run: node scripts/web-smoke.mjs
 * Requires API on 4100, web on 3100, and the demo seed.
 */
const WEB = process.env.WEB_URL ?? 'http://localhost:3100';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'TableTap!2026';

const jar = new Map();
let failures = 0;

function check(name, condition, detail) {
  if (condition) console.log(`  PASS  ${name}`);
  else {
    failures += 1;
    console.error(`  FAIL  ${name}${detail ? ` :: ${String(detail).slice(0, 400)}` : ''}`);
  }
}

function store(headers) {
  for (const header of headers.getSetCookie?.() ?? []) {
    const [pair] = header.split(';');
    const index = pair.indexOf('=');
    if (index < 0) continue;
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (value === '') jar.delete(name);
    else jar.set(name, value);
  }
}

function cookieHeader() {
  return [...jar.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
}

async function request(path, init = {}) {
  const headers = { ...(init.headers ?? {}) };
  const cookie = cookieHeader();
  if (cookie) headers.cookie = cookie;
  const csrf = jar.get('tt_csrf');
  if (csrf && (init.method ?? 'GET') !== 'GET') headers['x-csrf-token'] = csrf;
  const response = await fetch(`${WEB}${path}`, { ...init, headers, redirect: 'manual' });
  store(response.headers);
  const text = await response.text();
  return { status: response.status, text, headers: response.headers };
}

async function main() {
  console.log(`\nTableTap web smoke → ${WEB}\n`);

  const home = await request('/');
  check('landing page renders', home.status === 200 && home.text.includes('The order, the kitchen and the bill'), home.status);
  check('landing page avoids invented social proof', !/used by \d+|millions of/i.test(home.text));

  const loginPage = await request('/login');
  check('login page renders demo accounts', loginPage.status === 200 && loginPage.text.includes('owner@spicegarden.local'), loginPage.status);

  const guarded = await request('/app/dashboard');
  check('unauthenticated app route redirects to login', [302, 307, 308].includes(guarded.status), guarded.status);

  const login = await request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'owner@spicegarden.local', password: PASSWORD }),
  });
  check('login through the web proxy succeeds', login.status === 200 && login.text.includes('owner@spicegarden.local'), login.text);

  const dashboard = await request('/app/dashboard');
  check('dashboard renders with live data', dashboard.status === 200 && dashboard.text.includes('Gross sales today'), dashboard.status);
  check('dashboard shows a real currency figure', /฿[\d,]+\.\d{2}/.test(dashboard.text), 'no THB amount found');

  const tables = await request('/app/tables');
  check('floor plan renders seeded tables', tables.status === 200 && tables.text.includes('Indoor 01'), tables.status);

  const kitchen = await request('/app/kitchen');
  check('kitchen board renders', kitchen.status === 200 && kitchen.text.includes('Kitchen display'), kitchen.status);

  const pos = await request('/app/pos');
  check('POS renders', pos.status === 200 && pos.text.includes('Point of sale'), pos.status);

  const menu = await request('/app/menu');
  check('menu manager renders items', menu.status === 200 && menu.text.includes('ปอเปี๊ยะทอด'), menu.status);

  const inventory = await request('/app/inventory');
  check('inventory renders stock', inventory.status === 200 && inventory.text.includes('Stock value'), inventory.status);

  const analytics = await request('/app/analytics');
  check('analytics renders real aggregates', analytics.status === 200 && analytics.text.includes('Menu performance'), analytics.status);

  const audit = await request('/app/audit-logs');
  check('audit log renders', audit.status === 200 && audit.text.includes('Audit log'), audit.status);

  const staff = await request('/app/staff');
  check('staff page renders team', staff.status === 200 && staff.text.includes('Invite staff'), staff.status);

  const settings = await request('/app/settings');
  check('settings renders tax configuration', settings.status === 200 && settings.text.includes('PromptPay ID'), settings.status);

  // Customer menu (public, no staff cookie needed, but cookie is harmless).
  const guest = await request('/menu/demo-sathorn-t03-4f8c2a91');
  check('guest menu renders restaurant and dishes', guest.status === 200 && guest.text.includes('Spice Garden') && guest.text.includes('ผัดไทย'), guest.status);
  check('guest menu does not leak staff data', !guest.text.includes('costEstimate') && !guest.text.includes('foodCost'), 'leak detected');

  const badQr = await request('/menu/not-a-real-token-000000000000');
  check('invalid QR returns 404', badQr.status === 404, badQr.status);

  // Platform admin
  jar.clear();
  const platformLogin = await request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'platform@tabletap.local', password: PASSWORD }),
  });
  check('platform admin logs in', platformLogin.status === 200, platformLogin.text);
  const platform = await request('/platform/dashboard');
  check('platform dashboard renders tenants', platform.status === 200 && platform.text.includes('Spice Garden'), platform.status);

  jar.clear();
  const cashierLogin = await request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'cashier@spicegarden.local', password: PASSWORD }),
  });
  check('cashier logs in', cashierLogin.status === 200, cashierLogin.text);
  const cashierAuditApi = await request('/api/v1/audit-logs');
  check('cashier is denied the audit API', cashierAuditApi.status === 403, cashierAuditApi.status);
  const cashierSettings = await request('/app/settings');
  check('cashier is shown an access denial, not the form', cashierSettings.text.includes('You do not have access'), cashierSettings.status);

  console.log(`\n${failures === 0 ? 'ALL WEB CHECKS PASSED' : `${failures} WEB CHECK(S) FAILED`}\n`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
