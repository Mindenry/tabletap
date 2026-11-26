#!/usr/bin/env node
/**
 * PostgreSQL backup and restore for the Docker Compose database.
 *
 *   node scripts/backup.mjs                 # dump to backups/tabletap-<stamp>.dump.gz
 *   node scripts/backup.mjs --restore FILE  # restore that dump
 *
 * Reads POSTGRES_USER / POSTGRES_DB (defaults: tabletap) and keeps the last
 * BACKUP_KEEP archives (default 14). Use a scheduled task or cron for nightly
 * runs; copy the folder off the machine as well.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

const args = process.argv.slice(2);
const restoreIndex = args.indexOf('--restore');
const restoreFile = restoreIndex >= 0 ? args[restoreIndex + 1] : null;
const user = process.env.POSTGRES_USER ?? 'tabletap';
const database = process.env.POSTGRES_DB ?? 'tabletap';
const directory = process.env.BACKUP_DIR ?? 'backups';
const keep = Number(process.env.BACKUP_KEEP ?? 14);

function run(composeArgs, input) {
  return execFileSync('docker', ['compose', ...composeArgs], {
    input,
    maxBuffer: 1024 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'inherit'],
  });
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

if (restoreFile) {
  const data = gunzipSync(readFileSync(restoreFile));
  console.log(`Restoring ${restoreFile} into ${database} (this replaces current data)…`);
  run(
    [
      'exec',
      '-T',
      'postgres',
      'pg_restore',
      '-U',
      user,
      '-d',
      database,
      '--clean',
      '--if-exists',
      '--no-owner',
    ],
    data,
  );
  console.log('Restore finished.');
  process.exit(0);
}

console.log(`Dumping ${database} as ${user}…`);
const dump = run([
  'exec',
  '-T',
  'postgres',
  'pg_dump',
  '-U',
  user,
  '-d',
  database,
  '--format=custom',
  '--no-owner',
]);
mkdirSync(directory, { recursive: true });
const file = join(directory, `tabletap-${stamp()}.dump.gz`);
const compressed = gzipSync(dump, { level: 9 });
writeFileSync(file, compressed);
console.log(`Wrote ${file} (${(compressed.length / 1024 / 1024).toFixed(1)} MB)`);

const archives = readdirSync(directory)
  .filter((name) => /^tabletap-.*\.dump\.gz$/.test(name))
  .map((name) => ({ name, time: statSync(join(directory, name)).mtimeMs }))
  .sort((a, b) => b.time - a.time);

for (const archive of archives.slice(keep)) {
  unlinkSync(join(directory, archive.name));
  console.log(`Pruned ${archive.name}`);
}
