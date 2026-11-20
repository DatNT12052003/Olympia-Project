import {
  ANSWER_GRACE_MS,
  type AnswerResult,
  gradeAnswer,
  type HostCommand,
  MatchErrorCode,
  type MatchQuestionView,
  type PlayerAnswer,
  type QuestionPhase,
  type ScriptRound,
  type SeatAnswerView,
  type WarmupHistoryItem,
  type WarmupRules,
  type WarmupView,
  warmupRequirement,
} from '@olympia/shared';
import { BadRequestError } from '../../../shared/errors/app-error';
import type { MatchQuestion } from '../engine/match-state';
import {
  autoDelays,
  MatchRuleError,
  type RoundContext,
  type RoundPlugin,
  type ViewContext,
} from '../engine/round-plugin';
import { isDefinitive, isSummarized, outcomesOf } from './round-helpers';

/**
 * Plugin vòng Khởi động (7.1, DL-004): phần thi riêng (mỗi Player lần lượt trả lời câu của mình)
 * và phần thi chung (giành quyền bằng chuông). Chế độ thủ công: Host chuyển câu, bắt đầu tính
 * giờ/mở chuông và xác nhận đúng/sai; hệ thống gợi ý kết quả chấm tự động.
 */

type Part = 'individual' | 'shared';

interface SeatAnswer {
  answer: PlayerAnswer;
  receivedAt: number;
  elapsedMs: number;
  auto: 'correct' | 'wrong' | null;
}

interface QuestionRecord {
  ref: string;
  question: MatchQuestion;
  part: Part;
  ownerSeat: number | null;
  phase: 'pending' | QuestionPhase;
  /** Thời điểm bắt đầu nhận trả lời (để tính thời gian trả lời). */
  startedAt: number | null;
  answeringSeat: number | null;
  answers: Record<string, SeatAnswer>;
  results: Record<string, AnswerResult>;
  /** Điểm đã áp dụng cho câu này (để hủy câu/chấm lại). */
  awards: { seat: number; delta: number }[];
  attempted: number[];
}

export interface WarmupState {
  rules: WarmupRules;
  part: Part | 'done';
  /** Thứ tự ghế ở phần thi riêng. */
  order: number[];
  turn: number;
  /** Vị trí câu hiện tại trong danh sách của lượt/phần thi chung; -1 khi chưa bắt đầu. */
  pos: number;
  individual: Record<string, string[]>;
  shared: string[];
  reserves: string[];
  current: string | null;
  questions: Record<string, QuestionRecord>;
}

const FINAL_PHASES: ReadonlySet<QuestionRecord['phase']> = new Set([
  'revealed',
  'skipped',
  'voided',
]);

function rulesOf(round: ScriptRound): WarmupRules {
  if (round.type !== 'warmup') throw new Error('Không phải vòng Khởi động');
  return round.rules;
}

function currentQuestion(state: WarmupState): QuestionRecord {
  const q = state.current ? state.questions[state.current] : undefined;
  if (!q)
    throw new MatchRuleError('Chưa có câu hỏi nào đang diễn ra.', MatchErrorCode.InvalidState);
  return q;
}

function assertRef(q: QuestionRecord, ref: string): void {
  if (q.ref !== ref) {
    throw new MatchRuleError('Câu hỏi đã thay đổi.', MatchErrorCode.QuestionMismatch);
  }
}

function assertInTime(ctx: RoundContext, purpose: string, receivedAt: number): void {
  const timer = ctx.timer();
  if (
    timer?.purpose === purpose &&
    timer.endsAt !== null &&
    receivedAt > timer.endsAt + ANSWER_GRACE_MS
  ) {
    throw new MatchRuleError('Đã hết thời gian.', MatchErrorCode.AnswerClosed);
  }
}

function pointsOf(rules: WarmupRules, part: Part): { correct: number; wrong: number } {
  return part === 'individual'
    ? { correct: rules.individual.pointsCorrect, wrong: 0 }
    : { correct: rules.shared.pointsCorrect, wrong: rules.shared.pointsWrong };
}

