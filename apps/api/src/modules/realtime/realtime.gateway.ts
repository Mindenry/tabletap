import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import type { Namespace, Socket } from 'socket.io';
import type { FeatureKey } from '@tabletap/shared';
import { staffRooms, customerSessionRoom, type RealtimeEnvelope } from '@tabletap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { hashSecret } from '../../common/crypto';
import { env } from '../../config/env';
import type { AccessTokenPayload } from '../auth/principal';

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

/**
 * Read-only realtime fan-out. Every connection is authenticated and every room
 * join is decided by the server from the membership record; clients cannot ask
 * to join arbitrary rooms. Realtime is a notification channel only — all
 * authoritative state is read from REST/PostgreSQL.
 */
@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: env.corsOrigins, credentials: true },
  transports: ['websocket', 'polling'],
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Namespace;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(): void {
    this.logger.log('Realtime gateway ready on namespace /realtime');
  }

  async handleConnection(@ConnectedSocket() socket: Socket): Promise<void> {
    try {
      const cookies = parseCookies(socket.handshake.headers.cookie);
      const handshakeToken =
        typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : undefined;

      const staffToken = handshakeToken ?? cookies['tt_at'];
      if (staffToken) {
        const authenticated = await this.authenticateStaff(socket, staffToken);
        if (authenticated) return;
      }

      const customerToken = cookies['tt_customer'];
      if (customerToken) {
        const authenticated = await this.authenticateCustomer(socket, customerToken);
        if (authenticated) return;
      }

      socket.emit('error', { code: 'UNAUTHENTICATED', message: 'Realtime authentication required' });
      socket.disconnect(true);
    } catch (error) {
      this.logger.warn(
        { err: error instanceof Error ? error.message : error },
        'Realtime connection rejected',
      );
      socket.disconnect(true);
    }
  }

  private async authenticateStaff(socket: Socket, token: string): Promise<boolean> {
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, { secret: env.accessSecret });
    } catch {
      return false;
    }
    if (payload.typ !== 'staff') return false;

    const session = await this.prisma.userSession.findUnique({
      where: { id: payload.sid },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) return false;
    if (session.user.status !== 'ACTIVE') return false;

    const membership = await this.prisma.membership.findFirst({
      where: {
        userId: session.userId,
        tenantId: payload.tid,
        status: 'ACTIVE',
        tenant: { status: 'ACTIVE' },
      },
      include: { branches: true, role: true },
    });
    if (!membership) return false;

    const branchIds =
      membership.branches.length > 0
        ? membership.branches.map((branch) => branch.branchId)
        : (
            await this.prisma.branch.findMany({
              where: { tenantId: membership.tenantId, status: { not: 'ARCHIVED' } },
              select: { id: true },
            })
          ).map((branch) => branch.id);

    const stationIds: string[] =
      membership.role.key === 'KITCHEN' ||
      membership.role.key === 'MANAGER' ||
      membership.role.key === 'OWNER'
        ? (
            await this.prisma.kitchenStation.findMany({
              where: { branchId: { in: branchIds }, isActive: true },
              select: { id: true },
            })
          ).map((station) => station.id)
        : [];

    const rooms = staffRooms({
      tenantId: membership.tenantId,
      branchIds,
      role: membership.role.key,
      stationIds,
    });
    for (const room of rooms) await socket.join(room);

    socket.data.kind = 'staff';
    socket.data.userId = session.userId;
    socket.data.tenantId = membership.tenantId;
    socket.data.role = membership.role.key;
    socket.data.branchIds = branchIds;
    socket.emit('ready', { rooms, role: membership.role.key });
    return true;
  }

  private async authenticateCustomer(socket: Socket, token: string): Promise<boolean> {
    const session = await this.prisma.customerSession.findUnique({
      where: { tokenHash: hashSecret(token) },
      include: { tableSession: true },
    });
    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) return false;
    if (['CLOSED', 'ABANDONED'].includes(session.tableSession.status)) return false;

    const room = customerSessionRoom(session.id);
    await socket.join(room);
    socket.data.kind = 'customer';
    socket.data.customerSessionId = session.id;
    socket.data.tenantId = session.tableSession.tenantId;
    socket.emit('ready', { rooms: [room], role: 'CUSTOMER' });
    return true;
  }

  handleDisconnect(socket: Socket): void {
    this.logger.debug(`Realtime disconnected: ${socket.id}`);
  }

  /** Fan-out helper used by the outbox dispatcher. */
  publish(envelope: RealtimeEnvelope, target: { stationId?: string; customerSessionId?: string }): void {
    if (!this.server) return;
    const { tenantId, branchId } = envelope;
    this.server.to(`tenant:${tenantId}`).emit('event', envelope);
    this.server.to(`tenant:${tenantId}`).emit(envelope.eventType, envelope);
    if (branchId) {
      this.server.to(`branch:${branchId}`).emit('event', envelope);
      this.server.to(`branch:${branchId}`).emit(envelope.eventType, envelope);
      if (target.stationId) {
        this.server.to(`branch:${branchId}:kitchen:${target.stationId}`).emit('event', envelope);
        this.server.to(`branch:${branchId}:kitchen:${target.stationId}`).emit(envelope.eventType, envelope);
      }
    }
    if (target.customerSessionId) {
      this.server.to(customerSessionRoom(target.customerSessionId)).emit('event', envelope);
      this.server.to(customerSessionRoom(target.customerSessionId)).emit(envelope.eventType, envelope);
    }
  }

  serverMetrics(): { connections: number } {
    return { connections: this.server?.sockets.size ?? 0 };
  }
}
