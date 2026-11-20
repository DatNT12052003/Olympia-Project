import {
  type AccelerationRules,
  type AccelerationView,
  type AnswerResult,
  MatchErrorCode,
  type QuestionPhase,
  type ScriptRound,
  type SeatAnswerView,
} from '@olympia/shared';
import type { MatchQuestion } from '../engine/match-state';
import {
  autoDelays,
  MatchRuleError,
  type RoundContext,
  type RoundPlugin,
} from '../engine/round-plugin';
import {
  assertAnswerShape,
  assertInTime,
  assertRef,
  FINAL_PHASES,
  isDefinitive,
  isSummarized,
  outcomesOf,
  questionView,
  type SeatEntry,
  suggest,
} from './round-helpers';

/**
 * Plugin vòng Tăng tốc (7.3): mọi Player cùng trả lời trong thời gian của câu; điểm theo thứ tự
 * trả lời đúng nhanh nhất, thời điểm tính theo server từ lúc câu bắt đầu (BR-R3-01); đúng cùng
 * mili-giây nhận cùng mức cao hơn (BR-R3-02). Kết thúc câu công bố đáp án và thời gian của từng
 * Player (BR-R3-03).
 */

interface AccQuestion {
  ref: string;
  question: MatchQuestion;
  phase: 'pending' | QuestionPhase;
  startedAt: number | null;
  answers: Record<string, SeatEntry>;
  /** Host chấm trước khi công bố (ghi đè gợi ý tự động). */
  verdicts: Record<string, 'correct' | 'wrong'>;
  results: Record<string, AnswerResult>;
  points: Record<string, number>;
  awards: { seat: number; delta: number }[];
}

export interface AccelerationState {
  rules: AccelerationRules;
  seats: number[];
  list: string[];
  reserves: string[];
  pos: number;
  done: boolean;
  current: string | null;
  questions: Record<string, AccQuestion>;
}

function rulesOf(round: ScriptRound): AccelerationRules {
  if (round.type !== 'acceleration') throw new Error('Không phải vòng Tăng tốc');
  return round.rules;
}

function currentQuestion(state: AccelerationState): AccQuestion {
  const q = state.current ? state.questions[state.current] : undefined;
  if (!q) {
    throw new MatchRuleError('Chưa có câu hỏi nào đang diễn ra.', MatchErrorCode.InvalidState);
  }
  return q;
}

function label(state: AccelerationState, q: AccQuestion): string {
  return `Câu ${state.list.indexOf(q.ref) + 1}`;
}

/** Ghế được trả lời: Player chưa bị loại khỏi trận. */
function playingSeats(ctx: RoundContext, state: AccelerationState): number[] {
  return state.seats.filter((seat) => !ctx.isEliminated(seat));
}

function verdictOf(q: AccQuestion, seat: number): 'correct' | 'wrong' | 'skipped' {
  const entry = q.answers[String(seat)];
  if (!entry) return 'skipped';
  return q.verdicts[String(seat)] ?? (entry.auto === 'correct' ? 'correct' : 'wrong');
}

/** Điểm theo thứ tự đúng nhanh nhất; cùng mili-giây cùng mức cao hơn (BR-R3-02). */
function rankPoints(
  rules: AccelerationRules,
  q: AccQuestion,
  seats: number[],
): Map<number, number> {
  const correct = seats
    .filter((seat) => verdictOf(q, seat) === 'correct')
    .map((seat) => ({ seat, elapsed: q.answers[String(seat)]!.elapsedMs }));
  const result = new Map<number, number>();
  for (const entry of correct) {
    const rank = correct.filter((other) => other.elapsed < entry.elapsed).length;
    result.set(entry.seat, rules.rankPoints[rank] ?? 0);
  }
  return result;
}

function revertAwards(ctx: RoundContext, q: AccQuestion, reason: string): void {
  for (const award of q.awards) ctx.award(award.seat, -award.delta, reason, q.ref, 'host');
  q.awards = [];
}

