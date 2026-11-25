/**
 * Environment access with validation. Secrets are never logged.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : undefined;
}

const INSECURE_DEFAULTS = [
  'dev-only-access-secret-change-me-please-0000000000000000',
  'dev-only-customer-secret-change-me-please-000000000000',
];

export function validateEnv(): void {
  const nodeEnv = optional('NODE_ENV') ?? 'development';
  const isProduction = nodeEnv === 'production';

  required('DATABASE_URL');

  const accessSecret = required('JWT_ACCESS_SECRET');
  const customerSecret = required('JWT_CUSTOMER_SECRET');

  if (accessSecret.length < 32) throw new Error('JWT_ACCESS_SECRET must be at least 32 characters');
  if (customerSecret.length < 32) throw new Error('JWT_CUSTOMER_SECRET must be at least 32 characters');
  if (accessSecret === customerSecret) {
    throw new Error('JWT_ACCESS_SECRET and JWT_CUSTOMER_SECRET must differ');
  }
  if (isProduction) {
    for (const insecure of INSECURE_DEFAULTS) {
      if (accessSecret === insecure || customerSecret === insecure) {
        throw new Error('Refusing to start in production with development secrets');
      }
    }
    if ((optional('CORS_ORIGINS') ?? '').includes('localhost')) {
      throw new Error('CORS_ORIGINS must not contain localhost in production');
    }
  }
}

export const env = {
  get nodeEnv(): string {
    return optional('NODE_ENV') ?? 'development';
  },
  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  },
  get port(): number {
    return Number(optional('API_PORT') ?? 4000);
  },
  get webUrl(): string {
    return optional('WEB_URL') ?? 'http://localhost:3100';
  },
  get apiUrl(): string {
    return optional('API_URL') ?? 'http://localhost:4100';
  },
  get corsOrigins(): string[] {
    return (optional('CORS_ORIGINS') ?? 'http://localhost:3100')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  },
  get accessSecret(): string {
    return required('JWT_ACCESS_SECRET');
  },
  get customerSecret(): string {
    return required('JWT_CUSTOMER_SECRET');
  },
  get accessTokenTtlSeconds(): number {
    return Number(optional('ACCESS_TOKEN_TTL_SECONDS') ?? 15 * 60);
  },
  get refreshTokenTtlDays(): number {
    return Number(optional('REFRESH_TOKEN_TTL_DAYS') ?? 30);
  },
  get redisUrl(): string | undefined {
    return optional('REDIS_URL');
  },
  get throttleTtlMs(): number {
    return Number(optional('THROTTLE_TTL_MS') ?? 60_000);
  },
  get throttleLimit(): number {
    return Number(optional('THROTTLE_LIMIT') ?? 300);
  },
  get defaultTimezone(): string {
    return optional('DEFAULT_TIMEZONE') ?? 'Asia/Bangkok';
  },
  get defaultCurrency(): string {
    return optional('DEFAULT_CURRENCY') ?? 'THB';
  },
  get defaultVatRate(): number {
    return Number(optional('DEFAULT_VAT_RATE') ?? 7);
  },
  get subscriptionMode(): 'development' | 'enforced' {
    return optional('SUBSCRIPTION_MODE') === 'enforced' ? 'enforced' : 'development';
  },
  get storageDriver(): 'local' | 's3' {
    return optional('STORAGE_DRIVER') === 's3' ? 's3' : 'local';
  },
  get customerSessionTtlHours(): number {
    return Number(optional('CUSTOMER_SESSION_TTL_HOURS') ?? 6);
  },
  get demoDataEnabled(): boolean {
    return optional('SEED_DEMO_DATA') === 'true';
  },
};
