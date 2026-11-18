import {
  type Ack,
  CommonErrorCode,
  hasRoomPermission,
  REACTIONS,
  RoomErrorCode,
  RoomPermission,
  type RoomRole,
} from '@olympia/shared';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { LimiterFactory } from '../../infrastructure/rate-limit/rate-limiter';
import { AppError } from '../../shared/errors/app-error';
import type { LobbyService, RoomViewer } from '../rooms/lobby.service';
import type { PresenceStore } from '../rooms/presence-store';
import type { RoomEvents } from '../rooms/room-events';
import type { RealtimeServer, RealtimeSocket } from './realtime-server';

/** Kênh Socket.IO của một phòng. */
export const roomChannels = {
  all: (roomId: string) => `room:${roomId}:all`,
  host: (roomId: string) => `room:${roomId}:host`,
  members: (roomId: string) => `room:${roomId}:members`,
  principal: (roomId: string, key: string) => `room:${roomId}:p:${key}`,
};

function channelsOf(roomId: string): string[] {
  return [roomChannels.all(roomId), roomChannels.host(roomId), roomChannels.members(roomId)];
}

const subscribePayload = z.object({ roomId: z.uuid() });
const reactionPayload = z.object({ roomId: z.uuid(), emoji: z.enum(REACTIONS) });

function viewerRoomRole(viewer: RoomViewer): RoomRole | null {
  return viewer.role === 'pending' ? null : viewer.role;
}

function failure(error: unknown, logger: Logger): Ack<never> {
  if (error instanceof AppError) {
    return { ok: false, error: { code: error.code, message: error.message } };
  }
  if (error instanceof z.ZodError) {
    return {
      ok: false,
      error: { code: CommonErrorCode.ValidationError, message: 'Dữ liệu không hợp lệ.' },
    };
  }
  logger.error({ err: error }, 'Lỗi xử lý sự kiện realtime');
  return {
    ok: false,
    error: { code: CommonErrorCode.InternalError, message: 'Đã có lỗi xảy ra.' },
  };
}

export interface RoomRealtimeDeps {
  io: RealtimeServer;
  lobby: LobbyService;
  presence: PresenceStore;
  limiters: LimiterFactory;
  logger: Logger;
  now?: () => number;
}

/**
 * Realtime của phòng (DL-026): theo dõi phòng, trạng thái kết nối (BR-RC-01, BR-RC-05),
 * reaction (mục 13) và phát trạng thái phòng khi Room Management báo thay đổi.
 */
