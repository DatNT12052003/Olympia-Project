import type { Logger } from 'pino';
import type { DataSource } from 'typeorm';
import type { MediaService } from '../media/media.service';
import type { QuestionSourcesService } from '../question-bank/question-sources.service';
import type { PresenceStore } from '../rooms/presence-store';
import type { RoomEvents } from '../rooms/room-events';
import type { RoomsService } from '../rooms/rooms.service';
import type { ScriptsService } from '../scripts/scripts.service';
import { createMatchRuntime } from './match-runtime';
import { createMatchService } from './match.service';
import { createResultsService, type ResultsServiceDeps } from './results.service';
import type { MatchStore } from './match-store';

export interface GameModuleDeps {
  dataSource: DataSource;
  store: MatchStore;
  presence: Pick<PresenceStore, 'get'>;
  media: Pick<MediaService, 'viewsFor'>;
  rooms: Pick<RoomsService, 'beginMatch' | 'finishMatch'>;
  roomEvents: Pick<RoomEvents, 'stateChanged'>;
  scripts: Pick<ScriptsService, 'loadForMatch'>;
  sources: Pick<QuestionSourcesService, 'load'>;
  logger: Logger;
  hostReconnectMinutes: number | (() => number);
  results: Pick<ResultsServiceDeps, 'wasRoomMember' | 'countHostedRooms' | 'staffCanView'>;
  now?: () => number;
  sweepMs?: number;
}

/**
 * Game Engine (DL-010, DL-012): runtime chạy trận và dịch vụ bắt đầu trận. Chỉ dùng Room
 * Management, Question Bank và Kịch bản qua interface công khai.
 */
export function createGameModule(deps: GameModuleDeps) {
  const runtime = createMatchRuntime({
    dataSource: deps.dataSource,
    store: deps.store,
    presence: deps.presence,
    media: deps.media,
    rooms: {
      finishMatch: (manager, roomId) => deps.rooms.finishMatch(manager, roomId),
      roomChanged: (roomId) => deps.roomEvents.stateChanged(roomId),
    },
    logger: deps.logger,
    hostReconnectMs: () =>
      (typeof deps.hostReconnectMinutes === 'function'
        ? deps.hostReconnectMinutes()
        : deps.hostReconnectMinutes) * 60_000,
    ...(deps.now ? { now: deps.now } : {}),
    ...(deps.sweepMs ? { sweepMs: deps.sweepMs } : {}),
  });
  const matchService = createMatchService({
    rooms: deps.rooms,
    scripts: deps.scripts,
    sources: deps.sources,
    runtime,
    ...(deps.now ? { now: deps.now } : {}),
  });
  const resultsService = createResultsService({
    dataSource: deps.dataSource,
    media: deps.media,
    ...deps.results,
  });
  return { runtime, matchService, resultsService };
}

export type GameModule = ReturnType<typeof createGameModule>;
