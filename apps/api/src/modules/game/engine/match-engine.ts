import {
  type HostCommand,
  MatchErrorCode,
  type MatchPlayerView,
  type MatchView,
  type MediaView,
  type PlayerAnswer,
  type PlayerChoice,
  ROUND_TITLES,
} from '@olympia/shared';
import { NotFoundError } from '../../../shared/errors/app-error';
import type { PresenceEntry } from '../../rooms/presence-store';
import type {
  EngineEffect,
  MatchEndReason,
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
 *
 * Chế độ tự động (8.4): sau mỗi đầu vào, engine cho plugin của vòng thực hiện bước tự động tiếp
 * theo (plugin đặt đồng hồ `auto` để chờ); vòng hết câu thì engine nghỉ giữa vòng (`break`) rồi
 * chuyển vòng, vào câu hỏi phụ khi hòa điểm hoặc kết thúc trận.
 */

export type EngineInput =
  | { type: 'command'; command: HostCommand }
  | { type: 'answer'; seat: number; questionRef: string; answer: PlayerAnswer; receivedAt: number }
  | { type: 'buzz'; seat: number; questionRef: string; receivedAt: number }
  | { type: 'choice'; seat: number; choice: PlayerChoice }
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
/** Số bước tự động tức thì tối đa trong một lần xử lý (chống vòng lặp vô hạn). */
const AUTO_STEP_LIMIT = 10;
/** Đồng hồ nghỉ giữa vòng của engine (chế độ tự động). */
const BREAK_TIMER = 'break';
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
  mode?: 'manual' | 'auto';
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
  const state: MatchState = {
    matchId: input.matchId,
    roomId: input.roomId,
    hostKey: input.hostKey,
    version: 1,
    status: 'running',
    endReason: null,
    mode: input.mode ?? 'manual',
    pause: null,
    hostDisconnectedAt: null,
    settings: snapshot.settings,
    rounds: snapshot.rounds.map(({ round }) => ({
      type: round.type,
      title: ROUND_TITLES[round.type],
    })),
    roundIndex: 0,
    round: roundPlugin(first.round.type).init({
      round: first.round,
      questions: first.questions,
      seats: players.map((p) => p.seat),
      roundIndex: 0,
      scores: Object.fromEntries(players.map((p) => [String(p.seat), 0])),
    }),
    players,
    timer: null,
    timerSeq: 0,
    scoreSeq: 0,
    log: [{ at: input.now, text: 'Bắt đầu trận' }],
    spare: [],
    tiebreakWinner: null,
  };
  if (state.mode === 'auto') {
    // Bước tự động đầu tiên (hiển thị câu 1...) chạy ngay khi trận bắt đầu.
    return applyInput(state, snapshot, { type: 'timer', timerId: '' }, input.now).state;
  }
  return state;
}

/** Ghế dẫn đầu (chưa bị loại) khi hòa điểm; rỗng nếu chỉ một người dẫn đầu. */
function tiedLeaders(state: MatchState): number[] {
  const active = state.players.filter((p) => !p.eliminated);
  if (active.length < 2) return [];
  const top = Math.max(...active.map((p) => p.score));
  const leaders = active.filter((p) => p.score === top).map((p) => p.seat);
  return leaders.length > 1 ? leaders : [];
}

