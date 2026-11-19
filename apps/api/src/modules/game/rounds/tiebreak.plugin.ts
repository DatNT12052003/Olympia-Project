import {
  type AnswerResult,
  MatchErrorCode,
  type QuestionPhase,
  type SeatAnswerView,
  type TiebreakView,
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
  questionView,
  type SeatEntry,
  suggest,
} from './round-helpers';

/**
 * Câu hỏi phụ khi hòa điểm (9.3, DL-044): các Player dẫn đầu đang hòa giành quyền bằng chuông;
 * người trả lời đúng đầu tiên thắng. Sai thì mở chuông lại cho người còn lại; hết câu hỏi phụ mà
 * chưa ai đúng thì đồng hạng. Không cộng/trừ điểm. Câu hỏi lấy từ các câu chưa dùng của trận.
 */

const BUZZ_MS = 10_000;
const ANSWER_MS = 10_000;

interface TieQuestion {
  ref: string;
  question: MatchQuestion;
  phase: 'pending' | QuestionPhase;
  startedAt: number | null;
  answeringSeat: number | null;
  answers: Record<string, SeatEntry>;
  results: Record<string, AnswerResult>;
  attempted: number[];
}

export interface TiebreakState {
  seats: number[];
  list: string[];
  pos: number;
  current: string | null;
  questions: Record<string, TieQuestion>;
  winner: number | null;
  exhausted: boolean;
}

function currentQuestion(state: TiebreakState): TieQuestion {
  const q = state.current ? state.questions[state.current] : undefined;
  if (!q) {
    throw new MatchRuleError('Chưa có câu hỏi nào đang diễn ra.', MatchErrorCode.InvalidState);
  }
  return q;
}

function done(state: TiebreakState): boolean {
  return state.winner !== null || state.exhausted;
}

function openBuzzer(ctx: RoundContext, q: TieQuestion): void {
  q.phase = 'buzzing';
  q.answeringSeat = null;
  ctx.startTimer('buzz', BUZZ_MS);
}

function moveToNext(ctx: RoundContext, state: TiebreakState): void {
  if (state.pos + 1 >= state.list.length) {
    state.exhausted = true;
    state.current = null;
    ctx.log('Hết câu hỏi phụ: các Player hòa điểm đồng hạng');
    return;
  }
  state.pos += 1;
  state.current = state.list[state.pos]!;
  state.questions[state.current]!.phase = 'showing';
}

function judge(ctx: RoundContext, state: TiebreakState, seat: number, correct: boolean): void {
  const q = currentQuestion(state);
  if (q.phase !== 'answering' && q.phase !== 'judging') {
    throw new MatchRuleError('Câu hỏi không ở trạng thái chờ chấm.', MatchErrorCode.InvalidState);
  }
  if (q.answeringSeat !== seat) {
    throw new MatchRuleError(
      'Người này không có quyền trả lời câu hỏi.',
      MatchErrorCode.NotYourTurn,
    );
  }
  ctx.clearTimer();
  q.results[String(seat)] = correct ? 'correct' : 'wrong';
  if (correct) {
    state.winner = seat;
    q.phase = 'revealed';
    ctx.log(`${ctx.playerName(seat)} thắng câu hỏi phụ`);
    return;
  }
  ctx.log(`Câu hỏi phụ: ${ctx.playerName(seat)} trả lời sai`);
  const remaining = state.seats.filter((s) => !q.attempted.includes(s) && !ctx.isEliminated(s));
  if (remaining.length > 0) openBuzzer(ctx, q);
  else q.phase = 'revealed';
}

function autoVerdict(q: TieQuestion): boolean | null {
  if (q.answeringSeat === null) return null;
  const entry = q.answers[String(q.answeringSeat)];
  if (!entry) return false;
  return isDefinitive(entry.auto, q.question) ? entry.auto === 'correct' : null;
}

