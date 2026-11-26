#!/usr/bin/env node
/**
 * One-command local setup: environment file, containers, migrations, demo data.
 *
 *   pnpm setup
 *
 * Safe to re-run: containers are reused, migrations are applied only when
 * pending, and the seed runs only when the database has no tenants yet.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';

const ROOT = process.cwd();

function runShell(line) {
  const result = spawnSync(line, { cwd: ROOT, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    throw new Error(`${line} failed with ${result.status ?? 'no status'}`);
  }
}

function runDocker(args) {
  const result = spawnSync('docker', args, { cwd: ROOT, stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`docker ${args.join(' ')} failed with ${result.status ?? 'no status'}`);
  }
}

function capture(command, args) {
  return execFileSync(command, args, { cwd: ROOT, encoding: 'utf8', shell: false }).trim();
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

console.log('\nTableTap setup\n');

if (!existsSync('.env')) {
  copyFileSync('.env.example', '.env');
  console.log('· created .env from .env.example (development defaults)');
} else {
  console.log('· .env already exists');
}

console.log('· starting PostgreSQL, Redis and Mailpit…');
runDocker(['compose', 'up', '-d', 'postgres', 'redis', 'mailpit']);

console.log('· waiting for PostgreSQL…');
let ready = false;
for (let attempt = 0; attempt < 40; attempt += 1) {
  const check = spawnSync(
    'docker',
    ['compose', 'exec', '-T', 'postgres', 'pg_isready', '-U', 'tabletap', '-d', 'tabletap'],
    { stdio: 'ignore' },
  );
  if (check.status === 0) {
    ready = true;
    break;
  }
  sleep(1000);
}
if (!ready) throw new Error('PostgreSQL did not become ready in 40s');

console.log('· applying migrations…');
runShell('pnpm --filter @tabletap/api db:deploy');

let tenantCount = '0';
try {
  tenantCount = capture('docker', [
    'compose',
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    'tabletap',
    '-d',
    'tabletap',
    '-tAc',
    'select count(*) from "Tenant"',
  ]);
} catch {
  tenantCount = '0';
}

if (tenantCount.trim() === '0') {
  console.log('· seeding demo data…');
  runShell('pnpm --filter @tabletap/api db:seed');
} else {
  console.log('· database already has data, skipping the seed (pnpm db:seed to re-add)');
}

console.log(`
Ready.

  Staff        http://localhost:3100/login
  Guest menu   http://localhost:3100/menu/demo-sathorn-t03-4f8c2a91
  API docs     http://localhost:4100/api/docs
  Mailpit      http://localhost:8125

  Password for every demo account: TableTap!2026
  Owner: owner@spicegarden.local

Start both apps with:  pnpm dev
`);
