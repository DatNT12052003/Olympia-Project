import type { Server as HttpServer } from 'node:http';
import type { ClientToServerEvents, ServerToClientEvents } from '@olympia/shared';
import { RealtimeConnectError } from '@olympia/shared';
import type { Logger } from 'pino';
import { Server, type Socket } from 'socket.io';

/** Danh tính đã xác thực của một kết nối realtime. */
export interface SocketPrincipal {
  /** Id tài khoản hoặc id phiên khách. */
  id: string;
  kind: 'user' | 'guest';
}

export interface SocketData {
  principal: SocketPrincipal;
}

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

/**
 * Xác thực handshake. Trả về principal khi hợp lệ, ném lỗi khi không hợp lệ.
 * Cài đặt thật (token tài khoản / phiên khách) được bổ sung ở P1.
 */
export type SocketAuthenticator = (
  handshake: RealtimeSocket['handshake'],
) => Promise<SocketPrincipal>;

/** Mặc định từ chối mọi kết nối cho tới khi có cơ chế xác thực (BR-ROLE-06). */
export const denyAllAuthenticator: SocketAuthenticator = () =>
  Promise.reject(new Error('Chưa có cơ chế xác thực realtime.'));

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
    socket.on('system:ping', (ack) => {
      if (typeof ack === 'function') {
        ack({ serverTime: Date.now() });
      }
    });
  });

  return io;
}