/** Số thứ tự câu trong lượt / phần thi chung (từ 1). */
function numberOf(state: WarmupState, q: QuestionRecord): number {
  const list = q.part === 'shared' ? state.shared : (state.individual[String(q.ownerSeat)] ?? []);
  return list.indexOf(q.ref) + 1;
}

function questionLabel(state: WarmupState, q: QuestionRecord, ctx: RoundContext): string {
  const no = numberOf(state, q);
  return q.part === 'shared'
    ? `Câu ${no} thi chung`
    : `Câu ${no} của ${ctx.playerName(q.ownerSeat ?? 0)}`;
}

/** Áp kết quả chấm cho một ghế: cộng/trừ điểm theo luật và ghi kết quả. */
function applyResult(
  ctx: RoundContext,
  state: WarmupState,
  q: QuestionRecord,
  seat: number,
  correct: boolean,
  actor: 'system' | 'host',
): number {
  const points = pointsOf(state.rules, q.part);
  let delta = 0;
  if (correct) {
    delta = ctx.award(seat, points.correct, 'correct', q.ref, actor);
    q.results[String(seat)] = 'correct';
  } else {
    if (points.wrong > 0) delta = ctx.award(seat, -points.wrong, 'wrong', q.ref, actor);
    q.results[String(seat)] = q.answers[String(seat)] || q.part === 'shared' ? 'wrong' : 'skipped';
  }
  if (delta !== 0) q.awards.push({ seat, delta });
  return delta;
}