/** Bước sau khi vòng hiện tại kết thúc (9.3, DL-044). */
function nextStepOf(state: MatchState): 'round' | 'tiebreak' | 'finish' {
  const current = state.rounds[state.roundIndex]!;
  const scriptRounds = state.rounds.filter((r) => r.type !== 'tiebreak').length;
  if (current.type !== 'tiebreak' && state.roundIndex + 1 < scriptRounds) return 'round';
  if (current.type === 'tiebreak') return 'finish';
  const spare = [...(state.spare ?? []), ...roundPlugin(current.type).spare(state.round)];
  if (
    (state.settings.tiebreakEnabled ?? true) &&
    spare.length > 0 &&
    tiedLeaders(state).length > 0
  ) {
    return 'tiebreak';
  }
  return 'finish';
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
  const auto = (state.mode ?? 'manual') === 'auto';

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
  const finish = (reason: MatchEndReason) => {
    state.status = 'finished';
    state.endReason = reason;
    state.pause = null;
    state.timer = null;
    effects.push({ kind: 'finished' });
    log(
      reason === 'completed'
        ? 'Trận đấu kết thúc'
        : reason === 'host'
          ? 'Host kết thúc trận'
          : 'Trận kết thúc bất thường (Host mất kết nối)',
    );
  };

  const ctx: RoundContext = {
    now,
    settings: state.settings,
    get roundIndex() {
      return state.roundIndex;
    },
    auto,
    activeSeats: () => state.players.filter((p) => !p.eliminated).map((p) => p.seat),
    isEliminated: (seat) => player(seat).eliminated,
    playerName: (seat) => state.players.find((p) => p.seat === seat)?.displayName ?? `Ghế ${seat}`,
    score: (seat) => player(seat).score,
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

  const plugin = () => roundPlugin(state.rounds[state.roundIndex]!.type);

  /** Chuyển sang vòng sau / câu hỏi phụ / kết thúc trận khi vòng hiện tại đã xong. */
  const advance = () => {
    const step = nextStepOf(state);
    if (step === 'finish') {
      const current = state.rounds[state.roundIndex]!;
      if (current.type === 'tiebreak') {
        state.tiebreakWinner = (state.round as { winner?: number | null }).winner ?? null;
      }
      finish('completed');
      return;
    }
    state.spare = [...(state.spare ?? []), ...plugin().spare(state.round)];
    state.timer = null;
    const scores = Object.fromEntries(state.players.map((p) => [String(p.seat), p.score]));
    if (step === 'round') {
      const nextIndex = state.roundIndex + 1;
      const next = snapshot.rounds[nextIndex]!;
      state.roundIndex = nextIndex;
      state.round = roundPlugin(next.round.type).init({
        round: next.round,
        questions: next.questions,
        seats: ctx.activeSeats(),
        roundIndex: nextIndex,
        scores,
      });
      log(`Bắt đầu vòng ${nextIndex + 1}: ${state.rounds[nextIndex]!.title}`);
      return;
    }
    const seats = tiedLeaders(state);
    state.rounds.push({ type: 'tiebreak', title: 'Câu hỏi phụ' });
    for (const p of state.players) p.roundScores.push(0);
    state.roundIndex = state.rounds.length - 1;
    state.round = roundPlugin('tiebreak').init({
      round: null,
      questions: state.spare,
      seats,
      roundIndex: state.roundIndex,
      scores,
    });
    state.spare = [];
    log(`Hòa điểm: ${seats.map((s) => ctx.playerName(s)).join(', ')} thi câu hỏi phụ`);
  };

  /** Chế độ tự động: cho plugin đi tiếp; vòng xong thì nghỉ giữa vòng rồi chuyển. */
  const runAuto = () => {
    for (let i = 0; i < AUTO_STEP_LIMIT; i += 1) {
      if (!auto || state.status !== 'running') return;
      const p = plugin();
      if (p.finished(state.round)) {
        if (!state.timer) {
          ctx.startTimer(BREAK_TIMER, Math.max(1, state.settings.breakSeconds) * 1000);
        }
        return;
      }
      if (!p.auto(ctx, state.round)) return;
    }
  };

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
        // Host can thiệp ở chế độ tự động (BR-GAME-06): bỏ bước tự động đang chờ để lập lại.
        if (state.timer?.purpose === 'auto' || state.timer?.purpose === BREAK_TIMER) {
          state.timer = null;
        }
        // `judge`, `regrade`... cập nhật trạng thái ngay cả khi không đổi điểm.
        changed = true;
        plugin().command(ctx, state.round, command);
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
        case 'end_match': {
          ctx.intervention('end_match', { roundIndex: state.roundIndex });
          const completed = plugin().finished(state.round) && nextStepOf(state) === 'finish';
          if (completed && state.rounds[state.roundIndex]!.type === 'tiebreak') {
            state.tiebreakWinner = (state.round as { winner?: number | null }).winner ?? null;
          }
          finish(completed ? 'completed' : 'host');
          break;
        }
        case 'next_round':
          if (!plugin().finished(state.round)) {
            throw new MatchRuleError('Vòng hiện tại chưa kết thúc.', MatchErrorCode.InvalidState);
          }
          advance();
          break;
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
      reply = plugin().answer(
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
      reply = plugin().buzz(ctx, state.round, input.seat, input.questionRef, input.receivedAt);
      break;
    }

    case 'choice': {
      assertPlaying();
      assertActivePlayer(input.seat);
      const p = plugin();
      if (!p.choose) {
        throw new MatchRuleError('Vòng này không có lựa chọn.', MatchErrorCode.InvalidState);
      }
      if (state.timer?.purpose === 'auto') state.timer = null;
      changed = true;
      p.choose(ctx, state.round, input.seat, input.choice);
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
      if (timer.purpose === BREAK_TIMER) {
        if (plugin().finished(state.round)) advance();
      } else {
        plugin().timer(ctx, state.round, timer.purpose);
      }
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
        plugin().activeSeat(state.round) === p.seat
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

  runAuto();

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
  const mode = state.mode ?? 'manual';
  const roundFinished = plugin.finished(state.round);
  return {
    matchId: state.matchId,
    roomId: state.roomId,
    version: state.version,
    audience: input.audience,
    mySeat: input.seat,
    mode,
    status: state.status,
    endReason: state.endReason,
    pause: state.pause,
    rounds: state.rounds,
    roundIndex: state.roundIndex,
    roundFinished,
    nextStep: nextStepOf(state),
    awaitingHost: mode === 'auto' && state.status === 'running' && plugin.awaitingHost(state.round),
    tiebreakWinner: state.tiebreakWinner ?? null,
    players,
    timer: state.timer
      ? {
          endsAt: state.timer.endsAt,
          durationMs: state.timer.durationMs,
          remainingMs: state.timer.remainingMs,
          purpose: state.timer.purpose,
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
