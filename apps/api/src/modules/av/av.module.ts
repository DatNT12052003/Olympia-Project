import type { Logger } from 'pino';
import type { MatchViews } from '../game/match-runtime';
import type { LobbyService } from '../rooms/lobby.service';
import type { RoomEvents } from '../rooms/room-events';
import type { AvGateway } from './av-gateway';
import type { AvStore } from './av-store';
import { createAvService } from './av.service';

export interface AvModuleDeps {
  gateway: AvGateway;
  store: AvStore;
  lobby: Pick<LobbyService, 'resolveViewer'>;
  logger: Logger;
  publicUrl: string;
}

/**
 * Realtime Communication – âm thanh/hình ảnh (DL-010, DL-014): độc lập với Game Engine và Room
 * Management; chỉ nhận sự kiện của hai module đó qua các hook dưới đây.
 */
export function createAvModule(deps: AvModuleDeps) {
  const avService = createAvService(deps);
  const log = (promise: Promise<void>) => {
    promise.catch((error: unknown) => deps.logger.warn({ err: error }, 'Lỗi module AV'));
  };
  return {
    avService,
    /** Bản trạng thái trận vừa phát: cập nhật người đang được nói. */
    onMatchViews(views: Pick<MatchViews, 'roomId' | 'running' | 'speakerKey'>): void {
      log(
        avService.onSpeaker(views.roomId, {
          running: views.running,
          speakerKey: views.speakerKey,
        }),
      );
    },
    /** Sự kiện phòng cần xử lý ở phía video. */
    roomEvents: {
      stateChanged: () => undefined,
      removed: (roomId, key) => log(avService.onRemoved(roomId, key)),
      closed: (roomId) => log(avService.onClosed(roomId)),
    } satisfies RoomEvents,
  };
}

export type AvModule = ReturnType<typeof createAvModule>;

/** Ghép nhiều bộ nhận sự kiện phòng (realtime phòng + video). */
export function fanOutRoomEvents(...targets: RoomEvents[]): RoomEvents {
  return {
    stateChanged: (roomId) => targets.forEach((t) => t.stateChanged(roomId)),
    removed: (roomId, key, reason) => targets.forEach((t) => t.removed(roomId, key, reason)),
    closed: (roomId) => targets.forEach((t) => t.closed(roomId)),
  };
}
