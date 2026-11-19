import type { Logger } from 'pino';
import type { DataSource } from 'typeorm';
import type { LimiterFactory } from '../../infrastructure/rate-limit/rate-limiter';
import type { AuthService } from '../auth/auth.service';
import type { PasswordHasher } from '../auth/password-hasher';
import { createLobbyService, type LobbyConfig } from './lobby.service';
import type { PresenceStore } from './presence-store';
import { createRoomEventsRelay } from './room-events';
import {
  createRoomsService,
  noRoomScripts,
  type RoomScripts,
  type RoomsConfig,
} from './rooms.service';

export interface RoomsModuleDeps {
  dataSource: DataSource;
  passwords: PasswordHasher;
  presence: PresenceStore;
  limiters: LimiterFactory;
  authService: Pick<AuthService, 'startGuestSession'>;
  /** Kịch bản của Host (module Kịch bản); mặc định không có kịch bản nào. */
  scripts?: RoomScripts;
  config: RoomsConfig & LobbyConfig;
  now?: () => Date;
}

/** Ghép Room Management: dịch vụ phòng, sảnh chờ và bộ chuyển sự kiện tới tầng realtime. */
export function createRoomsModule(deps: RoomsModuleDeps) {
  const events = createRoomEventsRelay();
  const scripts = deps.scripts ?? noRoomScripts;
  const roomsService = createRoomsService({
    dataSource: deps.dataSource,
    passwords: deps.passwords,
    presence: deps.presence,
    events,
    scripts,
    config: deps.config,
    ...(deps.now ? { now: deps.now } : {}),
  });
  const lobbyService = createLobbyService({
    dataSource: deps.dataSource,
    passwords: deps.passwords,
    presence: deps.presence,
    events,
    limiters: deps.limiters,
    startGuestSession: (roomId, name) => deps.authService.startGuestSession(roomId, name),
    closeRoom: roomsService.closeRoom,
    scripts,
    config: deps.config,
    ...(deps.now ? { now: deps.now } : {}),
  });
  return { roomsService, lobbyService, events };
}

/**
 * Tác vụ định kỳ của phòng: giải phóng chỗ khi hết thời gian giữ (DL-029) và đóng phòng không
 * hoạt động (DL-030). Khóa Redis bảo đảm mỗi lượt chỉ một instance chạy.
 */
export function createRoomMaintenance({
  lobby,
  presence,
  logger,
  intervalMs = 15_000,
}: {
  lobby: Pick<
    ReturnType<typeof createLobbyService>,
    'releaseExpiredDisconnects' | 'closeIdleRooms'
  >;
  presence: Pick<PresenceStore, 'tryLock'>;
  logger: Logger;
  intervalMs?: number;
}) {
  let timer: NodeJS.Timeout | undefined;
  let running = false;

  async function tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      if (!(await presence.tryLock('rooms-maintenance', intervalMs - 1000))) return;
      const released = await lobby.releaseExpiredDisconnects();
      const closed = await lobby.closeIdleRooms();
      if (released || closed) logger.info({ released, closed }, 'Bảo trì phòng');
    } catch (error) {
      logger.error({ err: error }, 'Lỗi bảo trì phòng');
    } finally {
      running = false;
    }
  }

  return {
    start() {
      timer ??= setInterval(() => void tick(), intervalMs);
      timer.unref();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
    },
    tick,
  };
}
