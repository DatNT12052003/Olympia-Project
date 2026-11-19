import { randomUUID } from 'node:crypto';
import { ANSWER_GRACE_MS, MatchErrorCode, type MatchView } from '@olympia/shared';
import type { Logger } from 'pino';
import { type DataSource, type EntityManager, In } from 'typeorm';
import { AppError, ConflictError } from '../../shared/errors/app-error';
import type { MediaService } from '../media/media.service';
import type { PresenceStore } from '../rooms/presence-store';
import {
  applyInput,
  buildMatchView,
  type EngineInput,
  type EngineResult,
  viewMediaIds,
} from './engine/match-engine';
import type { MatchState, ScriptSnapshot } from './engine/match-state';
import { MatchPlayerEntity } from './match-player.entity';
import {
  MatchAnswerEntity,
  MatchInterventionEntity,
  MatchScoreEventEntity,
} from './match-records.entity';
import { MatchBusyError, type MatchStore } from './match-store';
import { MatchEntity } from './match.entity';

/** Bản trạng thái cho từng đối tượng xem của một trận. */
export interface MatchViews {
  roomId: string;
  host: MatchView;
  spectator: MatchView;
  /** Theo khóa danh tính của Player (`u:`/`g:`). */
  players: Map<string, MatchView>;
}

/** Tầng realtime phát trạng thái trận (Game Engine không biết về Socket.IO, DL-010). */
export interface MatchPublisher {
  publish(views: MatchViews): void;
}

/** Room Management: đưa phòng về Đang mở khi trận kết thúc, báo phòng thay đổi. */
export interface MatchRoomHooks {
  finishMatch(manager: EntityManager, roomId: string): Promise<void>;
  roomChanged(roomId: string): void;
}

export interface MatchRuntimeDeps {
  dataSource: DataSource;
  store: MatchStore;
  presence: Pick<PresenceStore, 'get'>;
  media: Pick<MediaService, 'viewsFor'>;
  rooms: MatchRoomHooks;
  logger: Logger;
  /** Host mất kết nối quá thời gian này thì trận kết thúc bất thường (4.5). */
  hostReconnectMs: number;
  now?: () => number;
  instanceId?: string;
  leaseMs?: number;
  sweepMs?: number;
}

export interface DispatchOptions {
  /** Id hành động của client, chống xử lý trùng (BR-GAME-03). */
  actionId?: string;
  /** Host thực hiện (ghi nhật ký can thiệp, BR-GAME-07). */
  actorUserId?: string | null;
}

/** Viewer theo vai trò trong phòng (đã được tầng realtime xác thực). */
export interface MatchViewer {
  role: 'host' | 'player' | 'spectator';
  key: string;
}

/**
 * Chạy trận đấu (DL-013): mỗi đầu vào của một trận được xử lý tuần tự (hàng đợi trong instance +
 * mutex Redis giữa các instance), áp reducer của engine, ghi bền PostgreSQL (câu trả lời, sổ điểm,
 * nhật ký, checkpoint) rồi ghi trạng thái nóng vào Redis và phát cho client.
 *
 * Đồng hồ: instance xử lý đặt `setTimeout` cục bộ; lượt hết giờ idempotent theo id đồng hồ. Instance
 * giữ lease của trận quét định kỳ để kích hoạt đồng hồ quá hạn (khi instance đặt nó đã chết) và
 * kết thúc trận khi Host mất kết nối quá lâu.
 */
