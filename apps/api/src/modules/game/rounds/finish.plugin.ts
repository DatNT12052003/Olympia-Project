import {
  type AnswerResult,
  type FinishPackItemView,
  type FinishRules,
  type FinishView,
  MatchErrorCode,
  type PlayerChoice,
  type QuestionPhase,
  type ScriptRound,
  type SeatAnswerView,
} from '@olympia/shared';
import { BadRequestError } from '../../../shared/errors/app-error';
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
  signed,
  suggest,
} from './round-helpers';

/**
 * Plugin vòng Về đích (7.4, DL-043): từng Player (điểm thấp thi trước hoặc theo vị trí) chọn gói
 * câu hỏi theo mức điểm, có thể đặt Ngôi sao hy vọng cho một câu (đúng ×2, sai trừ điểm câu).
 * Player chính sai/hết giờ thì các Player khác bấm chuông giành quyền: đúng nhận điểm câu (lấy
 * từ Player chính), sai bị trừ theo tỉ lệ cấu hình. Câu hỏi của gói lấy theo "Điểm mặc định" của
 * câu trong bộ đề, thiếu thì lấy câu chưa xếp mức.
 */

/** Chế độ tự động: thời gian Player đến lượt chọn gói. */
const CHOOSE_MS = 20_000;

interface PackItem {
  points: number;
  seconds: number;
  star: boolean;
  ref: string | null;
  state: FinishPackItemView['state'];
}

interface FinishQuestion {
  ref: string;
  question: MatchQuestion;
  phase: 'pending' | QuestionPhase;
  stage: 'main' | 'steal';
  mainSeat: number | null;
  points: number;
  star: boolean;
  startedAt: number | null;
  answeringSeat: number | null;
  answers: Record<string, SeatEntry>;
  /** Kết quả đã chấm của Player chính và người giành quyền. */
  mainResult: AnswerResult | null;
  steal: { seat: number; correct: boolean } | null;
  attempted: number[];
  awards: { seat: number; delta: number }[];
}

export interface FinishState {
  rules: FinishRules;
  order: number[];
  turn: number;
  phase: 'picking' | 'playing' | 'done';
  pack: PackItem[] | null;
  pos: number;
  /** Câu chưa dùng theo mức điểm (`"*"`: chưa xếp mức). */
  pools: Record<string, string[]>;
  questions: Record<string, FinishQuestion>;
  current: string | null;
}

function rulesOf(round: ScriptRound): FinishRules {
  if (round.type !== 'finish') throw new Error('Không phải vòng Về đích');
  return round.rules;
}

function turnSeat(state: FinishState): number | null {
  return state.phase === 'done' ? null : (state.order[state.turn] ?? null);
}

function currentQuestion(state: FinishState): FinishQuestion {
  const q = state.current ? state.questions[state.current] : undefined;
  if (!q) {
    throw new MatchRuleError('Chưa có câu hỏi nào đang diễn ra.', MatchErrorCode.InvalidState);
  }
  return q;
}

function currentItem(state: FinishState): PackItem | null {
  return state.pack?.[state.pos] ?? null;
}

function label(ctx: RoundContext, state: FinishState, q: FinishQuestion): string {
  return `Câu ${state.pos + 1} (${q.points} điểm) của ${ctx.playerName(q.mainSeat ?? 0)}`;
}

function availableCount(state: FinishState): number {
  return Object.values(state.pools).reduce((sum, list) => sum + list.length, 0);
}

/** Lấy câu theo mức điểm; thiếu thì lấy câu chưa xếp mức, rồi câu của mức khác. */
function takeQuestion(state: FinishState, points: number): string | null {
  const exact = state.pools[String(points)];
  if (exact && exact.length > 0) return exact.shift()!;
  const any = state.pools['*'];
  if (any && any.length > 0) return any.shift()!;
  for (const list of Object.values(state.pools)) {
    if (list.length > 0) return list.shift()!;
  }
  return null;
}

/** Sang lượt của Player tiếp theo (bỏ qua người đã bị loại khỏi trận). */
function nextTurn(ctx: RoundContext, state: FinishState, from: number): void {
  let turn = from;
  while (turn < state.order.length && ctx.isEliminated(state.order[turn]!)) turn += 1;
  state.turn = turn;
  state.pack = null;
  state.pos = -1;
  state.current = null;
  if (turn >= state.order.length) {
    state.phase = 'done';
    return;
  }
  state.phase = 'picking';
  ctx.log(`Lượt của ${ctx.playerName(state.order[turn]!)}: chọn gói câu hỏi`);
}