/** Áp kết quả và điểm cho mọi ghế của câu (công bố hoặc chấm lại). */
function score(
  ctx: RoundContext,
  state: AccelerationState,
  q: AccQuestion,
  actor: 'system' | 'host',
): void {
  const seats = playingSeats(ctx, state);
  const points = rankPoints(state.rules, q, seats);
  q.results = {};
  q.points = {};
  for (const seat of seats) {
    q.results[String(seat)] = verdictOf(q, seat);
    const value = points.get(seat) ?? 0;
    q.points[String(seat)] = value;
    if (value > 0) {
      const delta = ctx.award(seat, value, 'correct', q.ref, actor);
      if (delta !== 0) q.awards.push({ seat, delta });
    }
  }
}

function reveal(
  ctx: RoundContext,
  state: AccelerationState,
  q: AccQuestion,
  actor: 'system' | 'host',
): void {
  ctx.clearTimer();
  score(ctx, state, q, actor);
  q.phase = 'revealed';
  const winners = Object.entries(q.points)
    .filter(([, value]) => value > 0)
    .map(([seat, value]) => `${ctx.playerName(Number(seat))} +${value}`);
  ctx.log(
    `${label(state, q)}: ${winners.length > 0 ? winners.join(', ') : 'không ai trả lời đúng'}`,
  );
}

function startAnswering(ctx: RoundContext, state: AccelerationState, q: AccQuestion): void {
  q.phase = 'answering';
  q.startedAt = ctx.now;
  ctx.startTimer('answer', state.rules.timeSeconds * 1000);
}

function moveToNext(ctx: RoundContext, state: AccelerationState): void {
  if (state.pos + 1 >= state.list.length) {
    state.done = true;
    state.current = null;
    return;
  }
  state.pos += 1;
  state.current = state.list[state.pos]!;
  const q = state.questions[state.current]!;
  q.phase = 'showing';
  if (state.pos === 0) ctx.log('Bắt đầu vòng Tăng tốc');
}

/** Mọi câu trả lời đã có kết quả chắc chắn, không cần Host (BR-GAME-05). */
function allDefinitive(ctx: RoundContext, state: AccelerationState, q: AccQuestion): boolean {
  return playingSeats(ctx, state).every((seat) => {
    const entry = q.answers[String(seat)];
    return !entry || q.verdicts[String(seat)] !== undefined || isDefinitive(entry.auto, q.question);
  });
}