export const tiebreakPlugin: RoundPlugin<TiebreakState> = {
  type: 'tiebreak',

  requirement() {
    return { fixed: 0, perPlayer: 0 };
  },

  init({ questions, seats, roundIndex }) {
    const records: Record<string, TieQuestion> = {};
    const list = questions.map((question, i) => {
      const ref = `${roundIndex}.${i}`;
      records[ref] = {
        ref,
        question,
        phase: 'pending',
        startedAt: null,
        answeringSeat: null,
        answers: {},
        results: {},
        attempted: [],
      };
      return ref;
    });
    return {
      seats: [...seats],
      list,
      pos: -1,
      current: null,
      questions: records,
      winner: null,
      exhausted: list.length === 0,
    };
  },

  command(ctx, state, command) {
    switch (command.type) {
      case 'next_question':
        if (done(state)) {
          throw new MatchRuleError('Câu hỏi phụ đã kết thúc.', MatchErrorCode.InvalidState);
        }
        if (state.current && !FINAL_PHASES.has(currentQuestion(state).phase)) {
          throw new MatchRuleError(
            'Hãy chấm hoặc bỏ qua câu hiện tại trước khi chuyển câu.',
            MatchErrorCode.InvalidState,
          );
        }
        moveToNext(ctx, state);
        return;
      case 'start_timer': {
        const q = currentQuestion(state);
        if (q.phase !== 'showing') {
          throw new MatchRuleError(
            'Câu hỏi không ở trạng thái hiển thị.',
            MatchErrorCode.InvalidState,
          );
        }
        openBuzzer(ctx, q);
        return;
      }
      case 'judge':
        judge(ctx, state, command.seat, command.correct);
        return;
      case 'skip_question':
      case 'void_question': {
        const q = currentQuestion(state);
        if (FINAL_PHASES.has(q.phase)) {
          throw new MatchRuleError('Câu hỏi đã kết thúc.', MatchErrorCode.InvalidState);
        }
        ctx.clearTimer();
        q.phase = command.type === 'skip_question' ? 'skipped' : 'voided';
        q.answeringSeat = null;
        ctx.intervention(command.type, { questionRef: q.ref });
        ctx.log('Host bỏ qua câu hỏi phụ');
        return;
      }
      default:
        throw new MatchRuleError(
          'Lệnh không áp dụng cho câu hỏi phụ.',
          MatchErrorCode.InvalidState,
        );
    }
  },

  answer(ctx, state, seat, questionRef, answer, receivedAt) {
    const q = currentQuestion(state);
    assertRef(q.ref, questionRef);
    if (q.phase !== 'answering' || q.answeringSeat !== seat) {
      throw new MatchRuleError('Bạn không có quyền trả lời lúc này.', MatchErrorCode.NotYourTurn);
    }
    if (q.answers[String(seat)]) {
      throw new MatchRuleError('Bạn đã gửi đáp án cho câu này.', MatchErrorCode.AlreadyAnswered);
    }
    assertInTime(ctx, 'answer', receivedAt);
    assertAnswerShape(answer, q.question);
    const auto = suggest(answer, q.question);
    const elapsedMs = Math.max(0, receivedAt - (q.startedAt ?? receivedAt));
    q.answers[String(seat)] = { answer, receivedAt, elapsedMs, auto };
    ctx.recordAnswer({ questionRef: q.ref, seat, answer, autoResult: auto, receivedAt, elapsedMs });
    ctx.clearTimer();
    q.phase = 'judging';
    return { elapsedMs };
  },

  buzz(ctx, state, seat, questionRef, receivedAt) {
    const q = currentQuestion(state);
    assertRef(q.ref, questionRef);
    if (!state.seats.includes(seat)) {
      throw new MatchRuleError(
        'Chỉ Player đang hòa điểm được giành quyền.',
        MatchErrorCode.NotYourTurn,
      );
    }
    if (q.attempted.includes(seat)) {
      throw new MatchRuleError('Bạn đã trả lời câu này.', MatchErrorCode.AlreadyAnswered);
    }
    if (q.phase === 'answering' || q.phase === 'judging') return { won: false };
    if (q.phase !== 'buzzing') {
      throw new MatchRuleError('Chuông chưa mở.', MatchErrorCode.AnswerClosed);
    }
    assertInTime(ctx, 'buzz', receivedAt);
    q.answeringSeat = seat;
    q.attempted.push(seat);
    q.phase = 'answering';
    q.startedAt = ctx.now;
    ctx.startTimer('answer', ANSWER_MS);
    ctx.log(`${ctx.playerName(seat)} giành quyền trả lời câu hỏi phụ`);
    return { won: true };
  },

  timer(ctx, state, purpose) {
    const q = state.current ? state.questions[state.current] : undefined;
    if (purpose === 'auto') {
      if (q?.phase === 'showing') openBuzzer(ctx, q);
      else if ((!q || FINAL_PHASES.has(q.phase)) && !done(state)) moveToNext(ctx, state);
      return;
    }
    if (!q) return;
    if (purpose === 'answer' && q.phase === 'answering') {
      q.phase = 'judging';
    } else if (purpose === 'buzz' && q.phase === 'buzzing') {
      q.phase = 'revealed';
      ctx.log('Câu hỏi phụ: không ai giành quyền');
    }
  },

  auto(ctx, state) {
    if (ctx.timer() || done(state)) return false;
    const q = state.current ? state.questions[state.current] : undefined;
    if (!q) {
      moveToNext(ctx, state);
      return true;
    }
    const { readMs, revealMs } = autoDelays(ctx.settings);
    if (q.phase === 'showing') {
      ctx.startTimer('auto', readMs);
    } else if (q.phase === 'judging') {
      const verdict = autoVerdict(q);
      if (verdict === null || q.answeringSeat === null) return false;
      judge(ctx, state, q.answeringSeat, verdict);
      return true;
    } else if (FINAL_PHASES.has(q.phase)) {
      ctx.startTimer('auto', revealMs);
    }
    return false;
  },

  awaitingHost(state) {
    const q = state.current ? state.questions[state.current] : undefined;
    return q?.phase === 'judging' && autoVerdict(q) === null;
  },

  finished: done,

  activeSeat(state) {
    const q = state.current ? state.questions[state.current] : undefined;
    return q?.phase === 'answering' ? q.answeringSeat : null;
  },

  spare(state) {
    return state.list.slice(state.pos + 1).map((ref) => state.questions[ref]!.question);
  },

  mediaIds(state) {
    const q = state.current ? state.questions[state.current] : undefined;
    return q?.question.mediaId && q.phase !== 'pending' ? [q.question.mediaId] : [];
  },

  view(state, ctx): TiebreakView {
    const isHost = ctx.audience === 'host';
    const q = state.current ? state.questions[state.current] : undefined;
    let question: TiebreakView['question'] = null;
    if (q && q.phase !== 'pending') {
      const revealed = FINAL_PHASES.has(q.phase);
      const seats = new Set<number>([...q.attempted, ...Object.keys(q.answers).map(Number)]);
      const answers: SeatAnswerView[] = [...seats]
        .sort((a, b) => a - b)
        .map((seat) => {
          const entry = q.answers[String(seat)];
          const result = q.results[String(seat)];
          const visible = isHost || ctx.seat === seat || result !== undefined || revealed;
          return {
            seat,
            state: result ?? (entry ? 'answered' : 'none'),
            answer: entry && visible ? entry.answer : null,
            elapsedMs: entry && visible ? entry.elapsedMs : null,
            suggested: isHost ? (entry?.auto ?? null) : null,
          };
        });
      question = questionView({
        ref: q.ref,
        phase: q.phase,
        question: q.question,
        points: { correct: 0, wrong: 0 },
        answeringSeat: q.answeringSeat,
        answers,
        isHost,
        media: ctx.media,
      });
    }
    return {
      type: 'tiebreak',
      seats: [...state.seats],
      questionNo: q && q.phase !== 'pending' ? state.pos + 1 : 0,
      question,
      buzz:
        q && q.phase !== 'pending'
          ? {
              open: q.phase === 'buzzing',
              winnerSeat: q.answeringSeat,
              attemptedSeats: [...q.attempted],
            }
          : null,
      winnerSeat: state.winner,
      exhausted: state.exhausted,
    };
  },
};
