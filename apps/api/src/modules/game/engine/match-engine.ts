import {
  type HostCommand,
  MatchErrorCode,
  type MatchPlayerView,
  type MatchView,
  type MediaView,
  type PlayerAnswer,
  ROUND_TITLES,
} from '@olympia/shared';
import { NotFoundError } from '../../../shared/errors/app-error';
import type { PresenceEntry } from '../../rooms/presence-store';
import type {
  EngineEffect,
  MatchPlayerState,
  MatchState,
  PauseReason,
  ScriptSnapshot,
} from './match-state';
import { MatchRuleError, type RoundContext } from './round-plugin';
import { roundPlugin } from './round-registry';

/**
 * Game Engine (mục 8): reducer thuần `(trạng thái, đầu vào, thời điểm) → trạng thái mới + tác
 * động phụ`. Không đọc/ghi I/O nên dễ kiểm thử và chạy lại ở instance khác (DL-013). Tầng runtime
 * bảo đảm mỗi trận chỉ một đầu vào được xử lý tại một thời điểm.
 */

export type EngineInput =
  | { type: 'command'; command: HostCommand }
  | { type: 'answer'; seat: number; questionRef: string; answer: PlayerAnswer; receivedAt: number }
  | { type: 'buzz'; seat: number; questionRef: string; receivedAt: number }
  | { type: 'timer'; timerId: string }
  | { type: 'presence'; who: 'host' | number; connected: boolean }
  | { type: 'host_timeout' };

export interface EngineResult {
  state: MatchState;
  effects: EngineEffect[];
  reply: unknown;
  /** Trạng thái có thay đổi (cần lưu và phát lại). */
  changed: boolean;
}

const LOG_LIMIT = 30;
/** Lệnh Host vẫn được phép khi trận tạm dừng. */
const ALLOWED_WHILE_PAUSED: ReadonlySet<HostCommand['type']> = new Set([
  'resume',
  'end_match',
  'adjust_score',
  'regrade',
  'eliminate_player',
]);
const CORE_COMMANDS: ReadonlySet<HostCommand['type']> = new Set([
  'pause',
  'resume',
  'end_match',
  'next_round',
  'adjust_score',
  'eliminate_player',
]);

export interface StartPlayer {
  seat: number;
  displayName: string;
  kind: 'user' | 'guest';
  key: string;
}

/** Trạng thái đầu của trận: vòng 1 đã khởi tạo, chưa hiển thị câu nào. */
export function createInitialState(input: {
  matchId: string;
  roomId: string;
  hostKey: string;
  snapshot: ScriptSnapshot;
  players: StartPlayer[];
  now: number;
}): MatchState {
  const { snapshot } = input;
  const players: MatchPlayerState[] = [...input.players]
    .sort((a, b) => a.seat - b.seat)
    .map((p) => ({
      ...p,
      score: 0,
      roundScores: snapshot.rounds.map(() => 0),
      eliminated: false,
    }));
  const first = snapshot.rounds[0];
  if (!first) throw new Error('Kịch bản không có vòng thi.');
  return {
    matchId: input.matchId,
    roomId: input.roomId,
    hostKey: input.hostKey,
    version: 1,
    status: 'running',
    endReason: null,
    pause: null,
    hostDisconnectedAt: null,
    settings: snapshot.settings,
    rounds: snapshot.rounds.map(({ round }) => ({
      type: round.type,
      title: ROUND_TITLES[round.type],
    })),
    roundIndex: 0,
    round: roundPlugin(first.round.type).init(
      first.round,
      first.questions,
      players.map((p) => p.seat),
      0,
    ),
    players,
    timer: null,
    timerSeq: 0,
    scoreSeq: 0,
    log: [{ at: input.now, text: 'Bắt đầu trận' }],
  };
}