export const accelerationPlugin: RoundPlugin<AccelerationState> = {
  type: 'acceleration',

  requirement(round) {
    return { fixed: rulesOf(round).questionCount, perPlayer: 0 };
  },

  init({ round, questions, seats, roundIndex }) {
    const rules = rulesOf(round!);
    const refs = questions.map((_, i) => `${roundIndex}.${i}`);
    const records: Record<string, AccQuestion> = {};
    questions.forEach((question, i) => {
      const ref = refs[i]!;
      records[ref] = {
        ref,
        question,
        phase: 'pending',
        startedAt: null,
        answers: {},
        verdicts: {},
        results: {},
        points: {},
        awards: [],
      };
    });
    return {
      rules,
      seats: [...seats],
      list: refs.slice(0, rules.questionCount),
      reserves: refs.slice(rules.questionCount),
      pos: -1,
      done: false,
      current: null,
      questions: records,
    };
  },

  command(ctx, state, command) {
    switch (command.type) {
      case 'next_question': {
        if (state.current && !FINAL_PHASES.has(currentQuestion(state).phase)) {
          throw new MatchRuleError(
            'Hãy công bố hoặc bỏ qua câu hiện tại trước khi chuyển câu.',
            MatchErrorCode.InvalidState,
          );
        }
        if (state.done) {
          throw new MatchRuleError('Vòng thi đã hết câu hỏi.', MatchErrorCode.InvalidState);
        }
        moveToNext(ctx, state);
        return;
      }
      case 'start_timer': {
        const q = currentQuestion(state);
        if (q.phase !== 'showing') {
          throw new MatchRuleError(
            'Câu hỏi không ở trạng thái hiển thị.',
            MatchErrorCode.InvalidState,
          );
        }
        startAnswering(ctx, state, q);
        return;
      }
      case 'judge': {
        const q = currentQuestion(state);
        if (q.phase !== 'judging') {
          throw new MatchRuleError(
            'Chỉ chấm được sau khi khóa trả lời.',
            MatchErrorCode.InvalidState,
          );
        }
        if (!q.answers[String(command.seat)]) {
          throw new MatchRuleError('Người này chưa trả lời.', MatchErrorCode.InvalidState);
        }
        q.verdicts[String(command.seat)] = command.correct ? 'correct' : 'wrong';
        return;
      }
      case 'reveal': {
        const q = currentQuestion(state);
        if (q.phase !== 'judging' && q.phase !== 'answering') {
          throw new MatchRuleError('Câu hỏi không chờ công bố.', MatchErrorCode.InvalidState);
        }
        reveal(ctx, state, q, 'host');
        return;
      }
      case 'skip_question': {
        const q = currentQuestion(state);
        if (FINAL_PHASES.has(q.phase)) {
          throw new MatchRuleError('Câu hỏi đã kết thúc.', MatchErrorCode.InvalidState);
        }
        ctx.clearTimer();
        q.phase = 'skipped';
        ctx.intervention('skip_question', { questionRef: q.ref });
        ctx.log(`Host bỏ qua ${label(state, q).toLowerCase()}`);
        return;
      }
      case 'void_question': {
        const q = currentQuestion(state);
        ctx.clearTimer();
        revertAwards(ctx, q, 'void');
        const name = label(state, q);
        q.phase = 'voided';
        const replacement = state.reserves.shift();
        ctx.intervention('void_question', {
          questionRef: q.ref,
          replacementRef: replacement ?? null,
        });
        if (!replacement) {
          ctx.log(`Host hủy ${name.toLowerCase()} (không còn câu dự phòng)`);
          return;
        }
        state.list[state.pos] = replacement;
        state.current = replacement;
        state.questions[replacement]!.phase = 'showing';
        ctx.log(`Host hủy ${name.toLowerCase()}, thay bằng câu dự phòng`);
        return;
      }
      case 'regrade': {
        const q = state.questions[command.questionRef];
        if (!q || q.phase !== 'revealed' || !q.answers[String(command.seat)]) {
          throw new MatchRuleError(
            'Chỉ chấm lại được câu đã công bố của người đã trả lời.',
            MatchErrorCode.InvalidState,
          );
        }
        const before = q.results[String(command.seat)];
        const after = command.correct ? 'correct' : 'wrong';
        if (before === after) return;
        q.verdicts[String(command.seat)] = after;
        revertAwards(ctx, q, 'regrade');
        score(ctx, state, q, 'host');
        ctx.intervention('regrade', {
          questionRef: q.ref,
          seat: command.seat,
          before,
          after,
        });
        ctx.log(
          `Host chấm lại ${label(state, q).toLowerCase()} (${ctx.playerName(command.seat)}): ${before === 'correct' ? 'Đúng' : 'Sai'} → ${command.correct ? 'Đúng' : 'Sai'}`,
        );
        return;
      }
      default:
        throw new MatchRuleError(
          'Lệnh không áp dụng cho vòng Tăng tốc.',
          MatchErrorCode.InvalidState,
        );
    }
  },

  answer(ctx, state, seat, questionRef, answer, receivedAt) {
    const q = currentQuestion(state);
    assertRef(q.ref, questionRef);
    if (q.phase !== 'answering') {
      throw new MatchRuleError('Câu hỏi không nhận trả lời lúc này.', MatchErrorCode.AnswerClosed);
    }
    if (!state.seats.includes(seat)) {
      throw new MatchRuleError('Bạn không thi vòng này.', MatchErrorCode.NotYourTurn);
    }
    if (q.answers[String(seat)] && !state.rules.allowResubmit) {
      throw new MatchRuleError('Bạn đã gửi đáp án cho câu này.', MatchErrorCode.AlreadyAnswered);
    }
    assertInTime(ctx, 'answer', receivedAt);
    assertAnswerShape(answer, q.question);
    const auto = suggest(answer, q.question);
    const elapsedMs = Math.max(0, receivedAt - (q.startedAt ?? receivedAt));
    q.answers[String(seat)] = { answer, receivedAt, elapsedMs, auto };
    delete q.verdicts[String(seat)];
    ctx.recordAnswer({ questionRef: q.ref, seat, answer, autoResult: auto, receivedAt, elapsedMs });
    // Mọi người đã gửi (không cho sửa) thì khóa sớm.
    if (!state.rules.allowResubmit && playingSeats(ctx, state).every((s) => q.answers[String(s)])) {
      ctx.clearTimer();
      q.phase = 'judging';
    }
    return { elapsedMs };
  },

  buzz() {
    throw new MatchRuleError('Vòng Tăng tốc không bấm chuông.', MatchErrorCode.InvalidState);
  },

  timer(ctx, state, purpose) {
    const q = state.current ? state.questions[state.current] : undefined;
    if (purpose === 'auto') {
      if (q?.phase === 'showing') startAnswering(ctx, state, q);
      else if ((!q || FINAL_PHASES.has(q.phase)) && !state.done) moveToNext(ctx, state);
      return;
    }
    if (purpose === 'answer' && q?.phase === 'answering') {
      q.phase = 'judging';
      ctx.log(`${label(state, q)}: hết giờ`);
    }
  },

  auto(ctx, state) {
    if (ctx.timer()) return false;
    const q = state.current ? state.questions[state.current] : undefined;
    if (!q) {
      if (state.done) return false;
      moveToNext(ctx, state);
      return true;
    }
    const { readMs, revealMs } = autoDelays(ctx.settings);
    if (q.phase === 'showing') {
      ctx.startTimer('auto', readMs);
    } else if (q.phase === 'judging' && allDefinitive(ctx, state, q)) {
      reveal(ctx, state, q, 'system');
      return true;
    } else if (FINAL_PHASES.has(q.phase)) {
      ctx.startTimer('auto', revealMs);
    }
    return false;
  },

  awaitingHost(state) {
    const q = state.current ? state.questions[state.current] : undefined;
    if (q?.phase !== 'judging') return false;
    return Object.entries(q.answers).some(
      ([seat, entry]) => q.verdicts[seat] === undefined && !isDefinitive(entry.auto, q.question),
    );
  },

  finished(state) {
    return state.done;
  },

  activeSeat() {
    return null;
  },

  spare(state) {
    return state.reserves.map((ref) => state.questions[ref]!.question);
  },

  summary(state) {
    return Object.values(state.questions)
      .filter((q) => isSummarized(q.phase))
      .map((q) => ({
        ref: q.ref,
        question: q.question,
        outcomes: outcomesOf(q.results, q.answers),
      }));
  },

  mediaIds(state) {
    const q = state.current ? state.questions[state.current] : undefined;
    return q?.question.mediaId && q.phase !== 'pending' ? [q.question.mediaId] : [];
  },

  view(state, ctx): AccelerationView {
    const isHost = ctx.audience === 'host';
    const q = state.current ? state.questions[state.current] : undefined;
    let question: AccelerationView['question'] = null;
    if (q && q.phase !== 'pending') {
      const revealed = FINAL_PHASES.has(q.phase);
      const answers: SeatAnswerView[] = state.seats.map((seat) => {
        const entry = q.answers[String(seat)];
        const result = q.results[String(seat)];
        const visible = isHost || ctx.seat === seat || revealed;
        return {
          seat,
          state: result ?? (entry ? 'answered' : 'none'),
          answer: entry && visible ? entry.answer : null,
          elapsedMs: entry && visible ? entry.elapsedMs : null,
          suggested: isHost ? (entry?.auto ?? null) : null,
          verdict: isHost ? (q.verdicts[String(seat)] ?? null) : null,
          points: revealed ? (q.points[String(seat)] ?? null) : null,
        };
      });
      question = questionView({
        ref: q.ref,
        phase: q.phase,
        question: q.question,
        points: { correct: state.rules.rankPoints[0] ?? 0, wrong: 0 },
        answeringSeat: null,
        answers,
        isHost,
        media: ctx.media,
      });
    }
    return {
      type: 'acceleration',
      questionNo: q && q.phase !== 'pending' ? state.pos + 1 : 0,
      questionTotal: state.list.length,
      question,
      rankPoints: [...state.rules.rankPoints],
      allowResubmit: state.rules.allowResubmit,
      reserves: isHost ? state.reserves.length : 0,
    };
  },
};