/** Hoàn lại điểm đã áp dụng của câu (toàn bộ hoặc một ghế). */
function revertAwards(ctx: RoundContext, q: QuestionRecord, reason: string, seat?: number): void {
  const keep: QuestionRecord['awards'] = [];
  for (const award of q.awards) {
    if (seat !== undefined && award.seat !== seat) {
      keep.push(award);
      continue;
    }
    ctx.award(award.seat, -award.delta, reason, q.ref, 'host');
  }
  q.awards = keep;
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function moveToNext(state: WarmupState, ctx: RoundContext): void {
  for (;;) {
    if (state.part === 'done') {
      state.current = null;
      return;
    }
    if (state.part === 'individual') {
      const seat = state.order[state.turn];
      if (seat === undefined) {
        state.part = state.rules.shared.enabled ? 'shared' : 'done';
        state.pos = -1;
        continue;
      }
      const list = state.individual[String(seat)] ?? [];
      if (ctx.isEliminated(seat) || state.pos + 1 >= list.length) {
        state.turn += 1;
        state.pos = -1;
        continue;
      }
      state.pos += 1;
      state.current = list[state.pos] ?? null;
    } else {
      if (state.pos + 1 >= state.shared.length) {
        state.part = 'done';
        continue;
      }
      state.pos += 1;
      state.current = state.shared[state.pos] ?? null;
    }
    const q = state.current ? state.questions[state.current] : undefined;
    if (!q) continue;
    q.phase = 'showing';
    if (q.part === 'individual' && state.pos === 0) {
      ctx.log(`Bắt đầu lượt của ${ctx.playerName(q.ownerSeat ?? 0)}`);
    }
    if (q.part === 'shared' && state.pos === 0) ctx.log('Bắt đầu phần thi chung');
    return;
  }
}

function openBuzzer(ctx: RoundContext, state: WarmupState, q: QuestionRecord): void {
  q.phase = 'buzzing';
  q.answeringSeat = null;
  ctx.startTimer('buzz', state.rules.shared.buzzSeconds * 1000);
}

/** Bắt đầu nhận trả lời (thi riêng) hoặc mở chuông (thi chung). */
function startQuestion(ctx: RoundContext, state: WarmupState, q: QuestionRecord): void {
  if (q.part === 'individual') {
    q.phase = 'answering';
    q.answeringSeat = q.ownerSeat;
    q.startedAt = ctx.now;
    ctx.startTimer('answer', state.rules.individual.timeSeconds * 1000);
  } else {
    openBuzzer(ctx, state, q);
  }
}

/** Chế độ tự động: kết quả chấm của người đang trả lời nếu chấm được mà không cần Host. */
function autoVerdict(state: WarmupState, q: QuestionRecord): boolean | null {
  if (state.rules.answerMode === 'verbal' || q.answeringSeat === null) return null;
  const entry = q.answers[String(q.answeringSeat)];
  // Hết giờ không trả lời: thi riêng tính bỏ qua, thi chung tính sai (DL-039).
  if (!entry) return false;
  return isDefinitive(entry.auto, q.question) ? entry.auto === 'correct' : null;
}

function judge(
  ctx: RoundContext,
  state: WarmupState,
  seat: number,
  correct: boolean,
  actor: 'system' | 'host' = 'host',
): void {
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
  const delta = applyResult(ctx, state, q, seat, correct, actor);
  ctx.log(
    `${questionLabel(state, q, ctx)}: ${ctx.playerName(seat)} ${correct ? 'đúng' : 'sai'}${delta !== 0 ? `, ${signed(delta)}` : ''}`,
  );
  if (q.part === 'shared' && !correct && state.rules.shared.afterWrong === 'reopen') {
    const remaining = ctx.activeSeats().filter((s) => !q.attempted.includes(s));
    if (remaining.length > 0) {
      openBuzzer(ctx, state, q);
      return;
    }
  }
  q.phase = 'revealed';
}

export const warmupPlugin: RoundPlugin<WarmupState> = {
  type: 'warmup',

  requirement(round) {
    return warmupRequirement(rulesOf(round));
  },

  init({ round, questions, seats, roundIndex }) {
    const rules = rulesOf(round!);
    const refs = questions.map((_, i) => `${roundIndex}.${i}`);
    const records: Record<string, QuestionRecord> = {};
    questions.forEach((question, i) => {
      const ref = refs[i]!;
      records[ref] = {
        ref,
        question,
        part: 'shared',
        ownerSeat: null,
        phase: 'pending',
        startedAt: null,
        answeringSeat: null,
        answers: {},
        results: {},
        awards: [],
        attempted: [],
      };
    });
    let next = 0;
    const individual: Record<string, string[]> = {};
    if (rules.individual.enabled) {
      for (const seat of seats) {
        const list = refs.slice(next, next + rules.individual.questionsPerPlayer);
        next += list.length;
        for (const ref of list) {
          records[ref]!.part = 'individual';
          records[ref]!.ownerSeat = seat;
        }
        individual[String(seat)] = list;
      }
    }
    const shared = rules.shared.enabled ? refs.slice(next, next + rules.shared.questionCount) : [];
    next += shared.length;
    return {
      rules,
      part: rules.individual.enabled ? 'individual' : 'shared',
      order: [...seats],
      turn: 0,
      pos: -1,
      individual,
      shared,
      reserves: refs.slice(next),
      current: null,
      questions: records,
    };
  },

  command(ctx, state, command: HostCommand) {
    switch (command.type) {
      case 'next_question': {
        if (state.current) {
          const q = currentQuestion(state);
          if (!FINAL_PHASES.has(q.phase)) {
            throw new MatchRuleError(
              'Hãy chấm hoặc bỏ qua câu hiện tại trước khi chuyển câu.',
              MatchErrorCode.InvalidState,
            );
          }
        }
        if (state.part === 'done') {
          throw new MatchRuleError('Vòng thi đã hết câu hỏi.', MatchErrorCode.InvalidState);
        }
        moveToNext(state, ctx);
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
        startQuestion(ctx, state, q);
        return;
      }
      case 'judge':
        judge(ctx, state, command.seat, command.correct);
        return;
      case 'skip_question': {
        const q = currentQuestion(state);
        if (FINAL_PHASES.has(q.phase)) {
          throw new MatchRuleError('Câu hỏi đã kết thúc.', MatchErrorCode.InvalidState);
        }
        ctx.clearTimer();
        q.phase = 'skipped';
        q.answeringSeat = null;
        ctx.intervention('skip_question', { questionRef: q.ref });
        ctx.log(`Host bỏ qua ${questionLabel(state, q, ctx).toLowerCase()}`);
        return;
      }
      case 'void_question': {
        const q = currentQuestion(state);
        ctx.clearTimer();
        revertAwards(ctx, q, 'void');
        const label = questionLabel(state, q, ctx);
        q.phase = 'voided';
        q.answeringSeat = null;
        const replacement = state.reserves.shift();
        ctx.intervention('void_question', {
          questionRef: q.ref,
          replacementRef: replacement ?? null,
        });
        if (!replacement) {
          ctx.log(`Host hủy ${label.toLowerCase()} (không còn câu dự phòng)`);
          return;
        }
        const list = q.part === 'shared' ? state.shared : state.individual[String(q.ownerSeat)];
        const index = list?.indexOf(q.ref) ?? -1;
        if (list && index >= 0) list[index] = replacement;
        const next = state.questions[replacement]!;
        next.part = q.part;
        next.ownerSeat = q.ownerSeat;
        next.phase = 'showing';
        state.current = replacement;
        ctx.log(`Host hủy ${label.toLowerCase()}, thay bằng câu dự phòng`);
        return;
      }
      case 'regrade': {
        const q = state.questions[command.questionRef];
        const before = q?.results[String(command.seat)];
        if (!q || before === undefined || q.phase !== 'revealed') {
          throw new MatchRuleError(
            'Chỉ chấm lại được câu đã chấm của người đã trả lời.',
            MatchErrorCode.InvalidState,
          );
        }
        const after: AnswerResult = command.correct ? 'correct' : 'wrong';
        if (before === after) return;
        revertAwards(ctx, q, 'regrade', command.seat);
        applyResult(ctx, state, q, command.seat, command.correct, 'host');
        ctx.intervention('regrade', {
          questionRef: q.ref,
          seat: command.seat,
          before,
          after: q.results[String(command.seat)],
        });
        ctx.log(
          `Host chấm lại ${questionLabel(state, q, ctx).toLowerCase()} (${ctx.playerName(command.seat)}): ${before === 'correct' ? 'Đúng' : 'Sai'} → ${command.correct ? 'Đúng' : 'Sai'}`,
        );
        return;
      }
      default:
        throw new MatchRuleError(
          'Lệnh không áp dụng cho vòng Khởi động.',
          MatchErrorCode.InvalidState,
        );
    }
  },

  answer(ctx, state, seat, questionRef, answer, receivedAt) {
    const q = currentQuestion(state);
    assertRef(q, questionRef);
    if (state.rules.answerMode === 'verbal') {
      throw new MatchRuleError(
        'Vòng này trả lời bằng lời, Host sẽ chấm.',
        MatchErrorCode.VerbalAnswer,
      );
    }
    if (q.phase !== 'answering') {
      throw new MatchRuleError('Câu hỏi không nhận trả lời lúc này.', MatchErrorCode.AnswerClosed);
    }
    if (q.answeringSeat !== seat) {
      throw new MatchRuleError('Chưa đến lượt bạn trả lời.', MatchErrorCode.NotYourTurn);
    }
    if (q.answers[String(seat)]) {
      throw new MatchRuleError('Bạn đã gửi đáp án cho câu này.', MatchErrorCode.AlreadyAnswered);
    }
    assertInTime(ctx, 'answer', receivedAt);
    const correct = q.question.answer;
    if (
      answer.type !== correct.type ||
      (answer.type === 'mcq' && correct.type === 'mcq' && answer.index >= correct.options.length)
    ) {
      throw new BadRequestError('Đáp án không đúng dạng câu hỏi.');
    }
    const graded = gradeAnswer(answer, correct);
    const auto = graded === null ? null : graded ? 'correct' : 'wrong';
    const elapsedMs = Math.max(0, receivedAt - (q.startedAt ?? receivedAt));
    q.answers[String(seat)] = { answer, receivedAt, elapsedMs, auto };
    ctx.recordAnswer({ questionRef: q.ref, seat, answer, autoResult: auto, receivedAt, elapsedMs });
    ctx.clearTimer();
    q.phase = 'judging';
    return { elapsedMs };
  },

  buzz(ctx, state, seat, questionRef, receivedAt) {
    const q = currentQuestion(state);
    assertRef(q, questionRef);
    if (q.part !== 'shared') {
      throw new MatchRuleError('Câu hỏi này không giành quyền.', MatchErrorCode.InvalidState);
    }
    if (q.attempted.includes(seat)) {
      throw new MatchRuleError('Bạn đã trả lời câu này.', MatchErrorCode.AlreadyAnswered);
    }
    // Người khác đã giành quyền trước (server quyết định theo thứ tự nhận, 8.5).
    if (q.phase === 'answering' || q.phase === 'judging') return { won: false };
    if (q.phase !== 'buzzing') {
      throw new MatchRuleError('Chuông chưa mở.', MatchErrorCode.AnswerClosed);
    }
    assertInTime(ctx, 'buzz', receivedAt);
    q.answeringSeat = seat;
    q.attempted.push(seat);
    q.phase = 'answering';
    q.startedAt = ctx.now;
    ctx.startTimer('answer', state.rules.shared.answerSeconds * 1000);
    ctx.log(
      `${ctx.playerName(seat)} giành quyền trả lời ${questionLabel(state, q, ctx).toLowerCase()}`,
    );
    return { won: true };
  },

  timer(ctx, state, purpose) {
    const q = state.current ? state.questions[state.current] : undefined;
    if (purpose === 'auto') {
      // Bước chờ của chế độ tự động: hết thời gian đọc → bắt đầu; hết thời gian xem đáp án → câu sau.
      if (q?.phase === 'showing') startQuestion(ctx, state, q);
      else if ((!q || FINAL_PHASES.has(q.phase)) && state.part !== 'done') moveToNext(state, ctx);
      return;
    }
    if (!q) return;
    if (purpose === 'answer' && q.phase === 'answering') {
      q.phase = 'judging';
      ctx.log(`${questionLabel(state, q, ctx)}: hết giờ trả lời`);
    } else if (purpose === 'buzz' && q.phase === 'buzzing') {
      q.phase = 'revealed';
      q.answeringSeat = null;
      ctx.log(`${questionLabel(state, q, ctx)}: không ai giành quyền`);
    }
  },

  auto(ctx, state) {
    if (ctx.timer()) return false;
    const q = state.current ? state.questions[state.current] : undefined;
    if (!q) {
      if (state.part === 'done') return false;
      moveToNext(state, ctx);
      return true;
    }
    const { readMs, revealMs } = autoDelays(ctx.settings);
    if (q.phase === 'showing') {
      ctx.startTimer('auto', readMs);
      return false;
    }
    if (q.phase === 'judging') {
      const verdict = autoVerdict(state, q);
      if (verdict === null || q.answeringSeat === null) return false;
      judge(ctx, state, q.answeringSeat, verdict, 'system');
      return true;
    }
    if (FINAL_PHASES.has(q.phase)) {
      ctx.startTimer('auto', revealMs);
    }
    return false;
  },

  awaitingHost(state) {
    const q = state.current ? state.questions[state.current] : undefined;
    if (!q) return false;
    if (state.rules.answerMode === 'verbal' && (q.phase === 'answering' || q.phase === 'judging')) {
      return true;
    }
    return q.phase === 'judging' && autoVerdict(state, q) === null;
  },

  spare(state) {
    return state.reserves.map((ref) => state.questions[ref]!.question);
  },

  finished(state) {
    return state.part === 'done';
  },

  activeSeat(state) {
    const q = state.current ? state.questions[state.current] : undefined;
    if (!q || FINAL_PHASES.has(q.phase)) return null;
    if (q.part === 'individual') return q.ownerSeat;
    return q.phase === 'answering' ? q.answeringSeat : null;
  },

  summary(state) {
    return Object.values(state.questions)
      .filter((q) => isSummarized(q.phase))
      .map((q) => ({
        ref: q.ref,
        question: q.question,
        outcomes: outcomesOf(
          q.results,
          q.answers,
          q.part === 'shared' ? q.attempted : [],
          q.phase === 'skipped' && q.ownerSeat !== null ? [q.ownerSeat] : [],
        ),
      }));
  },

  mediaIds(state) {
    const q = state.current ? state.questions[state.current] : undefined;
    return q?.question.mediaId && q.phase !== 'pending' ? [q.question.mediaId] : [];
  },

  view(state, ctx: ViewContext): WarmupView {
    const isHost = ctx.audience === 'host';
    const q = state.current ? state.questions[state.current] : undefined;
    let question: MatchQuestionView | null = null;
    if (q && q.phase !== 'pending') {
      const revealed = FINAL_PHASES.has(q.phase);
      const seats = new Set<number>([
        ...Object.keys(q.answers).map(Number),
        ...Object.keys(q.results).map(Number),
        ...q.attempted,
      ]);
      if (q.answeringSeat !== null) seats.add(q.answeringSeat);
      if (q.part === 'individual' && q.ownerSeat !== null) seats.add(q.ownerSeat);
      const answers: SeatAnswerView[] = [...seats]
        .sort((a, b) => a - b)
        .map((seat) => {
          const entry = q.answers[String(seat)];
          const result = q.results[String(seat)];
          // Nội dung trả lời: Host ngay; người khác khi đã chấm/công bố (BR-SPEC-03).
          const visible = isHost || ctx.seat === seat || result !== undefined || revealed;
          return {
            seat,
            state: result ?? (entry ? 'answered' : 'none'),
            answer: entry && visible ? entry.answer : null,
            elapsedMs: entry && visible ? entry.elapsedMs : null,
            suggested: isHost ? (entry?.auto ?? null) : null,
          };
        });
      const answer = q.question.answer;
      question = {
        ref: q.ref,
        phase: q.phase,
        content: q.question.content,
        answerType: answer.type,
        options: answer.type === 'mcq' ? answer.options : null,
        media: q.question.mediaId ? (ctx.media.get(q.question.mediaId) ?? null) : null,
        points: pointsOf(state.rules, q.part),
        // BR-RT-01: đáp án chỉ tới Host cho đến khi công bố.
        correctAnswer: isHost || revealed ? answer : null,
        explanation: isHost || revealed ? q.question.explanation : null,
        answeringSeat: q.answeringSeat,
        answers,
      };
    }

    const turnSeat = state.part === 'individual' ? (state.order[state.turn] ?? null) : null;
    const total =
      state.part === 'individual'
        ? (state.individual[String(turnSeat)]?.length ?? 0)
        : state.part === 'shared'
          ? state.shared.length
          : 0;

    const history: WarmupHistoryItem[] = [];
    if (isHost) {
      for (const record of Object.values(state.questions)) {
        if (record.phase !== 'revealed') continue;
        for (const [seat, result] of Object.entries(record.results)) {
          history.push({
            ref: record.ref,
            label:
              record.part === 'shared'
                ? `Thi chung · Câu ${numberOf(state, record)}`
                : `Thi riêng · Câu ${numberOf(state, record)}`,
            part: record.part,
            seat: Number(seat),
            answer: record.answers[seat]?.answer ?? null,
            result,
          });
        }
      }
      history.sort((a, b) => Number(b.ref.split('.')[1]) - Number(a.ref.split('.')[1]));
    }

    return {
      type: 'warmup',
      part: state.part,
      answerMode: state.rules.answerMode,
      turnSeat,
      questionNo: q && q.phase !== 'pending' ? numberOf(state, q) : 0,
      questionTotal: total,
      question,
      buzz:
        q && q.part === 'shared' && q.phase !== 'pending'
          ? {
              open: q.phase === 'buzzing',
              winnerSeat: q.answeringSeat,
              attemptedSeats: [...q.attempted],
            }
          : null,
      history: history.slice(0, 50),
      reserves: isHost ? state.reserves.length : 0,
    };
  },
};