export function applyInput(
  current: MatchState,
  snapshot: ScriptSnapshot,
  input: EngineInput,
  now: number,
): EngineResult {
  const state = structuredClone(current);
  const effects: EngineEffect[] = [];
  let changed = false;

  const log = (text: string) => {
    state.log.unshift({ at: now, text });
    state.log.length = Math.min(state.log.length, LOG_LIMIT);
    changed = true;
  };
  const player = (seat: number): MatchPlayerState => {
    const found = state.players.find((p) => p.seat === seat);
    if (!found) throw new NotFoundError('Không có người chơi ở vị trí này.');
    return found;
  };
  const newTimerId = () => {
    state.timerSeq += 1;
    return String(state.timerSeq);
  };
  const pauseTimer = () => {
    if (state.timer?.endsAt != null) {
      state.timer = {
        ...state.timer,
        id: newTimerId(),
        remainingMs: Math.max(0, state.timer.endsAt - now),
        endsAt: null,
      };
    }
  };
  const resumeTimer = () => {
    if (state.timer?.remainingMs != null) {
      state.timer = {
        ...state.timer,
        id: newTimerId(),
        endsAt: now + state.timer.remainingMs,
        remainingMs: null,
      };
    }
  };
  const pause = (reason: PauseReason) => {
    if (state.status !== 'running') return;
    pauseTimer();
    state.status = 'paused';
    state.pause = { reason, since: now };
    changed = true;
  };
  const finish = (reason: 'host' | 'abnormal') => {
    state.status = 'finished';
    state.endReason = reason;
    state.pause = null;
    state.timer = null;
    effects.push({ kind: 'finished' });
    log(reason === 'host' ? 'Host kết thúc trận' : 'Trận kết thúc bất thường (Host mất kết nối)');
  };

  const ctx: RoundContext = {
    now,
    settings: state.settings,
    get roundIndex() {
      return state.roundIndex;
    },
    activeSeats: () => state.players.filter((p) => !p.eliminated).map((p) => p.seat),
    isEliminated: (seat) => player(seat).eliminated,
    playerName: (seat) => state.players.find((p) => p.seat === seat)?.displayName ?? `Ghế ${seat}`,
    award(seat, nominal, reason, questionRef, actor, note = null) {
      const p = player(seat);
      const before = p.score;
      let after = before + nominal;
      if (!state.settings.allowNegativeScore && after < 0) after = 0;
      const delta = after - before;
      p.score = after;
      p.roundScores[state.roundIndex] = (p.roundScores[state.roundIndex] ?? 0) + delta;
      state.scoreSeq += 1;
      effects.push({
        kind: 'score',
        seq: state.scoreSeq,
        seat,
        roundIndex: state.roundIndex,
        questionRef,
        delta,
        nominal,
        reason,
        note,
        actor,
      });
      changed = true;
      return delta;
    },
    recordAnswer(answer) {
      effects.push({ kind: 'answer', roundIndex: state.roundIndex, ...answer });
      changed = true;
    },
    intervention(action, detail, reason = null) {
      effects.push({ kind: 'intervention', action, detail, reason });
    },
    timer: () => state.timer,
    startTimer(purpose, durationMs) {
      state.timer = {
        id: newTimerId(),
        purpose,
        durationMs,
        endsAt: now + durationMs,
        remainingMs: null,
      };
      changed = true;
    },
    clearTimer() {
      if (state.timer) {
        state.timer = null;
        changed = true;
      }
    },
    log,
  };

  const plugin = roundPlugin(state.rounds[state.roundIndex]!.type);
  let reply: unknown;

  const assertPlaying = () => {
    if (state.status === 'finished') {
      throw new MatchRuleError('Trận đã kết thúc.', MatchErrorCode.NoActiveMatch);
    }
    if (state.status === 'paused') {
      throw new MatchRuleError('Trận đang tạm dừng.', MatchErrorCode.Paused);
    }
  };
  const assertActivePlayer = (seat: number) => {
    if (player(seat).eliminated) {
      throw new MatchRuleError('Bạn đã bị loại khỏi trận.', MatchErrorCode.NotYourTurn);
    }
  };

  switch (input.type) {
    case 'command': {
      const { command } = input;
      if (state.status === 'finished') {
        throw new MatchRuleError('Trận đã kết thúc.', MatchErrorCode.NoActiveMatch);
      }
      if (state.status === 'paused' && !ALLOWED_WHILE_PAUSED.has(command.type)) {
        throw new MatchRuleError(
          'Trận đang tạm dừng. Hãy tiếp tục trận trước.',
          MatchErrorCode.Paused,
        );
      }
      if (!CORE_COMMANDS.has(command.type)) {
        // `judge`, `regrade`... cập nhật trạng thái ngay cả khi không đổi điểm.
        changed = true;
        plugin.command(ctx, state.round, command);
        break;
      }
      switch (command.type) {
        case 'pause':
          pause('host');
          log('Host tạm dừng trận');
          break;
        case 'resume':
          if (state.status !== 'paused') break;
          state.status = 'running';
          state.pause = null;
          resumeTimer();
          log('Tiếp tục trận');
          break;
        case 'end_match':
          ctx.intervention('end_match', { roundIndex: state.roundIndex });
          finish('host');
          break;
        case 'next_round': {
          if (!plugin.finished(state.round)) {
            throw new MatchRuleError('Vòng hiện tại chưa kết thúc.', MatchErrorCode.InvalidState);
          }
          const nextIndex = state.roundIndex + 1;
          const next = snapshot.rounds[nextIndex];
          if (!next) {
            throw new MatchRuleError(
              'Đây là vòng cuối. Hãy kết thúc trận.',
              MatchErrorCode.InvalidState,
            );
          }
          state.roundIndex = nextIndex;
          state.timer = null;
          state.round = roundPlugin(next.round.type).init(
            next.round,
            next.questions,
            ctx.activeSeats(),
            nextIndex,
          );
          log(`Bắt đầu vòng ${nextIndex + 1}: ${state.rounds[nextIndex]!.title}`);
          break;
        }
        case 'adjust_score': {
          const p = player(command.seat);
          const before = p.score;
          const delta = ctx.award(
            command.seat,
            command.delta,
            'adjust',
            null,
            'host',
            command.reason,
          );
          ctx.intervention(
            'adjust_score',
            { seat: command.seat, nominal: command.delta, before, after: p.score },
            command.reason,
          );
          log(
            `Host điều chỉnh điểm ${p.displayName}: ${delta >= 0 ? '+' : ''}${delta} (${command.reason})`,
          );
          break;
        }
        case 'eliminate_player': {
          const p = player(command.seat);
          if (p.eliminated) break;
          p.eliminated = true;
          ctx.intervention('eliminate_player', { seat: command.seat, score: p.score });
          log(`Host loại ${p.displayName} khỏi trận (giữ ${p.score} điểm)`);
          break;
        }
      }
      break;
    }

    case 'answer':
      assertPlaying();
      assertActivePlayer(input.seat);
      reply = plugin.answer(
        ctx,
        state.round,
        input.seat,
        input.questionRef,
        input.answer,
        input.receivedAt,
      );
      changed = true;
      break;

    case 'buzz': {
      assertPlaying();
      assertActivePlayer(input.seat);
      const result = plugin.buzz(ctx, state.round, input.seat, input.questionRef, input.receivedAt);
      reply = result;
      break;
    }

    case 'timer': {
      const timer = state.timer;
      if (
        state.status !== 'running' ||
        !timer ||
        timer.id !== input.timerId ||
        timer.endsAt === null
      ) {
        break;
      }
      state.timer = null;
      changed = true;
      plugin.timer(ctx, state.round, timer.purpose);
      break;
    }

    case 'presence': {
      if (state.status === 'finished') break;
      if (input.who === 'host') {
        if (input.connected) {
          if (state.hostDisconnectedAt === null) break;
          state.hostDisconnectedAt = null;
          log('Host đã kết nối lại');
        } else {
          state.hostDisconnectedAt = now;
          pause('host_disconnected');
          log('Host mất kết nối, trận tạm dừng');
        }
        break;
      }
      const p = state.players.find((x) => x.seat === input.who);
      if (!p) break;
      if (input.connected) {
        log(`${p.displayName} đã kết nối lại`);
        break;
      }
      log(`${p.displayName} mất kết nối`);
      if (
        state.settings.onTurnDisconnect === 'pause' &&
        !p.eliminated &&
        plugin.activeSeat(state.round) === p.seat
      ) {
        pause('player_disconnected');
      }
      break;
    }

    case 'host_timeout':
      if (state.status !== 'finished' && state.hostDisconnectedAt !== null) {
        ctx.intervention('abnormal_end', { hostDisconnectedAt: state.hostDisconnectedAt });
        finish('abnormal');
      }
      break;
  }

  if (changed) state.version = current.version + 1;
  return { state: changed ? state : current, effects, reply, changed };
}

