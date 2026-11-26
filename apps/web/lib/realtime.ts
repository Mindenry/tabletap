import { io, type Socket } from 'socket.io-client';
import { DEMO_MODE } from './demo/config';

/**
 * In demo mode there is no API to connect to, so the components get a socket
 * that does nothing and the screens rely on their polling fallbacks.
 */
export function connectRealtime(url: string, options?: Parameters<typeof io>[1]): Socket {
  if (DEMO_MODE) {
    const noop: Record<string, unknown> = {
      connected: false,
      id: 'demo',
      on: () => noop,
      off: () => noop,
      once: () => noop,
      emit: () => noop,
      connect: () => noop,
      disconnect: () => noop,
      removeAllListeners: () => noop,
      onAny: () => noop,
      io: { on: () => noop },
    };
    return noop as unknown as Socket;
  }
  return io(url, options);
}
