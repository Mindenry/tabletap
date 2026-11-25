/**
 * Socket.IO base URL for the browser.
 *
 * The web app is often opened from a phone via a LAN address, so the socket
 * must follow the page's hostname instead of a hardcoded localhost. An explicit
 * NEXT_PUBLIC_SOCKET_URL wins when the API lives on another host (production).
 */
export function socketBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SOCKET_URL;
  if (explicit) return explicit;

  if (typeof window === 'undefined') {
    return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4100';
  }

  const port = process.env.NEXT_PUBLIC_SOCKET_PORT ?? '4100';
  return `${window.location.protocol}//${window.location.hostname}:${port}`;
}
