import {
  type Ack,
  CommonErrorCode,
  hasRoomPermission,
  matchAnswerPayloadSchema,
  matchBuzzPayloadSchema,
  matchCommandPayloadSchema,
  MatchErrorCode,
  RoomErrorCode,
  RoomPermission,
} from '@olympia/shared';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { LimiterFactory } from '../../infrastructure/rate-limit/rate-limiter';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  TooManyRequestsError,
} from '../../shared/errors/app-error';
import type { MatchPublisher, MatchRuntime } from '../game/match-runtime';
import type { LobbyService, RoomViewer } from '../rooms/lobby.service';
import type { PresenceStore } from '../rooms/presence-store';
import type { RealtimeServer, RealtimeSocket } from './realtime-server';
import { roomChannels } from './room-realtime';

const syncPayload = z.object({ roomId: z.uuid() });

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
  logger.error({ err: error }, 'Lỗi xử lý sự kiện trận đấu');
  return {
    ok: false,
    error: { code: CommonErrorCode.InternalError, message: 'Đã có lỗi xảy ra.' },
  };
}

export interface MatchRealtimeDeps {
  io: RealtimeServer;
  lobby: Pick<LobbyService, 'resolveViewer'>;
  runtime: MatchRuntime;
  presence: Pick<PresenceStore, 'get'>;
  limiters: LimiterFactory;
  logger: Logger;
  now?: () => number;
}

/**
 * Realtime của trận (mục 10): lệnh Host, trả lời và bấm chuông của Player qua Socket.IO có ack
 * (DL-026). Mọi sự kiện kiểm tra vai trò trong phòng ở server (BR-ROLE-05, BR-SPEC-01).
 */
export function createMatchRealtime({
  io,
  lobby,
  runtime,
  presence,
  limiters,
  logger,
  now = Date.now,
}: MatchRealtimeDeps) {
  // Chống spam: tối đa 10 hành động trận / giây / người.
  const actionLimiter = limiters({ keyPrefix: 'match-action', points: 10, durationSeconds: 1 });

  const publisher: MatchPublisher = {
    publish(views) {
      const { roomId } = views;
      io.to(roomChannels.host(roomId)).emit('match:state', views.host);
      const playerChannels: string[] = [];
      for (const [key, view] of views.players) {
        const channel = roomChannels.principal(roomId, key);
        playerChannels.push(channel);
        io.to(channel).emit('match:state', view);
      }
      io.to(roomChannels.members(roomId))
        .except(playerChannels)
        .emit('match:state', views.spectator);
    },
  };

  async function requireViewer(roomId: string, socket: RealtimeSocket): Promise<RoomViewer> {
    const viewer = await lobby.resolveViewer(roomId, socket.data.principal);
    if (!viewer || viewer.role === 'pending') {
      throw new ForbiddenError('Bạn không ở trong phòng này.', RoomErrorCode.NotInRoom);
    }
    return viewer;
  }

  /** Chỉ kết nối hiện hành của danh tính được thao tác trong trận (BR-RC-05). */
  async function requireCurrentConnection(
    roomId: string,
    socket: RealtimeSocket,
  ): Promise<RoomViewer> {
    const viewer = await requireViewer(roomId, socket);
    const entry = (await presence.get(roomId)).get(viewer.key);
    if (entry?.socketId !== socket.id) {
      throw new ForbiddenError('Phòng đang mở ở tab hoặc thiết bị khác.', RoomErrorCode.NotInRoom);
    }
    return viewer;
  }

  async function requireMatch(roomId: string): Promise<string> {
    const matchId = await runtime.activeMatchOf(roomId);
    if (!matchId) {
      throw new ConflictError('Phòng không có trận đang diễn ra.', MatchErrorCode.NoActiveMatch);
    }
    return matchId;
  }

  async function throttle(viewer: RoomViewer, roomId: string): Promise<void> {
    const blocked = await actionLimiter.consume(`${roomId}|${viewer.key}`);
    if (blocked !== null) throw new TooManyRequestsError(blocked, 'Bạn thao tác quá nhanh.');
  }

  /** Player của trận (BR-SPEC-01: khán giả, Host không trả lời/bấm chuông). */
  async function requirePlayerSeat(viewer: RoomViewer, matchId: string) {
    const role = viewer.role === 'pending' ? null : viewer.role;
    const seat = hasRoomPermission(role, RoomPermission.Answer)
      ? await runtime.seatOf(matchId, viewer.key)
      : null;
    if (seat === null) {
      throw new ForbiddenError('Chỉ người chơi của trận được trả lời.');
    }
    return seat;
  }

  function register(socket: RealtimeSocket): void {
    socket.on('match:sync', async (payload, ack) => {
      if (typeof ack !== 'function') return;
      try {
        const { roomId } = syncPayload.parse(payload);
        const viewer = await requireViewer(roomId, socket);
        const role =
          viewer.role === 'host' ? 'host' : viewer.role === 'player' ? 'player' : 'spectator';
        ack({ ok: true, data: await runtime.viewFor(roomId, { role, key: viewer.key }) });
      } catch (error) {
        ack(failure(error, logger));
      }
    });

    socket.on('match:command', async (payload, ack) => {
      if (typeof ack !== 'function') return;
      try {
        const { roomId, actionId, command } = matchCommandPayloadSchema.parse(payload);
        const viewer = await requireCurrentConnection(roomId, socket);
        if (
          !hasRoomPermission(viewer.role === 'host' ? 'host' : null, RoomPermission.ControlMatch)
        ) {
          throw new ForbiddenError('Chỉ Host của phòng được điều khiển trận.');
        }
        const matchId = await requireMatch(roomId);
        const principal = socket.data.principal;
        await runtime.dispatch(
          matchId,
          { type: 'command', command },
          { actionId, actorUserId: principal.kind === 'user' ? principal.userId : null },
        );
        ack({ ok: true });
      } catch (error) {
        ack(failure(error, logger));
      }
    });

    socket.on('match:answer', async (payload, ack) => {
      // Thời điểm nhận theo server, trước mọi xử lý khác (BR-R3-01).
      const receivedAt = now();
      if (typeof ack !== 'function') return;
      try {
        const { roomId, actionId, questionRef, answer } = matchAnswerPayloadSchema.parse(payload);
        const viewer = await requireCurrentConnection(roomId, socket);
        await throttle(viewer, roomId);
        const matchId = await requireMatch(roomId);
        const seat = await requirePlayerSeat(viewer, matchId);
        const reply = (await runtime.dispatch(
          matchId,
          { type: 'answer', seat, questionRef, answer, receivedAt },
          { actionId },
        )) as { elapsedMs: number };
        ack({ ok: true, data: { elapsedMs: reply.elapsedMs } });
      } catch (error) {
        ack(failure(error, logger));
      }
    });

    socket.on('match:buzz', async (payload, ack) => {
      const receivedAt = now();
      if (typeof ack !== 'function') return;
      try {
        const { roomId, actionId, questionRef } = matchBuzzPayloadSchema.parse(payload);
        const viewer = await requireCurrentConnection(roomId, socket);
        await throttle(viewer, roomId);
        const matchId = await requireMatch(roomId);
        const seat = await requirePlayerSeat(viewer, matchId);
        const reply = (await runtime.dispatch(
          matchId,
          { type: 'buzz', seat, questionRef, receivedAt },
          { actionId },
        )) as { won: boolean };
        ack({ ok: true, data: { won: reply.won } });
      } catch (error) {
        ack(failure(error, logger));
      }
    });
  }

  return { publisher, register };
}