export function createMatchRuntime(deps: MatchRuntimeDeps) {
  const { dataSource, store, presence, media, rooms, logger } = deps;
  const now = deps.now ?? Date.now;
  const instanceId = deps.instanceId ?? randomUUID();
  const leaseMs = deps.leaseMs ?? 15_000;
  const sweepMs = deps.sweepMs ?? 2_000;
  let publisher: MatchPublisher = { publish: () => undefined };

  const queues = new Map<string, Promise<unknown>>();
  const timers = new Map<string, { timerId: string; handle: NodeJS.Timeout }>();
  const snapshots = new Map<string, ScriptSnapshot>();
  let sweeper: NodeJS.Timeout | undefined;
  let sweeping = false;
  let stopped = false;

  /** Hàng đợi FIFO theo trận trong instance: giữ đúng thứ tự nhận (bấm chuông đồng thời, 8.5). */
  function enqueue<T>(matchId: string, task: () => Promise<T>): Promise<T> {
    const previous = queues.get(matchId) ?? Promise.resolve();
    const run = previous.then(task, task);
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    queues.set(matchId, tail);
    void tail.then(() => {
      if (queues.get(matchId) === tail) queues.delete(matchId);
    });
    return run;
  }

  /** Trạng thái nóng; nếu Redis mất dữ liệu thì khôi phục từ checkpoint PostgreSQL. */
  async function loadState(matchId: string): Promise<MatchState | null> {
    const cached = await store.getState(matchId);
    if (cached) return cached;
    const row = await dataSource.getRepository(MatchEntity).findOneBy({ id: matchId });
    if (!row) return null;
    const state = row.state as MatchState;
    await store.setState(state);
    return state;
  }

  async function loadSnapshot(matchId: string): Promise<ScriptSnapshot> {
    const local = snapshots.get(matchId);
    if (local) return local;
    let snapshot = await store.getSnapshot(matchId);
    if (!snapshot) {
      const row = await dataSource
        .getRepository(MatchEntity)
        .findOneOrFail({ where: { id: matchId }, select: { id: true, scriptSnapshot: true } });
      snapshot = row.scriptSnapshot;
      await store.setSnapshot(matchId, snapshot);
    }
    snapshots.set(matchId, snapshot);
    return snapshot;
  }

  async function persist(result: EngineResult, actorUserId: string | null): Promise<void> {
    const { state, effects } = result;
    const finished = effects.some((e) => e.kind === 'finished');
    await dataSource.transaction(async (manager) => {
      const answers = effects.flatMap((e) => (e.kind === 'answer' ? [e] : []));
      if (answers.length > 0) {
        await manager.insert(
          MatchAnswerEntity,
          answers.map((e) => ({
            matchId: state.matchId,
            roundIndex: e.roundIndex,
            questionRef: e.questionRef,
            seat: e.seat,
            answer: e.answer,
            autoResult: e.autoResult,
            receivedAt: new Date(e.receivedAt),
            elapsedMs: e.elapsedMs,
          })),
        );
      }
      const scores = effects.flatMap((e) => (e.kind === 'score' ? [e] : []));
      if (scores.length > 0) {
        await manager.insert(
          MatchScoreEventEntity,
          scores.map((e) => ({
            matchId: state.matchId,
            seq: e.seq,
            seat: e.seat,
            roundIndex: e.roundIndex,
            questionRef: e.questionRef,
            delta: e.delta,
            nominal: e.nominal,
            reason: e.reason,
            note: e.note,
            actor: e.actor,
          })),
        );
      }
      const interventions = effects.flatMap((e) => (e.kind === 'intervention' ? [e] : []));
      if (interventions.length > 0) {
        await manager.insert(
          MatchInterventionEntity,
          interventions.map((e) => ({
            matchId: state.matchId,
            actorUserId,
            action: e.action,
            detail: e.detail,
            reason: e.reason,
          })),
        );
      }
      await manager.update(
        MatchEntity,
        { id: state.matchId },
        {
          state,
          stateVersion: state.version,
          status: state.status,
          endReason: state.endReason,
          ...(finished ? { endedAt: new Date(now()) } : {}),
        },
      );
      if (finished) {
        for (const p of state.players) {
          await manager.update(
            MatchPlayerEntity,
            { matchId: state.matchId, seat: p.seat },
            { finalScore: p.score, eliminated: p.eliminated },
          );
        }
        await rooms.finishMatch(manager, state.roomId);
      }
    });
  }

  function clearTimer(matchId: string): void {
    const existing = timers.get(matchId);
    if (existing) clearTimeout(existing.handle);
    timers.delete(matchId);
  }

  /** Đặt đồng hồ cục bộ theo trạng thái (hết giờ + sai số mạng, BR-GAME-02). */
  function schedule(state: MatchState): void {
    const timer = state.timer;
    if (stopped || state.status !== 'running' || !timer || timer.endsAt === null) {
      clearTimer(state.matchId);
      return;
    }
    const existing = timers.get(state.matchId);
    if (existing?.timerId === timer.id) return;
    clearTimer(state.matchId);
    const delay = Math.max(0, timer.endsAt + ANSWER_GRACE_MS - now());
    const handle = setTimeout(() => {
      timers.delete(state.matchId);
      dispatch(state.matchId, { type: 'timer', timerId: timer.id }).catch((error: unknown) => {
        logger.error({ err: error, matchId: state.matchId }, 'Lỗi xử lý hết giờ');
      });
    }, delay);
    handle.unref();
    timers.set(state.matchId, { timerId: timer.id, handle });
  }

  async function buildViews(state: MatchState): Promise<MatchViews> {
    const [presenceMap, mediaViews] = await Promise.all([
      presence.get(state.roomId),
      media.viewsFor(viewMediaIds(state)),
    ]);
    const at = now();
    const base = { presence: presenceMap, media: mediaViews, now: at };
    const players = new Map<string, MatchView>();
    for (const p of state.players) {
      players.set(p.key, buildMatchView(state, { ...base, audience: 'player', seat: p.seat }));
    }
    return {
      roomId: state.roomId,
      host: buildMatchView(state, { ...base, audience: 'host', seat: null }),
      spectator: buildMatchView(state, { ...base, audience: 'spectator', seat: null }),
      players,
    };
  }

  async function publish(state: MatchState): Promise<void> {
    try {
      publisher.publish(await buildViews(state));
    } catch (error) {
      logger.error({ err: error, matchId: state.matchId }, 'Không phát được trạng thái trận');
    }
  }

  async function run(
    matchId: string,
    input: EngineInput,
    options: DispatchOptions,
  ): Promise<{ reply: unknown; state: MatchState; changed: boolean }> {
    if (stopped) throw new ConflictError('Máy chủ đang dừng.', MatchErrorCode.Busy);
    const outcome = await enqueue(matchId, () =>
      store.withLock(matchId, async () => {
        if (options.actionId) {
          const cached = await store.getReply(matchId, options.actionId);
          if (cached) return { cached, result: null };
        }
        const state = await loadState(matchId);
        if (!state) {
          throw new ConflictError(
            'Phòng không có trận đang diễn ra.',
            MatchErrorCode.NoActiveMatch,
          );
        }
        const snapshot = await loadSnapshot(matchId);
        let result: EngineResult;
        try {
          result = applyInput(state, snapshot, input, now());
        } catch (error) {
          if (error instanceof AppError && options.actionId) {
            await store.setReply(matchId, options.actionId, {
              ok: false,
              error: { code: error.code, message: error.message },
            });
          }
          throw error;
        }
        if (result.changed) {
          await persist(result, options.actorUserId ?? null);
          await store.setState(result.state);
          if (result.state.status === 'finished') {
            await store.deactivate(result.state.roomId, matchId);
          }
        }
        if (options.actionId) {
          await store.setReply(matchId, options.actionId, { ok: true, data: result.reply ?? null });
        }
        return { result, cached: null };
      }),
    ).catch((error: unknown) => {
      if (error instanceof MatchBusyError) {
        throw new ConflictError('Hệ thống đang bận, hãy thử lại.', MatchErrorCode.Busy);
      }
      throw error;
    });

    if (outcome.cached) {
      const cached = outcome.cached;
      if (!cached.ok) {
        throw new AppError(
          409,
          cached.error?.code ?? MatchErrorCode.InvalidState,
          cached.error?.message ?? '',
        );
      }
      const state = (await store.getState(matchId))!;
      return { reply: cached.data, state, changed: false };
    }
    const { result } = outcome;
    if (result.changed) {
      schedule(result.state);
      await publish(result.state);
      if (result.state.status === 'finished') {
        clearTimer(matchId);
        snapshots.delete(matchId);
        rooms.roomChanged(result.state.roomId);
      }
    }
    return { reply: result.reply, state: result.state, changed: result.changed };
  }

  async function dispatch(
    matchId: string,
    input: EngineInput,
    options: DispatchOptions = {},
  ): Promise<unknown> {
    return (await run(matchId, input, options)).reply;
  }

  async function sweep(): Promise<void> {
    if (sweeping || stopped) return;
    sweeping = true;
    try {
      for (const matchId of await store.activeMatches()) {
        if (!(await store.claimLease(matchId, instanceId, leaseMs))) continue;
        const state = await loadState(matchId);
        if (!state || state.status === 'finished') continue;
        const at = now();
        const timer = state.timer;
        if (
          state.status === 'running' &&
          timer?.endsAt != null &&
          timer.endsAt + ANSWER_GRACE_MS + 1_000 < at
        ) {
          await dispatch(matchId, { type: 'timer', timerId: timer.id });
        } else {
          schedule(state);
        }
        if (
          state.hostDisconnectedAt !== null &&
          at - state.hostDisconnectedAt >= deps.hostReconnectMs
        ) {
          await dispatch(matchId, { type: 'host_timeout' });
        }
      }
    } catch (error) {
      logger.error({ err: error }, 'Lỗi quét trận đấu');
    } finally {
      sweeping = false;
    }
  }

  return {
    instanceId,

    attachPublisher(next: MatchPublisher) {
      publisher = next;
    },

    /** Lưu trạng thái đầu của trận vừa tạo và phát cho mọi người. */
    async initialize(state: MatchState, snapshot: ScriptSnapshot): Promise<void> {
      snapshots.set(state.matchId, snapshot);
      await store.setSnapshot(state.matchId, snapshot);
      await store.setState(state);
      await store.activate(state.roomId, state.matchId);
      await store.claimLease(state.matchId, instanceId, leaseMs);
      // Chế độ tự động có đồng hồ ngay từ đầu (thời gian đọc câu 1).
      schedule(state);
      await publish(state);
    },

    dispatch,

    /** Trận đang diễn ra của phòng. */
    activeMatchOf(roomId: string): Promise<string | null> {
      return store.activeMatchOf(roomId);
    },

    /** Ghế của danh tính trong trận (`null` nếu không phải người chơi của trận). */
    async seatOf(matchId: string, key: string): Promise<number | null> {
      const state = await loadState(matchId);
      return state?.players.find((p) => p.key === key)?.seat ?? null;
    },

    /** Trạng thái hiện tại cho một người xem (kết nối lại, BR-RC-02). */
    async viewFor(roomId: string, viewer: MatchViewer): Promise<MatchView | null> {
      const matchId = await store.activeMatchOf(roomId);
      if (!matchId) return null;
      const state = await loadState(matchId);
      if (!state || state.status === 'finished') return null;
      const views = await buildViews(state);
      if (viewer.role === 'host') return views.host;
      return views.players.get(viewer.key) ?? views.spectator;
    },

    /** Kết nối của Host/Player thay đổi: tạm dừng khi cần (4.5, 8.5) và cập nhật bảng điểm. */
    async onPresence(roomId: string, key: string, connected: boolean): Promise<void> {
      if (stopped) return;
      const matchId = await store.activeMatchOf(roomId);
      if (!matchId) return;
      const state = await loadState(matchId);
      if (!state || state.status === 'finished') return;
      const who = key === state.hostKey ? 'host' : state.players.find((p) => p.key === key)?.seat;
      if (who === undefined) return;
      const result = await run(matchId, { type: 'presence', who, connected }, {});
      if (!result.changed) await publish(result.state);
    },

    /** Khôi phục trận còn dang dở sau khi khởi động lại (DL-013) và bắt đầu quét định kỳ. */
    async start(): Promise<void> {
      stopped = false;
      const rows = await dataSource.getRepository(MatchEntity).find({
        where: { status: In(['running', 'paused']) },
        select: { id: true, roomId: true },
      });
      for (const row of rows) await store.activate(row.roomId, row.id);
      sweeper ??= setInterval(() => void sweep(), sweepMs);
      sweeper.unref();
    },

    async stop(): Promise<void> {
      stopped = true;
      if (sweeper) clearInterval(sweeper);
      sweeper = undefined;
      for (const matchId of timers.keys()) clearTimer(matchId);
      // Chờ các đầu vào đang xử lý xong trước khi trả lease.
      await Promise.allSettled([...queues.values()]);
      for (const matchId of await store.activeMatches()) {
        await store.releaseLease(matchId, instanceId);
      }
    },

    sweep,
  };
}

export type MatchRuntime = ReturnType<typeof createMatchRuntime>;