export function createRoomRealtime({
  io,
  lobby,
  presence,
  limiters,
  logger,
  now = Date.now,
}: RoomRealtimeDeps) {
  // BR-SPEC-02: 1 reaction / giây / người.
  const reactionLimiter = limiters({ keyPrefix: 'reaction', points: 1, durationSeconds: 1 });

  async function publish(roomId: string): Promise<void> {
    try {
      const [hostState, memberState] = await Promise.all([
        lobby.buildState(roomId, 'host'),
        lobby.buildState(roomId, 'member'),
      ]);
      io.to(roomChannels.host(roomId)).emit('room:state', hostState);
      io.to(roomChannels.members(roomId)).emit('room:state', memberState);
    } catch (error) {
      logger.error({ err: error, roomId }, 'Không phát được trạng thái phòng');
    }
  }

  const events: RoomEvents = {
    stateChanged(roomId) {
      void publish(roomId);
    },
    removed(roomId, key, reason) {
      const channel = roomChannels.principal(roomId, key);
      io.to(channel).emit('room:removed', { roomId, reason });
      io.in(channel).socketsLeave([...channelsOf(roomId), channel]);
    },
    closed(roomId) {
      io.to(roomChannels.all(roomId)).emit('room:removed', { roomId, reason: 'closed' });
      io.in(roomChannels.all(roomId)).socketsLeave(channelsOf(roomId));
    },
  };

  function register(socket: RealtimeSocket): void {
    const principal = socket.data.principal;
    /** Phòng socket này đang theo dõi, kèm khóa danh tính trong phòng. */
    const subscriptions = new Map<string, string>();

    async function markDisconnected(roomId: string, key: string): Promise<void> {
      if (await presence.disconnect(roomId, key, socket.id, now())) events.stateChanged(roomId);
    }

    socket.on('room:subscribe', async (payload, ack) => {
      if (typeof ack !== 'function') return;
      try {
        const { roomId } = subscribePayload.parse(payload);
        const viewer = await lobby.resolveViewer(roomId, principal);
        if (!viewer) {
          ack({
            ok: false,
            error: { code: RoomErrorCode.NotInRoom, message: 'Bạn không ở trong phòng này.' },
          });
          return;
        }
        const audience = viewer.role === 'host' ? 'host' : 'member';
        await socket.join([
          roomChannels.all(roomId),
          audience === 'host' ? roomChannels.host(roomId) : roomChannels.members(roomId),
          roomChannels.principal(roomId, viewer.key),
        ]);
        subscriptions.set(roomId, viewer.key);

        // Một kết nối hoạt động cho mỗi danh tính trong phòng: kết nối mới thay kết nối cũ.
        const previous = await presence.connect(roomId, viewer.key, socket.id, now());
        if (previous && previous.socketId !== socket.id) {
          io.to(previous.socketId).emit('room:removed', { roomId, reason: 'replaced' });
          io.in(previous.socketId).socketsLeave([
            ...channelsOf(roomId),
            roomChannels.principal(roomId, viewer.key),
          ]);
        }

        ack({ ok: true, data: await lobby.buildState(roomId, audience) });
        events.stateChanged(roomId);
      } catch (error) {
        ack(failure(error, logger));
      }
    });

    socket.on('room:unsubscribe', (payload) => {
      const parsed = subscribePayload.safeParse(payload);
      if (!parsed.success) return;
      const { roomId } = parsed.data;
      const key = subscriptions.get(roomId);
      if (!key) return;
      subscriptions.delete(roomId);
      void socket.leave(roomChannels.all(roomId));
      void socket.leave(roomChannels.host(roomId));
      void socket.leave(roomChannels.members(roomId));
      void socket.leave(roomChannels.principal(roomId, key));
      void markDisconnected(roomId, key);
    });

    socket.on('reaction:send', async (payload, ack) => {
      if (typeof ack !== 'function') return;
      try {
        const { roomId, emoji } = reactionPayload.parse(payload);
        if (!subscriptions.has(roomId)) {
          ack({
            ok: false,
            error: { code: RoomErrorCode.NotInRoom, message: 'Bạn không ở trong phòng này.' },
          });
          return;
        }
        const viewer = await lobby.resolveViewer(roomId, principal);
        // BR-SPEC-01 / ma trận 2.2: chỉ người có quyền gửi reaction.
        if (!viewer || !hasRoomPermission(viewerRoomRole(viewer), RoomPermission.SendReaction)) {
          ack({
            ok: false,
            error: { code: CommonErrorCode.Forbidden, message: 'Bạn không được gửi reaction.' },
          });
          return;
        }
        const room = await lobby.roomForReactions(roomId);
        if (!room?.reactionsEnabled) {
          ack({
            ok: false,
            error: { code: 'REACTIONS_DISABLED', message: 'Host đã tắt reaction.' },
          });
          return;
        }
        if ((await reactionLimiter.consume(`${roomId}|${viewer.key}`)) !== null) {
          ack({
            ok: false,
            error: {
              code: CommonErrorCode.TooManyRequests,
              message: 'Bạn gửi reaction quá nhanh.',
            },
          });
          return;
        }
        io.to(roomChannels.all(roomId)).emit('room:reaction', {
          roomId,
          emoji,
          from: { displayName: viewer.displayName, seat: viewer.participant?.seat ?? null },
        });
        ack({ ok: true });
      } catch (error) {
        ack(failure(error, logger));
      }
    });

    socket.on('disconnect', () => {
      for (const [roomId, key] of subscriptions) void markDisconnected(roomId, key);
      subscriptions.clear();
    });
  }

  return { events, register };
}

export type RoomRealtime = ReturnType<typeof createRoomRealtime>;
