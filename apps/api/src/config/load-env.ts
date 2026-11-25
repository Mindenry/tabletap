import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';

/**
 * Loads environment variables for every entry point (API, seed, worker).
 * Precedence: an already-exported variable wins, then `apps/api/.env`, then the
 * repository root `.env`.
 */
export function loadEnv(): void {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
    resolve(__dirname, '../../../../.env'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      config({ path: candidate, override: false });
    }
  }
}

loadEnv();
