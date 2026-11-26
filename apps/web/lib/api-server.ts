import 'server-only';
import { cookies } from 'next/headers';
import { ApiError } from './api';
import { DEMO_MODE } from './demo/config';
import { resolveFixture } from './demo/fixtures';

const API_INTERNAL = process.env.API_URL ?? 'http://localhost:4100';

/**
 * Server-side API call. Forwards the incoming cookie header so the API can
 * authenticate the staff member exactly as the browser would.
 */
export async function serverApi<T>(
  path: string,
  init: RequestInit & { revalidate?: number } = {},
): Promise<T> {
  if (DEMO_MODE) {
    const data = resolveFixture(path);
    if (data === undefined) {
      throw new ApiError(404, 'DEMO_FIXTURE_MISSING', `No demo data for ${path}`);
    }
    return data as T;
  }

  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  const response = await fetch(`${API_INTERNAL}/api/v1${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
    cache: init.cache ?? 'no-store',
    redirect: 'manual',
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const body = (json ?? {}) as { code?: string; message?: string; details?: unknown };
    throw new ApiError(
      response.status,
      body.code ?? 'REQUEST_FAILED',
      body.message ?? `Request failed with ${response.status}`,
      body.details,
    );
  }
  return json as T;
}

/** Server-side call that returns null on 401/403 instead of throwing. */
export async function tryServerApi<T>(path: string): Promise<T | null> {
  try {
    return await serverApi<T>(path);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return null;
    throw error;
  }
}
