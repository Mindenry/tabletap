#!/usr/bin/env node
/**
 * TableTap print agent.
 *
 * Polls the API for kitchen tickets and (optionally) paid bills, renders 80 mm
 * ESC/POS slips, and sends them to a thermal printer over TCP:9100 or writes the
 * bytes to a folder for inspection / a Windows spooler.
 *
 *   node tools/print-agent/agent.mjs --email kitchen@spicegarden.local \
 *     --password 'TableTap!2026' --printer 192.168.1.50:9100
 *
 *   node tools/print-agent/agent.mjs --once --output .print-out
 *
 * See README.md next to this file for the full option list and deployment notes.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { connect } from 'node:net';
import { EscPos, money } from './escpos.mjs';

const args = parseArgs(process.argv.slice(2));
const API = (args.api ?? process.env.API_URL ?? 'http://localhost:4100').replace(/\/$/, '');
const EMAIL = args.email ?? process.env.PRINT_AGENT_EMAIL;
const PASSWORD = args.password ?? process.env.PRINT_AGENT_PASSWORD;
const INTERVAL = Number(args.interval ?? 8) * 1000;
const ONCE = Boolean(args.once);
const OUTPUT = args.output ?? null;
const PRINTER = args.printer ?? process.env.PRINTER_TCP ?? null;
const STATE_FILE = args.state ?? '.print-agent-state.json';
const RECEIPTS = Boolean(args.receipts);
const BACKFILL = Boolean(args.backfill);
const STATIONS = args.stations ? new Set(String(args.stations).split(',').map((s) => s.trim())) : null;
const startedAt = new Date();

if (!EMAIL || !PASSWORD) {
  console.error('Set --email and --password (or PRINT_AGENT_EMAIL / PRINT_AGENT_PASSWORD).');
  process.exit(1);
}
if (!PRINTER && !OUTPUT && !args.dry) {
  console.error('Choose a transport: --printer host:9100, --output dir, or --dry.');
  process.exit(1);
}
if (OUTPUT) mkdirSync(OUTPUT, { recursive: true });

const jar = new Map();
let context = { tenant: 'TableTap', branch: null, branchId: null };

function parseArgs(argv) {
  const out = {};
  const booleanFlags = new Set(['once', 'dry', 'receipts', 'backfill']);
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (!raw.startsWith('--')) continue;
    const body = raw.slice(2);
    if (body.includes('=')) {
      const [key, ...rest] = body.split('=');
      out[key] = rest.join('=');
      continue;
    }
    if (booleanFlags.has(body)) {
      out[body] = true;
      continue;
    }
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      out[body] = next;
      index += 1;
    } else {
      out[body] = true;
    }
  }
  return out;
}

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function storeCookies(response) {
  const list = response.headers.getSetCookie?.() ?? [];
  for (const header of list) {
    const [pair] = header.split(';');
    const index = pair.indexOf('=');
    if (index < 0) continue;
    jar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }
}

async function api(method, path, body) {
  const headers = {};
  const cookie = cookieHeader();
  if (cookie) headers.cookie = cookie;
  if (method !== 'GET' && jar.get('tt_csrf')) headers['x-csrf-token'] = jar.get('tt_csrf');
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${API}/api/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  storeCookies(response);
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!response.ok) {
    const error = new Error(`${method} ${path} → ${response.status} ${text.slice(0, 200)}`);
    error.status = response.status;
    throw error;
  }
  return json;
}

async function login() {
  await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  const me = await api('GET', '/auth/me');
  context = {
    tenant: me.tenant?.name ?? 'TableTap',
    branch: args.branch ? null : (me.branches[0]?.name ?? null),
    branchId: args.branch ?? me.branches[0]?.id ?? null,
  };
  if (args.branch) {
    const branch = me.branches.find((candidate) => candidate.id === args.branch);
    context.branch = branch?.name ?? null;
  }
  if (!context.branchId) throw new Error('The account has no accessible branch.');
  console.log(`[print-agent] signed in as ${EMAIL} · ${context.tenant} / ${context.branch ?? context.branchId}`);
}

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { tickets: {}, receipts: {} };
  }
}

function saveState(state) {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const bucket of ['tickets', 'receipts']) {
    for (const [key, stamp] of Object.entries(state[bucket] ?? {})) {
      if (Number(stamp) < cutoff) delete state[bucket][key];
    }
  }
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function bangkokTime(value) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function bangkokDate(value) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function ticketSlip(ticket) {
  const p = new EscPos(42);
  p.align('center').bold(true).double(true).line(context.tenant);
  p.double(false).bold(false);
  p.line(`${context.branch ?? ''} - ${ticket.station.name}`);
  p.align('left').rule('=');
  p.bold(true).double(true).line(`TABLE ${ticket.order.table.number}`);
  p.double(false).bold(false);
  p.line(`${ticket.order.number}   ${bangkokTime(ticket.createdAt)}`);
  p.rule('-');
  for (const item of ticket.items) {
    p.bold(true).line(`${item.quantity} x ${item.name}`);
    p.bold(false);
    if (item.variantName) p.line(`    ${item.variantName}`);
    for (const modifier of item.modifiers ?? []) p.line(`    + ${modifier.name}`);
    if (item.note) p.line(`    >> ${item.note}`);
  }
  p.rule('-');
  p.line(`printed ${bangkokTime(new Date())} - ${ticket.number}`);
  p.feed(4).cut();
  return p.build();
}

function receiptSlip(payload) {
  const p = new EscPos(42);
  p.align('center').bold(true).double(true).line(payload.restaurant.name);
  p.double(false).bold(false);
  p.line(payload.branch.name);
  if (payload.branch.address) p.line(payload.branch.address);
  if (payload.branch.phone) p.line(`โทร ${payload.branch.phone}`);
  if (payload.restaurant.taxId) p.line(`เลขผู้เสียภาษี ${payload.restaurant.taxId}`);
  p.align('left').rule('=');
  p.columns('Receipt', payload.receiptNumber);
  p.columns('Bill', payload.billNumber);
  p.columns('Table', payload.table);
  p.columns('Issued', `${bangkokDate(payload.issuedAt)} ${bangkokTime(payload.issuedAt)}`);
  p.rule('-');
  for (const item of payload.items ?? []) {
    p.columns(`${item.quantity} x ${item.name}`, money(item.lineTotal));
    if (item.variantName) p.line(`    ${item.variantName}`);
  }
  p.rule('-');
  p.columns('Subtotal', money(payload.subtotal));
  if (Number(payload.discountTotal) !== 0) p.columns('Discount', `-${money(payload.discountTotal)}`);
  if (Number(payload.serviceCharge) !== 0) p.columns('Service charge', money(payload.serviceCharge));
  p.columns(`VAT ${payload.branch.vatRate}%${payload.branch.vatInclusive ? ' incl.' : ''}`, money(payload.taxTotal));
  p.rule('=');
  p.bold(true).double(true).columns('TOTAL', money(payload.total)).double(false).bold(false);
  p.rule('-');
  for (const payment of payload.payments ?? []) {
    p.columns(payment.method, money(payment.amountPaid));
    p.line(`  ${payment.reference}`);
  }
  for (const refund of payload.refunds ?? []) {
    p.columns('Refund', `-${money(refund.amount)}`);
  }
  p.rule('-');
  p.align('center').line('ขอบคุณที่ใช้บริการ');
  p.line('Thank you for dining with us.');
  p.feed(1);
  p.line(payload.notice ?? '');
  p.feed(3).cut();
  return p.build();
}

function sendTcp(bytes) {
  return new Promise((resolve, reject) => {
    const [host, port] = PRINTER.split(':');
    const socket = connect({ host, port: Number(port ?? 9100) }, () => {
      socket.write(bytes, () => socket.end());
    });
    socket.setTimeout(8000, () => {
      socket.destroy();
      reject(new Error('printer timed out'));
    });
    socket.on('error', reject);
    socket.on('close', () => resolve());
  });
}

let counter = 0;
async function deliver(bytes, name) {
  if (OUTPUT) {
    const file = join(OUTPUT, `${String((counter += 1)).padStart(3, '0')}-${name}.bin`);
    writeFileSync(file, bytes);
    console.log(`[print-agent] wrote ${file} (${bytes.length} bytes)`);
    return;
  }
  if (args.dry) {
    console.log(`[print-agent] dry-run ${name} (${bytes.length} bytes)`);
    return;
  }
  await sendTcp(bytes);
  console.log(`[print-agent] sent ${name} to ${PRINTER} (${bytes.length} bytes)`);
}

async function poll(state) {
  const tickets = await api(
    'GET',
    `/kitchen/tickets?branchId=${context.branchId}&includeServed=false`,
  );
  let printed = 0;
  for (const ticket of tickets) {
    if (STATIONS && !STATIONS.has(ticket.station.code)) continue;
    if (state.tickets[ticket.id]) continue;
    await deliver(ticketSlip(ticket), `ticket-${ticket.number.replace(/[^A-Za-z0-9-]/g, '')}`);
    state.tickets[ticket.id] = Date.now();
    saveState(state);
    printed += 1;
  }

  if (RECEIPTS) {
    const bills = await api(
      'GET',
      `/bills?branchId=${context.branchId}&status=PAID&limit=20`,
    );
    for (const bill of bills) {
      if (state.receipts[bill.id]) continue;
      if (!BACKFILL && bill.paidAt && new Date(bill.paidAt) < startedAt) {
        state.receipts[bill.id] = Date.now();
        continue;
      }
      const receipt = await api('GET', `/bills/${bill.id}/receipt`);
      const payload = typeof receipt.payload === 'string' ? JSON.parse(receipt.payload) : receipt.payload;
      await deliver(receiptSlip(payload), `receipt-${bill.number.replace(/[^A-Za-z0-9-]/g, '')}`);
      state.receipts[bill.id] = Date.now();
      saveState(state);
      printed += 1;
    }
  }
  return printed;
}

async function main() {
  await login();
  const state = loadState();
  console.log(
    `[print-agent] polling ${API} every ${INTERVAL / 1000}s` +
      `${STATIONS ? ` · stations ${[...STATIONS].join(',')}` : ''}` +
      `${RECEIPTS ? ' · receipts on' : ''}` +
      `${OUTPUT ? ` · output ${OUTPUT}` : PRINTER ? ` · printer ${PRINTER}` : ' · dry run'}`,
  );

  const tick = async () => {
    try {
      const printed = await poll(state);
      if (printed > 0) console.log(`[print-agent] printed ${printed} slip(s)`);
    } catch (error) {
      if (error.status === 401) {
        console.warn('[print-agent] session expired, signing in again');
        await login();
        return;
      }
      console.error(`[print-agent] poll failed: ${error.message}`);
    }
  };

  await tick();
  if (ONCE) return;
  setInterval(tick, INTERVAL);
}

main().catch((error) => {
  console.error(`[print-agent] fatal: ${error.message}`);
  process.exit(1);
});
