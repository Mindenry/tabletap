import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../common/prisma/prisma.service';
import { hashSecret } from '../../common/crypto';
import { readCustomerToken } from './cookies';
import type { CustomerPrincipal, Principal } from './principal';

type RequestWithPrincipal = Request & { principal?: Principal };

/**
 * Customer access is issued only after a valid QR token has been resolved to a
 * table session. The cookie holds an opaque random token whose SHA-256 hash is
 * stored server-side, so a session can be revoked instantly and no customer
 * credential is ever derivable from the cookie value alone.
 */
@Injectable()
export class CustomerAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const token = readCustomerToken(request);
    if (!token) {
      throw new UnauthorizedException({
        message: 'Scan a table QR code to order',
        code: 'CUSTOMER_SESSION_REQUIRED',
      });
    }

    const session = await this.prisma.customerSession.findUnique({
      where: { tokenHash: hashSecret(token) },
      include: { tableSession: { include: { table: true, branch: true } } },
    });
    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException({ message: 'Table session expired', code: 'CUSTOMER_SESSION_EXPIRED' });
    }
    const tableSession = session.tableSession;
    if (['CLOSED', 'ABANDONED'].includes(tableSession.status)) {
      throw new ForbiddenException({ message: 'This table session is closed', code: 'TABLE_SESSION_CLOSED' });
    }
    if (tableSession.branch.status !== 'ACTIVE') {
      throw new ForbiddenException({
        message: 'This restaurant is not accepting orders',
        code: 'BRANCH_INACTIVE',
      });
    }

    const principal: CustomerPrincipal = {
      kind: 'customer',
      customerSessionId: session.id,
      tableSessionId: tableSession.id,
      tenantId: tableSession.tenantId,
      branchId: tableSession.branchId,
      tableId: tableSession.tableId,
      expiresAt: session.expiresAt,
    };
    request.principal = principal;
    return true;
  }
}
