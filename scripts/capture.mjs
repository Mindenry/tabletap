import { chromium } from 'playwright';
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const WEB = process.env.WEB_URL ?? 'http://localhost:3100';
const OUT = join(process.cwd(), '.screenshots');
mkdirSync(OUT, { recursive: true });

const desktop = { width: 1440, height: 900 };
const mobile = { width: 390, height: 844 };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: desktop, deviceScaleFactor: 1 });
const page = await context.newPage();

const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(String(error)));

async function settle() {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.evaluate(() => document.fonts.ready).catch(() => undefined);
  await page.waitForTimeout(500);
}

/** Scroll through the document so IntersectionObserver reveals every section. */
async function revealAll() {
  await page.evaluate(async () => {
    const step = Math.max(320, Math.floor(window.innerHeight * 0.7));
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    window.scrollTo(0, 0);
    await new Promise((resolve) => setTimeout(resolve, 500));
  });
}

async function shot(name, { full = false } = {}) {
  await settle();
  await revealAll();
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: full });
  console.log(`captured ${name}`);
}

async function goto(path) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(`${WEB}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      return;
    } catch {
      await page.waitForTimeout(1200);
    }
  }
  throw new Error(`Could not navigate to ${path}`);
}

await goto('/');
await shot('01-landing', { full: true });

await goto('/login');
await shot('02-login');

await page.fill('#email', 'owner@spicegarden.local');
await page.fill('#password', 'TableTap!2026');
await page.click('button[type="submit"]');
await page.waitForURL('**/app/dashboard', { timeout: 30000 });
await shot('03-dashboard');

for (const [path, name] of [
  ['/app/tables', '04-floor'],
  ['/app/kitchen', '05-kitchen'],
  ['/app/pos', '06-pos'],
  ['/app/analytics', '07-analytics'],
  ['/app/menu', '08-menu'],
  ['/app/promotions', '17-promotions'],
  ['/app/day-close', '14-day-close'],
]) {
  await goto(path);
  await shot(name);
}

await goto('/app/bills');
await page.waitForTimeout(600);
const billHref = await page.locator('a[href^="/app/bills/"]').first().getAttribute('href');
if (billHref) {
  await page.goto(`${WEB}${billHref}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(OUT, '15-bill.png') });
  const billId = billHref.split('/')[3].split('?')[0];
  await page.goto(`${WEB}/receipt/${billId}?format=a4`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(OUT, '16-receipt.png'), fullPage: true });
  console.log('captured 15-bill, 16-receipt');
}

await goto('/menu/demo-sathorn-t03-4f8c2a91');
await shot('09-guest-menu');

const mobileContext = await browser.newContext({
  viewport: mobile,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const mobilePage = await mobileContext.newPage();
await mobilePage.goto(`${WEB}/menu/demo-sathorn-t03-4f8c2a91`, { waitUntil: 'domcontentloaded' });
await mobilePage.waitForTimeout(1100);
await mobilePage.screenshot({ path: join(OUT, '10-guest-mobile.png'), fullPage: false });
console.log('captured 10-guest-mobile');

await mobilePage.locator('main').getByText('ส้มตำไทย', { exact: true }).first().click();
await mobilePage.waitForTimeout(700);
await mobilePage.screenshot({ path: join(OUT, '13-guest-dish.png'), fullPage: false });
console.log('captured 13-guest-dish');

await mobilePage.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
await mobilePage.waitForTimeout(700);
await mobilePage.evaluate(() => {
  const email = document.querySelector('#email');
  const password = document.querySelector('#password');
  if (email && password) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(email, 'owner@spicegarden.local');
    email.dispatchEvent(new Event('input', { bubbles: true }));
    setter?.call(password, 'TableTap!2026');
    password.dispatchEvent(new Event('input', { bubbles: true }));
  }
  document.querySelector('form')?.requestSubmit();
});
await mobilePage.waitForTimeout(2500);
await mobilePage.screenshot({ path: join(OUT, '11-dashboard-mobile.png'), fullPage: false });
console.log('captured 11-dashboard-mobile');

const platformContext = await browser.newContext({ viewport: desktop, deviceScaleFactor: 1 });
const platformPage = await platformContext.newPage();
await platformPage.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
await platformPage.fill('#email', 'platform@tabletap.local');
await platformPage.fill('#password', 'TableTap!2026');
await platformPage.click('button[type="submit"]');
await platformPage.waitForURL('**/platform/dashboard', { timeout: 30000 });
await platformPage.waitForTimeout(900);
await platformPage.screenshot({ path: join(OUT, '12-platform.png'), fullPage: false });
console.log('captured 12-platform');

await browser.close();

// The curated set that README links to. Keeping this in the capture script means
// docs can never drift from the build that was actually measured.
const DOCS = join(process.cwd(), 'docs', 'screenshots');
mkdirSync(DOCS, { recursive: true });
const PUBLISH = {
  '01-landing.png': 'landing.png',
  '02-login.png': 'login.png',
  '03-dashboard.png': 'dashboard.png',
  '04-floor.png': 'floor-plan.png',
  '05-kitchen.png': 'kitchen.png',
  '06-pos.png': 'pos.png',
  '07-analytics.png': 'analytics.png',
  '08-menu.png': 'menu.png',
  '09-guest-menu.png': 'guest-menu.png',
  '10-guest-mobile.png': 'guest-menu-mobile.png',
  '11-dashboard-mobile.png': 'dashboard-mobile.png',
  '12-platform.png': 'platform.png',
  '13-guest-dish.png': 'guest-menu-dish.png',
  '14-day-close.png': 'day-close.png',
  '15-bill.png': 'bill.png',
  '16-receipt.png': 'receipt.png',
  '17-promotions.png': 'promotions.png',
};
for (const [source, target] of Object.entries(PUBLISH)) {
  copyFileSync(join(OUT, source), join(DOCS, target));
}
console.log(`published ${Object.keys(PUBLISH).length} screenshots to docs/screenshots`);

if (errors.length > 0) {
  console.log('\nConsole errors:');
  for (const error of [...new Set(errors)].slice(0, 20)) console.log(` - ${error}`);
  process.exitCode = 1;
} else {
  console.log('\nNo console errors.');
}