function pickPack(
  ctx: RoundContext,
  state: FinishState,
  seat: number,
  levels: number[],
  star: number | null,
  by: string,
): void {
  if (state.phase !== 'picking' || turnSeat(state) !== seat) {
    throw new MatchRuleError('Chưa đến lượt chọn gói.', MatchErrorCode.NotYourTurn);
  }
  if (levels.length !== state.rules.questionsPerPlayer) {
    throw new BadRequestError(`Hãy chọn đủ ${state.rules.questionsPerPlayer} câu.`);
  }
  const items: PackItem[] = levels.map((points) => {
    const level = state.rules.levels.find((l) => l.points === points);
    if (!level) throw new BadRequestError('Mức điểm không hợp lệ.');
    return { points, seconds: level.seconds, star: false, ref: null, state: 'pending' };
  });
  if (star !== null) {
    if (!state.rules.starEnabled || star >= items.length) {
      throw new BadRequestError('Không đặt được Ngôi sao hy vọng cho câu này.');
    }
    items[star]!.star = true;
  }
  if (availableCount(state) < items.length) {
    throw new MatchRuleError('Không đủ câu hỏi cho gói này.', MatchErrorCode.InvalidState);
  }
  state.pack = items;
  state.pos = -1;
  state.phase = 'playing';
  ctx.log(
    `${ctx.playerName(seat)} chọn gói ${levels.join(' · ')}${star !== null ? ` (Ngôi sao hy vọng câu ${star + 1})` : ''}${by}`,
  );
}

function setStar(state: FinishState, seat: number, star: number | null): void {
  if (state.phase !== 'playing' || turnSeat(state) !== seat || !state.pack) {
    throw new MatchRuleError('Chưa đến lượt của bạn.', MatchErrorCode.NotYourTurn);
  }
  if (!state.rules.starEnabled) {
    throw new BadRequestError('Vòng này không dùng Ngôi sao hy vọng.');
  }
  // Chỉ đổi được khi câu có sao (cũ và mới) chưa hiển thị; tối đa 1 lần mỗi lượt.
  const shown = (i: number) => state.pack![i]!.state !== 'pending';
  const previous = state.pack.findIndex((item) => item.star);
  if (previous >= 0 && shown(previous)) {
    throw new MatchRuleError('Bạn đã dùng Ngôi sao hy vọng.', MatchErrorCode.InvalidState);
  }
  if (star !== null && (star >= state.pack.length || shown(star))) {
    throw new BadRequestError('Chỉ đặt Ngôi sao hy vọng cho câu chưa hiển thị.');
  }
  state.pack.forEach((item, i) => (item.star = i === star));
}

function showNext(ctx: RoundContext, state: FinishState): void {
  if (!state.pack) return;
  if (state.pos + 1 >= state.pack.length) {
    nextTurn(ctx, state, state.turn + 1);
    return;
  }
  state.pos += 1;
  const item = state.pack[state.pos]!;
  const ref = takeQuestion(state, item.points);
  if (!ref) {
    item.state = 'voided';
    ctx.log('Hết câu hỏi cho gói, bỏ qua câu');
    showNext(ctx, state);
    return;
  }
  item.ref = ref;
  item.state = 'current';
  const q = state.questions[ref]!;
  Object.assign(q, {
    phase: 'showing',
    stage: 'main',
    mainSeat: turnSeat(state),
    points: item.points,
    star: item.star,
  });
  state.current = ref;
}

function startMain(ctx: RoundContext, state: FinishState, q: FinishQuestion): void {
  q.phase = 'answering';
  q.answeringSeat = q.mainSeat;
  q.startedAt = ctx.now;
  ctx.startTimer('answer', (currentItem(state)?.seconds ?? 15) * 1000);
}

function stealPenalty(state: FinishState, q: FinishQuestion): number {
  return Math.round((q.points * state.rules.steal.wrongPenaltyPercent) / 100);
}

function award(
  ctx: RoundContext,
  q: FinishQuestion,
  seat: number,
  nominal: number,
  reason: string,
  actor: 'system' | 'host',
): void {
  if (nominal === 0) return;
  const delta = ctx.award(seat, nominal, reason, q.ref, actor);
  if (delta !== 0) q.awards.push({ seat, delta });
}

