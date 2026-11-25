import type { Request } from 'express';

export interface ActorMeta {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

export function actorFrom(req: Request): ActorMeta {
  return {
    ipAddress: req.ip,
    userAgent: req.header('user-agent'),
    requestId: (req as Request & { requestId?: string }).requestId,
  };
}

/** Reads the Idempotency-Key header and validates its shape. */
export function idempotencyKeyFrom(req: Request): string | undefined {
  const value = req.header('idempotency-key');
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed.length < 8 || trimmed.length > 128) return undefined;
  return trimmed;
}
