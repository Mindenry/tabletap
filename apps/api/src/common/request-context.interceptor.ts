import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

/**
 * Assigns a request id (honouring a well-formed inbound one) and logs one
 * structured line per request. Bodies are never logged.
 */
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<Request & { requestId?: string }>();
    const res = http.getResponse<Response>();
    const inbound = req.header('x-request-id');
    const requestId = inbound && SAFE_REQUEST_ID.test(inbound) ? inbound : randomUUID();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);

    const startedAt = Date.now();
    return next.handle().pipe(
      tap({
        finalize: () => {
          const durationMs = Date.now() - startedAt;
          // eslint-disable-next-line no-console
          console.log(
            JSON.stringify({
              level: 'info',
              msg: 'request',
              requestId,
              method: req.method,
              path: req.originalUrl,
              status: res.statusCode,
              durationMs,
              userId: (req as Request & { principal?: { userId?: string } }).principal?.userId,
            }),
          );
        },
      }),
    );
  }
}