/** Tính điểm của câu từ kết quả đã chấm (dùng cả khi chấm lại). */
function applyScores(
  state: FinishState,
  ctx: RoundContext,
  q: FinishQuestion,
  actor: 'system' | 'host',
): void {
  const main = q.mainSeat!;
  if (q.mainResult === 'correct') {
    award(ctx, q, main, q.star ? q.points * 2 : q.points, 'correct', actor);
  } else if (q.star) {
    award(ctx, q, main, -q.points, 'star_wrong', actor);
  }
  if (q.mainResult !== 'correct' && q.steal) {
    if (q.steal.correct) {
      award(ctx, q, q.steal.seat, q.points, 'steal', actor);
      if (state.rules.steal.takeFromMain) award(ctx, q, main, -q.points, 'stolen', actor);
    } else {
      award(ctx, q, q.steal.seat, -stealPenalty(state, q), 'steal_wrong', actor);
    }
  }
}

function itemState(q: FinishQuestion): FinishPackItemView['state'] {
  if (q.mainResult === 'correct') return 'correct';
  if (q.steal?.correct) return 'stolen';
  return q.mainResult === 'skipped' ? 'skipped' : 'wrong';
}

function finishQuestion(state: FinishState, q: FinishQuestion): void {
  q.phase = 'revealed';
  q.answeringSeat = null;
  const item = currentItem(state);
  if (item && item.ref === q.ref) item.state = itemState(q);
}

function judge(
  ctx: RoundContext,
  state: FinishState,
  seat: number,
  correct: boolean,
  actor: 'system' | 'host',
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
  if (q.stage === 'main') {
    const answered = state.rules.answerMode === 'verbal' || !!q.answers[String(seat)];
    q.mainResult = correct ? 'correct' : answered ? 'wrong' : 'skipped';
    applyScores(state, ctx, q, actor);
    ctx.log(
      `${label(ctx, state, q)}: ${correct ? 'đúng' : 'sai'}${q.star ? ' (Ngôi sao hy vọng)' : ''}`,
    );
    const others = ctx.activeSeats().filter((s) => s !== q.mainSeat);
    if (!correct && state.rules.steal.enabled && others.length > 0) {
      q.stage = 'steal';
      q.phase = 'buzzing';
      q.answeringSeat = null;
      ctx.startTimer('buzz', state.rules.steal.buzzSeconds * 1000);
      return;
    }
    finishQuestion(state, q);
    return;
  }
  // Giành quyền: chỉ một lượt.
  q.steal = { seat, correct };
  const before = q.awards.length;
  applyStealOnly(state, ctx, q, actor);
  ctx.log(
    `${ctx.playerName(seat)} giành quyền ${correct ? 'đúng' : 'sai'}: ${q.awards
      .slice(before)
      .map((a) => `${ctx.playerName(a.seat)} ${signed(a.delta)}`)
      .join(', ')}`,
  );
  finishQuestion(state, q);
}

function applyStealOnly(
  state: FinishState,
  ctx: RoundContext,
  q: FinishQuestion,
  actor: 'system' | 'host',
): void {
  const steal = q.steal!;
  if (steal.correct) {
    award(ctx, q, steal.seat, q.points, 'steal', actor);
    if (state.rules.steal.takeFromMain) award(ctx, q, q.mainSeat!, -q.points, 'stolen', actor);
  } else {
    award(ctx, q, steal.seat, -stealPenalty(state, q), 'steal_wrong', actor);
  }
}

/** Chế độ tự động: kết quả của người đang trả lời nếu chấm được mà không cần Host. */
function autoVerdict(state: FinishState, q: FinishQuestion): boolean | null {
  if (state.rules.answerMode === 'verbal' || q.answeringSeat === null) return null;
  const entry = q.answers[String(q.answeringSeat)];
  if (!entry) return false;
  return isDefinitive(entry.auto, q.question) ? entry.auto === 'correct' : null;
}

/** Gói mặc định khi hết thời gian chọn (chế độ tự động): mức thấp nhất, không dùng sao. */
function defaultPack(state: FinishState): number[] {
  const lowest = Math.min(...state.rules.levels.map((l) => l.points));
  return Array.from({ length: state.rules.questionsPerPlayer }, () => lowest);
}