export interface ViewInput {
  audience: 'host' | 'player' | 'spectator';
  seat: number | null;
  presence: Map<string, PresenceEntry>;
  media: Map<string, MediaView>;
  now: number;
}

/** Dựng trạng thái gửi cho từng đối tượng xem; ẩn đáp án và câu trả lời (BR-RT-01, BR-SPEC-03). */
export function buildMatchView(state: MatchState, input: ViewInput): MatchView {
  const plugin = roundPlugin(state.rounds[state.roundIndex]!.type);
  const players: MatchPlayerView[] = state.players.map((p) => {
    const entry = input.presence.get(p.key);
    return {
      seat: p.seat,
      displayName: p.displayName,
      kind: p.kind,
      score: p.score,
      roundScores: [...p.roundScores],
      connection: entry?.status ?? 'offline',
      disconnectedAt: entry?.status === 'disconnected' ? new Date(entry.since).toISOString() : null,
      eliminated: p.eliminated,
    };
  });
  return {
    matchId: state.matchId,
    roomId: state.roomId,
    version: state.version,
    audience: input.audience,
    mySeat: input.seat,
    status: state.status,
    endReason: state.endReason,
    pause: state.pause,
    rounds: state.rounds,
    roundIndex: state.roundIndex,
    roundFinished: plugin.finished(state.round),
    players,
    timer: state.timer
      ? {
          endsAt: state.timer.endsAt,
          durationMs: state.timer.durationMs,
          remainingMs: state.timer.remainingMs,
        }
      : null,
    round: plugin.view(state.round, {
      audience: input.audience,
      seat: input.seat,
      media: input.media,
    }),
    log: input.audience === 'host' ? state.log : [],
    serverTime: input.now,
  };
}

/** Media của câu hỏi đang hiển thị (để cấp URL đọc tạm thời). */
export function viewMediaIds(state: MatchState): string[] {
  return roundPlugin(state.rounds[state.roundIndex]!.type).mediaIds(state.round);
}
