import type { Server as HttpServer } from 'node:http';
import type { ClientToServerEvents, ServerToClientEvents } from '@olympia/shared';
import { RealtimeConnectError } from '@olympia/shared';
import type { Logger } from 'pino';
import { Server, type Socket } from 'socket.io';
import type { AccessTokenResolver, Principal } from '../../shared/auth/principal';
import { UnauthenticatedError } from '../../shared/errors/app-error';

/** Danh tính đã xác thực của một kết nối realtime (cùng kiểu với REST). */
export type SocketPrincipal = Principal;

export interface SocketData {
  principal: SocketPrincipal;
}

/** Room Socket.IO theo danh tính, dùng để ngắt kết nối khi phiên bị thu hồi. */
export const principalRooms = {
  user: (userId: string) => `user:${userId}`,
  session: (sessionId: string) => `session:${sessionId}`,
  guest: (guestId: string) => `guest:${guestId}`,
};

export type RealtimeServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

export type RealtimeSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/** Xác thực handshake. Trả về principal khi hợp lệ, ném lỗi khi không hợp lệ. */
export type SocketAuthenticator = (
  handshake: RealtimeSocket['handshake'],
) => Promise<SocketPrincipal>;

/** Từ chối mọi kết nối (BR-ROLE-06); dùng trong test. */
export const denyAllAuthenticator: SocketAuthenticator = () =>
  Promise.reject(new Error('Chưa có cơ chế xác thực realtime.'));

/**
 * Xác thực handshake bằng access token trong `auth.token`, cùng cơ chế với REST:
 * `io(url, { auth: { token } })`.
 */
export function createTokenSocketAuthenticator(resolve: AccessTokenResolver): SocketAuthenticator {
  return (handshake) => {
    const token: unknown = (handshake.auth as Record<string, unknown> | undefined)?.token;
    if (typeof token !== 'string' || token.length === 0) {
      return Promise.reject(new UnauthenticatedError());
    }
    return resolve(token);
  };
}

export interface RealtimeServerOptions {
  corsOrigins: string[];
  authenticate: SocketAuthenticator;
  logger: Logger;
  /** Adapter để đồng bộ nhiều instance (Redis adapter khi chạy thật). */
  adapter?: Parameters<RealtimeServer['adapter']>[0];
}

export function createRealtimeServer(
  httpServer: HttpServer,
  { corsOrigins, authenticate, logger, adapter }: RealtimeServerOptions,
): RealtimeServer {
  const io: RealtimeServer = new Server(httpServer, {
    cors: { origin: corsOrigins, credentials: true },
    serveClient: false,
    ...(adapter ? { adapter } : {}),
  });

  io.use((socket, next) => {
    authenticate(socket.handshake)
      .then((principal) => {
        socket.data.principal = principal;
        next();
      })
      .catch((error: unknown) => {
        logger.debug({ err: error, socketId: socket.id }, 'Từ chối kết nối realtime');
        next(new Error(RealtimeConnectError.Unauthenticated));
      });
  });

  io.on('connection', (socket) => {
    const { principal } = socket.data;
    void socket.join(
      principal.kind === 'user'
        ? [principalRooms.user(principal.userId), principalRooms.session(principal.sessionId)]
        : [principalRooms.guest(principal.guestId)],
    );

    socket.on('system:ping', (ack) => {
      if (typeof ack === 'function') {
        ack({ serverTime: Date.now() });
      }
    });
  });

  return io;
}

/**
 * Ngắt kết nối realtime của phiên bị thu hồi (đăng xuất, khóa tài khoản, đổi mật khẩu).
 * Chạy qua adapter nên có hiệu lực trên mọi instance.
 */
export function disconnectRevokedSessions(
  io: RealtimeServer,
  event: { userId: string; sessionId?: string; exceptSessionId?: string },
): void {
  if (event.sessionId) {
    io.in(principalRooms.session(event.sessionId)).disconnectSockets(true);
    return;
  }
  const sockets = io.in(principalRooms.user(event.userId));
  if (event.exceptSessionId) {
    sockets.except(principalRooms.session(event.exceptSessionId)).disconnectSockets(true);
  } else {
    sockets.disconnectSockets(true);
  }
}