export const finishPlugin: RoundPlugin<FinishState> = {
  type: 'finish',

  requirement(round) {
    return { fixed: 0, perPlayer: rulesOf(round).questionsPerPlayer };
  },

  init({ round, questions, seats, roundIndex, scores }) {
    const rules = rulesOf(round!);
    const order =
      rules.order === 'score_asc'
        ? [...seats].sort((a, b) => (scores[String(a)] ?? 0) - (scores[String(b)] ?? 0) || a - b)
        : [...seats];
    const levels = new Set(rules.levels.map((l) => l.points));
    const pools: Record<string, string[]> = { '*': [] };
    for (const level of levels) pools[String(level)] = [];
    const records: Record<string, FinishQuestion> = {};
    questions.forEach((question, i) => {
      const ref = `${roundIndex}.${i}`;
      records[ref] = {
        ref,
        question,
        phase: 'pending',
        stage: 'main',
        mainSeat: null,
        points: 0,
        star: false,
        startedAt: null,
        answeringSeat: null,
        answers: {},
        mainResult: null,
        steal: null,
        attempted: [],
        awards: [],
      };
      const key =
        question.defaultPoints != null && levels.has(question.defaultPoints)
          ? String(question.defaultPoints)
          : '*';
      pools[key]!.push(ref);
    });
    return {
      rules,
      order,
      turn: 0,
      phase: order.length > 0 ? 'picking' : 'done',
      pack: null,
      pos: -1,
      pools,
      questions: records,
      current: null,
    };
  },

  command(ctx, state, command) {
    switch (command.type) {
      case 'choose': {
        const seat = turnSeat(state);
        if (seat === null) {
          throw new MatchRuleError('Vòng thi đã kết thúc.', MatchErrorCode.InvalidState);
        }
        this.choose!(ctx, state, seat, command.choice);
        return;
      }
      case 'next_question': {
        if (state.phase === 'picking') {
          throw new MatchRuleError(
            'Player đến lượt chưa chọn gói câu hỏi.',
            MatchErrorCode.InvalidState,
          );
        }
        if (state.phase === 'done') {
          throw new MatchRuleError('Vòng thi đã hết câu hỏi.', MatchErrorCode.InvalidState);
        }
        if (state.current && !FINAL_PHASES.has(currentQuestion(state).phase)) {
          throw new MatchRuleError(
            'Hãy chấm hoặc bỏ qua câu hiện tại trước khi chuyển câu.',
            MatchErrorCode.InvalidState,
          );
        }
        showNext(ctx, state);
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
        startMain(ctx, state, q);
        return;
      }
      case 'judge':
        judge(ctx, state, command.seat, command.correct, 'host');
        return;
      case 'close_buzz': {
        const q = currentQuestion(state);
        if (q.phase !== 'buzzing') {
          throw new MatchRuleError('Chuông giành quyền không mở.', MatchErrorCode.InvalidState);
        }
        ctx.clearTimer();
        finishQuestion(state, q);
        ctx.log(`${label(ctx, state, q)}: không ai giành quyền`);
        return;
      }
      case 'skip_question': {
        const q = currentQuestion(state);
        if (FINAL_PHASES.has(q.phase)) {
          throw new MatchRuleError('Câu hỏi đã kết thúc.', MatchErrorCode.InvalidState);
        }
        ctx.clearTimer();
        q.phase = 'skipped';
        q.answeringSeat = null;
        const item = currentItem(state);
        if (item) item.state = 'skipped';
        ctx.intervention('skip_question', { questionRef: q.ref });
        ctx.log(`Host bỏ qua ${label(ctx, state, q).toLowerCase()}`);
        return;
      }
      case 'void_question': {
        const q = currentQuestion(state);
        const item = currentItem(state);
        ctx.clearTimer();
        for (const a of q.awards) ctx.award(a.seat, -a.delta, 'void', q.ref, 'host');
        q.awards = [];
        q.phase = 'voided';
        q.answeringSeat = null;
        const replacement = item ? takeQuestion(state, item.points) : null;
        ctx.intervention('void_question', {
          questionRef: q.ref,
          replacementRef: replacement,
        });
        if (!item || !replacement) {
          if (item) item.state = 'voided';
          ctx.log(`Host hủy ${label(ctx, state, q).toLowerCase()} (không còn câu dự phòng)`);
          return;
        }
        item.ref = replacement;
        const next = state.questions[replacement]!;
        Object.assign(next, {
          phase: 'showing',
          stage: 'main',
          mainSeat: q.mainSeat,
          points: q.points,
          star: q.star,
        });
        state.current = replacement;
        ctx.log(`Host hủy ${label(ctx, state, q).toLowerCase()}, thay bằng câu dự phòng`);
        return;
      }
      case 'regrade': {
        const q = state.questions[command.questionRef];
        if (!q || q.phase !== 'revealed') {
          throw new MatchRuleError('Chỉ chấm lại được câu đã chấm.', MatchErrorCode.InvalidState);
        }
        const isMain = command.seat === q.mainSeat;
        const isStealer = command.seat === q.steal?.seat;
        if (!isMain && !isStealer) {
          throw new MatchRuleError(
            'Người này không trả lời câu hỏi này.',
            MatchErrorCode.InvalidState,
          );
        }
        const before = isMain ? q.mainResult : q.steal!.correct ? 'correct' : 'wrong';
        const after = command.correct ? 'correct' : 'wrong';
        if (before === after) return;
        for (const a of q.awards) ctx.award(a.seat, -a.delta, 'regrade', q.ref, 'host');
        q.awards = [];
        if (isMain) {
          q.mainResult = after;
          // Player chính đúng thì không còn phần giành quyền.
          if (after === 'correct') q.steal = null;
        } else {
          q.steal = { seat: command.seat, correct: command.correct };
        }
        applyScores(state, ctx, q, 'host');
        const item = state.pack?.find((i) => i.ref === q.ref);
        if (item) item.state = itemState(q);
        ctx.intervention('regrade', { questionRef: q.ref, seat: command.seat, before, after });
        ctx.log(
          `Host chấm lại câu ${q.points} điểm (${ctx.playerName(command.seat)}): ${before === 'correct' ? 'Đúng' : 'Sai'} → ${command.correct ? 'Đúng' : 'Sai'}`,
        );
        return;
      }
      default:
        throw new MatchRuleError(
          'Lệnh không áp dụng cho vòng Về đích.',
          MatchErrorCode.InvalidState,
        );
    }
  },

  choose(ctx, state, seat, choice: PlayerChoice) {
    switch (choice.type) {
      case 'pack':
        pickPack(ctx, state, seat, choice.levels, choice.star, '');
        return;
      case 'star':
        setStar(state, seat, choice.star);
        return;
      default:
        throw new MatchRuleError('Hãy chọn gói câu hỏi.', MatchErrorCode.InvalidState);
    }
  },

  answer(ctx, state, seat, questionRef, answer, receivedAt) {
    const q = currentQuestion(state);
    assertRef(q.ref, questionRef);
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
    if (q.stage !== 'steal' || seat === q.mainSeat) {
      throw new MatchRuleError('Bạn không giành quyền được câu này.', MatchErrorCode.InvalidState);
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
    ctx.startTimer('answer', state.rules.steal.answerSeconds * 1000);
    ctx.log(`${ctx.playerName(seat)} giành quyền trả lời ${label(ctx, state, q).toLowerCase()}`);
    return { won: true };
  },

  timer(ctx, state, purpose) {
    const q = state.current ? state.questions[state.current] : undefined;
    if (purpose === 'choose') {
      const seat = turnSeat(state);
      if (state.phase === 'picking' && seat !== null) {
        pickPack(ctx, state, seat, defaultPack(state), null, ' (hết thời gian chọn)');
      }
      return;
    }
    if (purpose === 'auto') {
      if (q?.phase === 'showing') startMain(ctx, state, q);
      else if (state.phase === 'playing' && (!q || FINAL_PHASES.has(q.phase))) showNext(ctx, state);
      return;
    }
    if (!q) return;
    if (purpose === 'answer' && q.phase === 'answering') {
      q.phase = 'judging';
      ctx.log(`${label(ctx, state, q)}: hết giờ trả lời`);
    } else if (purpose === 'buzz' && q.phase === 'buzzing') {
      finishQuestion(state, q);
      ctx.log(`${label(ctx, state, q)}: không ai giành quyền`);
    }
  },

  auto(ctx, state) {
    if (ctx.timer() || state.phase === 'done') return false;
    if (state.phase === 'picking') {
      ctx.startTimer('choose', CHOOSE_MS);
      return false;
    }
    const q = state.current ? state.questions[state.current] : undefined;
    if (!q) {
      showNext(ctx, state);
      return true;
    }
    const { readMs, revealMs } = autoDelays(ctx.settings);
    if (q.phase === 'showing') {
      ctx.startTimer('auto', readMs);
    } else if (q.phase === 'judging') {
      const verdict = autoVerdict(state, q);
      if (verdict === null || q.answeringSeat === null) return false;
      judge(ctx, state, q.answeringSeat, verdict, 'system');
      return true;
    } else if (FINAL_PHASES.has(q.phase)) {
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

  finished(state) {
    return state.phase === 'done';
  },

  activeSeat(state) {
    if (state.phase === 'picking') return turnSeat(state);
    const q = state.current ? state.questions[state.current] : undefined;
    if (!q || FINAL_PHASES.has(q.phase)) return null;
    return q.stage === 'main' ? q.mainSeat : q.answeringSeat;
  },

  spare(state) {
    return Object.values(state.pools)
      .flat()
      .map((ref) => state.questions[ref]!.question);
  },

  mediaIds(state) {
    const q = state.current ? state.questions[state.current] : undefined;
    return q?.question.mediaId && q.phase !== 'pending' ? [q.question.mediaId] : [];
  },

  view(state, ctx): FinishView {
    const isHost = ctx.audience === 'host';
    const q = state.current ? state.questions[state.current] : undefined;
    let question: FinishView['question'] = null;
    if (q && q.phase !== 'pending') {
      const revealed = FINAL_PHASES.has(q.phase);
      const seats = new Set<number>([...Object.keys(q.answers).map(Number), ...q.attempted]);
      if (q.mainSeat !== null) seats.add(q.mainSeat);
      if (q.answeringSeat !== null) seats.add(q.answeringSeat);
      const answers: SeatAnswerView[] = [...seats]
        .sort((a, b) => a - b)
        .map((seat) => {
          const entry = q.answers[String(seat)];
          const result: AnswerResult | undefined =
            seat === q.mainSeat
              ? (q.mainResult ?? undefined)
              : seat === q.steal?.seat
                ? q.steal.correct
                  ? 'correct'
                  : 'wrong'
                : undefined;
          const visible = isHost || ctx.seat === seat || result !== undefined || revealed;
          const points = q.awards
            .filter((a) => a.seat === seat)
            .reduce((sum, a) => sum + a.delta, 0);
          return {
            seat,
            state: result ?? (entry ? 'answered' : 'none'),
            answer: entry && visible ? entry.answer : null,
            elapsedMs: entry && visible ? entry.elapsedMs : null,
            suggested: isHost ? (entry?.auto ?? null) : null,
            points: result !== undefined ? points : null,
          };
        });
      question = questionView({
        ref: q.ref,
        phase: q.phase,
        question: q.question,
        points: {
          correct: q.star ? q.points * 2 : q.points,
          wrong: q.star ? q.points : 0,
        },
        answeringSeat: q.answeringSeat,
        answers,
        isHost,
        media: ctx.media,
      });
    }
    const available: Record<string, number> = {};
    if (isHost) {
      for (const [key, list] of Object.entries(state.pools)) available[key] = list.length;
    }
    return {
      type: 'finish',
      phase: state.phase,
      answerMode: state.rules.answerMode,
      order: [...state.order],
      turn: state.turn,
      turnSeat: turnSeat(state),
      levels: state.rules.levels.map((l) => ({ points: l.points, seconds: l.seconds })),
      questionsPerPlayer: state.rules.questionsPerPlayer,
      starEnabled: state.rules.starEnabled,
      pack: state.pack
        ? state.pack.map((item) => ({
            points: item.points,
            seconds: item.seconds,
            star: item.star,
            state: item.state,
          }))
        : null,
      questionNo: state.pack && state.pos >= 0 ? state.pos + 1 : 0,
      question,
      steal:
        q && q.stage === 'steal'
          ? {
              open: q.phase === 'buzzing',
              winnerSeat: q.steal?.seat ?? (q.phase === 'buzzing' ? null : q.answeringSeat),
              attemptedSeats: [...q.attempted],
              points: q.points,
              penalty: stealPenalty(state, q),
            }
          : null,
      stealEnabled: state.rules.steal.enabled,
      available,
    };
  },
};
