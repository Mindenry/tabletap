import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';

const API_INTERNAL = process.env.API_URL ?? 'http://localhost:4100';

const KINDS = new Set(['orders', 'bills']);

/**
 * Streams the API's CSV through the web origin, forwarding the staff session
 * cookie. The API still decides permissions and applies the filters.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ kind: string }> }) {
  const { kind } = await context.params;
  if (!KINDS.has(kind)) {
    return new Response('Unknown export', { status: 404 });
  }

  const search = new URL(request.url).searchParams.toString();
  const cookie = (await cookies()).toString();
  const upstream = await fetch(`${API_INTERNAL}/api/v1/${kind}/export?${search}`, {
    headers: cookie ? { cookie } : {},
    cache: 'no-store',
  });

  if (!upstream.ok) {
    const body = await upstream.text();
    return new Response(body || 'Export failed', {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'text/plain; charset=utf-8' },
    });
  }

  const filename = upstream.headers.get('content-disposition') ?? `attachment; filename="${kind}.csv"`;
  return new Response(await upstream.arrayBuffer(), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': filename,
      'cache-control': 'no-store',
    },
  });
}
