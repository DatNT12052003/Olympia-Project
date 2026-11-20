import {
  type AnswerResult,
  gradeAnswer,
  letterCount,
  MatchErrorCode,
  obstacleKeywordPoints,
  type ObstacleRowView,
  type ObstacleRules,
  type ObstacleView,
  type QuestionPhase,
  type ScriptRound,
  type SeatAnswerView,
} from '@olympia/shared';
import { BadRequestError } from '../../../shared/errors/app-error';
import type { MatchQuestion, QuestionSummary } from '../engine/match-state';
import {
  autoDelays,
  MatchRuleError,
  type RoundContext,
  type RoundPlugin,
} from '../engine/round-plugin';
import {
  answerText,
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
 * Plugin vòng Vượt chướng ngại vật (7.2, DL-041). Câu hỏi theo thứ tự trong bộ đề: từ khóa CNV
 * (media là ảnh nền), các hàng ngang, ô trung tâm. Mỗi hàng: mọi Player còn thi cùng ghi đáp án
 * (gửi lại ghi đè), Host chấm rồi công bố; hàng công bố xong mở mảnh ảnh tương ứng (BR-R2-03).
 * Player đoán từ khóa bất kỳ lúc nào; Host xác nhận (BR-R2-01); đoán sai bị loại khỏi phần còn
 * lại của vòng.
 */

/** Chế độ tự động: thời gian Player đến lượt chọn hàng. */
const CHOOSE_MS = 15_000;
/** Chế độ tự động: thời gian chờ đoán từ khóa sau khi đã mở hết các ô. */
const LAST_CALL_MS = 15_000;

interface ObstacleCell {
  ref: string;
  index: number;
  kind: 'row' | 'center';
  question: MatchQuestion;
  status: ObstacleRowView['status'];
  phase: 'pending' | QuestionPhase;
  startedAt: number | null;
  answers: Record<string, SeatEntry>;
  verdicts: Record<string, 'correct' | 'wrong'>;
  results: Record<string, AnswerResult>;
  awards: { seat: number; delta: number }[];
}

interface KeywordGuess {
  seat: number;
  text: string;
  receivedAt: number;
  points: number;
  auto: 'correct' | 'wrong' | null;
  state: 'pending' | 'correct' | 'wrong' | 'cancelled';
}

export interface ObstacleState {
  rules: ObstacleRules;
  keywordRef: string;
  keyword: MatchQuestion;
  cells: ObstacleCell[];
  pieces: boolean[];
  /** Thứ tự ghế chọn hàng và vị trí lượt. */
  seats: number[];
  turn: number;
  /** Chỉ số ô đang/vừa thi (0-based) hoặc `null`. */
  current: number | null;
  out: number[];
  guesses: KeywordGuess[];
  solvedBy: number | null;
  keywordRevealed: boolean;
  done: boolean;
  /** Câu dư (không dùng trong bảng). */
  extra: MatchQuestion[];
  /** Chế độ tự động: đã chờ hết thời gian đoán cuối. */
  lastCall: boolean;
}

function rulesOf(round: ScriptRound): ObstacleRules {
  if (round.type !== 'obstacle') throw new Error('Không phải vòng Vượt chướng ngại vật');
  return round.rules;
}

function cellLabel(cell: ObstacleCell): string {
  return cell.kind === 'center' ? 'Ô trung tâm' : `Hàng ${cell.index}`;
}

function currentCell(state: ObstacleState): ObstacleCell | null {
  return state.current === null ? null : (state.cells[state.current] ?? null);
}

function requireActiveCell(state: ObstacleState): ObstacleCell {
  const cell = currentCell(state);
  if (!cell || FINAL_PHASES.has(cell.phase)) {
    throw new MatchRuleError('Chưa có hàng nào đang thi.', MatchErrorCode.InvalidState);
  }
  return cell;
}

/** Ghế còn thi vòng này (chưa bị loại khỏi trận, chưa đoán sai từ khóa). */
function inRound(ctx: RoundContext, state: ObstacleState): number[] {
  return state.seats.filter((seat) => !ctx.isEliminated(seat) && !state.out.includes(seat));
}

function rowActive(state: ObstacleState): boolean {
  const cell = currentCell(state);
  return !!cell && !FINAL_PHASES.has(cell.phase);
}

function nextClosed(state: ObstacleState): ObstacleCell | null {
  return (
    state.cells.find((c) => c.kind === 'row' && c.status === 'closed') ??
    state.cells.find((c) => c.kind === 'center' && c.status === 'closed') ??
    null
  );
}

function phaseOf(state: ObstacleState): ObstacleView['phase'] {
  if (state.done) return 'done';
  if (rowActive(state)) return 'row';
  return nextClosed(state) ? 'choosing' : 'keyword';
}

/** Player đến lượt chọn hàng (chỉ khi chọn theo lượt và còn hàng ngang chưa mở). */
function turnSeat(state: ObstacleState): number | null {
  if (state.rules.rowSelection !== 'player' || state.done || rowActive(state)) return null;
  if (!state.cells.some((c) => c.kind === 'row' && c.status === 'closed')) return null;
  for (let i = 0; i < state.seats.length; i += 1) {
    const seat = state.seats[(state.turn + i) % state.seats.length]!;
    if (!state.out.includes(seat)) return seat;
  }
  return null;
}

function openedRows(state: ObstacleState): number {
  return state.cells.filter((c) => c.kind === 'row' && c.status !== 'closed').length;
}

function centerOpened(state: ObstacleState): boolean {
  return state.cells.some((c) => c.kind === 'center' && c.status !== 'closed');
}

function keywordPoints(state: ObstacleState): number {
  return obstacleKeywordPoints(state.rules, openedRows(state), centerOpened(state));
}

function openCell(ctx: RoundContext, state: ObstacleState, cell: ObstacleCell, by: string): void {
  state.current = state.cells.indexOf(cell);
  cell.status = 'active';
  cell.phase = 'showing';
  ctx.log(`${cellLabel(cell)} được mở${by}`);
}

/** Chọn hàng: Player đến lượt (hoặc Host chọn thay) / mở theo thứ tự. */
function selectRow(ctx: RoundContext, state: ObstacleState, row: number, by: string): void {
  if (state.done || rowActive(state)) {
    throw new MatchRuleError('Không chọn hàng được lúc này.', MatchErrorCode.InvalidState);
  }
  const cell = state.cells.find((c) => c.kind === 'row' && c.index === row);
  if (!cell || cell.status !== 'closed') {
    throw new MatchRuleError('Hàng này đã được mở.', MatchErrorCode.InvalidState);
  }
  const chooser = turnSeat(state);
  if (chooser !== null) {
    state.turn = (state.seats.indexOf(chooser) + 1) % state.seats.length;
  }
  openCell(ctx, state, cell, by);
}

function startAnswering(ctx: RoundContext, state: ObstacleState, cell: ObstacleCell): void {
  cell.phase = 'answering';
  cell.startedAt = ctx.now;
  ctx.startTimer('answer', state.rules.rowSeconds * 1000);
}

function verdictOf(cell: ObstacleCell, seat: number): AnswerResult {
  const entry = cell.answers[String(seat)];
  if (!entry) return 'skipped';
  return cell.verdicts[String(seat)] ?? (entry.auto === 'correct' ? 'correct' : 'wrong');
}

function revertAwards(ctx: RoundContext, cell: ObstacleCell, reason: string): void {
  for (const award of cell.awards) ctx.award(award.seat, -award.delta, reason, cell.ref, 'host');
  cell.awards = [];
}

function score(
  ctx: RoundContext,
  state: ObstacleState,
  cell: ObstacleCell,
  actor: 'system' | 'host',
): number {
  cell.results = {};
  let correct = 0;
  for (const seat of inRound(ctx, state)) {
    const result = verdictOf(cell, seat);
    cell.results[String(seat)] = result;
    if (result !== 'correct') continue;
    correct += 1;
    if (state.rules.rowPoints > 0) {
      const delta = ctx.award(seat, state.rules.rowPoints, 'correct', cell.ref, actor);
      if (delta !== 0) cell.awards.push({ seat, delta });
    }
  }
  return correct;
}

/** Công bố kết quả hàng: điểm, trạng thái giải được, mở mảnh ảnh (BR-R2-03). */
function revealCell(
  ctx: RoundContext,
  state: ObstacleState,
  cell: ObstacleCell,
  actor: 'system' | 'host',
): void {
  ctx.clearTimer();
  const correct = score(ctx, state, cell, actor);
  cell.phase = 'revealed';
  cell.status = correct > 0 ? 'solved' : 'unsolved';
  state.pieces[state.cells.indexOf(cell)] = true;
  ctx.log(
    `${cellLabel(cell)}: ${correct > 0 ? `${correct} người trả lời đúng` : 'không ai trả lời đúng'}`,
  );
}

/** Kết thúc phần bảng: hàng đang dở bỏ qua, các lượt đoán chờ bị hủy, mở toàn bộ ảnh. */
function closeBoard(ctx: RoundContext, state: ObstacleState): void {
  ctx.clearTimer();
  const cell = currentCell(state);
  if (cell && !FINAL_PHASES.has(cell.phase)) {
    cell.phase = 'skipped';
    cell.status = 'unsolved';
  }
  for (const guess of state.guesses) {
    if (guess.state === 'pending') guess.state = 'cancelled';
  }
  state.pieces = state.pieces.map(() => true);
  state.keywordRevealed = true;
  state.done = true;
}

function judgeKeyword(
  ctx: RoundContext,
  state: ObstacleState,
  seat: number,
  correct: boolean,
): void {
  const guess = state.guesses.find((g) => g.seat === seat && g.state === 'pending');
  if (!guess) {
    throw new MatchRuleError('Người này không có lượt đoán chờ chấm.', MatchErrorCode.InvalidState);
  }
  if (correct) {
    guess.state = 'correct';
    ctx.award(seat, guess.points, 'keyword', state.keywordRef, 'host');
    state.solvedBy = seat;
    closeBoard(ctx, state);
    ctx.log(`${ctx.playerName(seat)} giải được chướng ngại vật, +${guess.points}`);
    return;
  }
  guess.state = 'wrong';
  state.out.push(seat);
  // Bị loại khỏi phần còn lại của vòng: bỏ đáp án hàng đang thi (nếu chưa công bố).
  const cell = currentCell(state);
  if (cell && !FINAL_PHASES.has(cell.phase)) {
    delete cell.answers[String(seat)];
    delete cell.verdicts[String(seat)];
  }
  ctx.log(`${ctx.playerName(seat)} đoán sai chướng ngại vật, bị loại khỏi vòng`);
}

/** Mọi đáp án hàng có kết quả chắc chắn (hàng ngang là trả lời ngắn: chỉ khớp mới chắc chắn). */
function allDefinitive(ctx: RoundContext, state: ObstacleState, cell: ObstacleCell): boolean {
  return inRound(ctx, state).every((seat) => {
    const entry = cell.answers[String(seat)];
    return (
      !entry || cell.verdicts[String(seat)] !== undefined || isDefinitive(entry.auto, cell.question)
    );
  });
}

export const obstaclePlugin: RoundPlugin<ObstacleState> = {
  type: 'obstacle',

  requirement(round) {
    const rules = rulesOf(round);
    return { fixed: 1 + rules.rowCount + (rules.centerEnabled ? 1 : 0), perPlayer: 0 };
  },

  validate(round, questions) {
    const needed = this.requirement(round).fixed;
    const index = questions.slice(0, needed).findIndex((q) => q.answer.type !== 'short_answer');
    if (index < 0) return null;
    return `Câu ${index + 1} của vòng Vượt chướng ngại vật phải là câu trả lời ngắn (từ khóa, hàng ngang và ô trung tâm).`;
  },

  init({ round, questions, seats, roundIndex }) {
    const rules = rulesOf(round!);
    const keyword = questions[0]!;
    const cells: ObstacleCell[] = [];
    const count = rules.rowCount + (rules.centerEnabled ? 1 : 0);
    for (let i = 0; i < count; i += 1) {
      const isCenter = i === rules.rowCount;
      cells.push({
        ref: `${roundIndex}.${i + 1}`,
        index: i + 1,
        kind: isCenter ? 'center' : 'row',
        question: questions[i + 1]!,
        status: 'closed',
        phase: 'pending',
        startedAt: null,
        answers: {},
        verdicts: {},
        results: {},
        awards: [],
      });
    }
    return {
      rules,
      keywordRef: `${roundIndex}.0`,
      keyword,
      cells,
      pieces: cells.map(() => false),
      seats: [...seats],
      turn: 0,
      current: null,
      out: [],
      guesses: [],
      solvedBy: null,
      keywordRevealed: false,
      done: false,
      extra: questions.slice(count + 1),
      lastCall: false,
    };
  },

  command(ctx, state, command) {
    switch (command.type) {
      case 'choose': {
        if (command.choice.type !== 'row') {
          throw new MatchRuleError('Hãy chọn một hàng ngang.', MatchErrorCode.InvalidState);
        }
        selectRow(ctx, state, command.choice.row, ' (Host chọn)');
        return;
      }
      case 'next_question': {
        if (state.done || rowActive(state)) {
          throw new MatchRuleError(
            'Hãy công bố kết quả hàng hiện tại trước.',
            MatchErrorCode.InvalidState,
          );
        }
        const cell = nextClosed(state);
        if (!cell) {
          throw new MatchRuleError(
            'Đã mở hết các hàng. Chờ đoán từ khóa hoặc công bố từ khóa.',
            MatchErrorCode.InvalidState,
          );
        }
        if (cell.kind === 'row') selectRow(ctx, state, cell.index, '');
        else openCell(ctx, state, cell, '');
        return;
      }
      case 'open_center': {
        const center = state.cells.find((c) => c.kind === 'center');
        if (!center || center.status !== 'closed' || state.done || rowActive(state)) {
          throw new MatchRuleError(
            'Không mở ô trung tâm được lúc này.',
            MatchErrorCode.InvalidState,
          );
        }
        ctx.intervention('open_center', {});
        openCell(ctx, state, center, ' (Host mở)');
        return;
      }
      case 'start_timer': {
        const cell = requireActiveCell(state);
        if (cell.phase !== 'showing') {
          throw new MatchRuleError(
            'Hàng không ở trạng thái hiển thị.',
            MatchErrorCode.InvalidState,
          );
        }
        startAnswering(ctx, state, cell);
        return;
      }
      case 'judge': {
        const cell = requireActiveCell(state);
        if (cell.phase !== 'judging') {
          throw new MatchRuleError('Chỉ chấm được sau khi hết giờ.', MatchErrorCode.InvalidState);
        }
        if (!cell.answers[String(command.seat)]) {
          throw new MatchRuleError('Người này chưa ghi đáp án.', MatchErrorCode.InvalidState);
        }
        cell.verdicts[String(command.seat)] = command.correct ? 'correct' : 'wrong';
        return;
      }
      case 'reveal': {
        const cell = requireActiveCell(state);
        if (cell.phase !== 'judging' && cell.phase !== 'answering') {
          throw new MatchRuleError('Hàng không chờ công bố.', MatchErrorCode.InvalidState);
        }
        revealCell(ctx, state, cell, 'host');
        return;
      }
      case 'skip_question': {
        const cell = requireActiveCell(state);
        ctx.clearTimer();
        cell.phase = 'skipped';
        cell.status = 'unsolved';
        state.pieces[state.cells.indexOf(cell)] = true;
        ctx.intervention('skip_question', { questionRef: cell.ref });
        ctx.log(`Host bỏ qua ${cellLabel(cell).toLowerCase()}`);
        return;
      }
      case 'void_question': {
        const cell = currentCell(state);
        if (!cell || cell.status === 'closed') {
          throw new MatchRuleError('Chưa có hàng nào để hủy.', MatchErrorCode.InvalidState);
        }
        if (!FINAL_PHASES.has(cell.phase)) ctx.clearTimer();
        revertAwards(ctx, cell, 'void');
        cell.phase = 'voided';
        cell.status = 'voided';
        state.pieces[state.cells.indexOf(cell)] = true;
        ctx.intervention('void_question', { questionRef: cell.ref, replacementRef: null });
        ctx.log(`Host hủy ${cellLabel(cell).toLowerCase()} (không tính điểm)`);
        return;
      }
      case 'regrade': {
        const cell = state.cells.find((c) => c.ref === command.questionRef);
        if (!cell || cell.phase !== 'revealed' || !cell.answers[String(command.seat)]) {
          throw new MatchRuleError(
            'Chỉ chấm lại được hàng đã công bố của người đã ghi đáp án.',
            MatchErrorCode.InvalidState,
          );
        }
        const before = cell.results[String(command.seat)];
        const after = command.correct ? 'correct' : 'wrong';
        if (before === after) return;
        cell.verdicts[String(command.seat)] = after;
        revertAwards(ctx, cell, 'regrade');
        const correct = score(ctx, state, cell, 'host');
        cell.status = correct > 0 ? 'solved' : 'unsolved';
        ctx.intervention('regrade', { questionRef: cell.ref, seat: command.seat, before, after });
        ctx.log(
          `Host chấm lại ${cellLabel(cell).toLowerCase()} (${ctx.playerName(command.seat)}): ${before === 'correct' ? 'Đúng' : 'Sai'} → ${command.correct ? 'Đúng' : 'Sai'}`,
        );
        return;
      }
      case 'judge_keyword':
        judgeKeyword(ctx, state, command.seat, command.correct);
        return;
      case 'open_piece': {
        if (command.piece > state.pieces.length) {
          throw new BadRequestError('Không có mảnh ảnh này.');
        }
        if (state.pieces[command.piece - 1]) return;
        state.pieces[command.piece - 1] = true;
        ctx.intervention('open_piece', { piece: command.piece });
        ctx.log(`Host mở mảnh ảnh ${command.piece}`);
        return;
      }
      case 'reveal_keyword': {
        if (state.done) {
          throw new MatchRuleError('Từ khóa đã được công bố.', MatchErrorCode.InvalidState);
        }
        closeBoard(ctx, state);
        ctx.intervention('reveal_keyword', {});
        ctx.log('Host công bố từ khóa, không ai được điểm chướng ngại vật');
        return;
      }
      default:
        throw new MatchRuleError(
          'Lệnh không áp dụng cho vòng Vượt chướng ngại vật.',
          MatchErrorCode.InvalidState,
        );
    }
  },

  choose(ctx, state, seat, choice) {
    if (choice.type !== 'row') {
      throw new MatchRuleError('Hãy chọn một hàng ngang.', MatchErrorCode.InvalidState);
    }
    if (turnSeat(state) !== seat) {
      throw new MatchRuleError('Chưa đến lượt bạn chọn hàng.', MatchErrorCode.NotYourTurn);
    }
    selectRow(ctx, state, choice.row, ` (${ctx.playerName(seat)} chọn)`);
  },

  answer(ctx, state, seat, questionRef, answer, receivedAt) {
    if (state.done) {
      throw new MatchRuleError('Vòng thi đã kết thúc.', MatchErrorCode.AnswerClosed);
    }
    if (state.out.includes(seat)) {
      throw new MatchRuleError('Bạn đã bị loại khỏi vòng này.', MatchErrorCode.NotYourTurn);
    }
    if (!state.seats.includes(seat)) {
      throw new MatchRuleError('Bạn không thi vòng này.', MatchErrorCode.NotYourTurn);
    }
    if (questionRef === state.keywordRef) {
      // Đoán từ khóa (bấm chuông CNV): ghi nhận theo thứ tự server nhận.
      if (answer.type !== 'short_answer') throw new BadRequestError('Hãy nhập từ khóa.');
      if (state.guesses.some((g) => g.seat === seat)) {
        throw new MatchRuleError('Bạn đã đoán từ khóa.', MatchErrorCode.AlreadyAnswered);
      }
      const graded = gradeAnswer(answer, state.keyword.answer);
      const auto = graded === null ? null : graded ? 'correct' : 'wrong';
      state.guesses.push({
        seat,
        text: answer.text,
        receivedAt,
        points: keywordPoints(state),
        auto,
        state: 'pending',
      });
      ctx.recordAnswer({
        questionRef: state.keywordRef,
        seat,
        answer,
        autoResult: auto,
        receivedAt,
        elapsedMs: 0,
      });
      ctx.log(`${ctx.playerName(seat)} bấm chuông trả lời chướng ngại vật`);
      return { elapsedMs: 0 };
    }
    const cell = currentCell(state);
    if (!cell) {
      throw new MatchRuleError('Chưa có hàng nào đang thi.', MatchErrorCode.AnswerClosed);
    }
    assertRef(cell.ref, questionRef);
    if (cell.phase !== 'answering') {
      throw new MatchRuleError('Hàng không nhận đáp án lúc này.', MatchErrorCode.AnswerClosed);
    }
    assertInTime(ctx, 'answer', receivedAt);
    assertAnswerShape(answer, cell.question);
    const auto = suggest(answer, cell.question);
    const elapsedMs = Math.max(0, receivedAt - (cell.startedAt ?? receivedAt));
    // Có thể sửa đến khi hết giờ; đáp án cuối cùng được tính.
    cell.answers[String(seat)] = { answer, receivedAt, elapsedMs, auto };
    delete cell.verdicts[String(seat)];
    ctx.recordAnswer({
      questionRef: cell.ref,
      seat,
      answer,
      autoResult: auto,
      receivedAt,
      elapsedMs,
    });
    return { elapsedMs };
  },

  buzz() {
    throw new MatchRuleError(
      'Hãy gửi từ khóa khi bấm chuông chướng ngại vật.',
      MatchErrorCode.InvalidState,
    );
  },

  timer(ctx, state, purpose) {
    const cell = currentCell(state);
    if (purpose === 'answer') {
      if (cell?.phase === 'answering') {
        cell.phase = 'judging';
        ctx.log(`${cellLabel(cell)}: hết giờ`);
      }
      return;
    }
    if (purpose === 'choose') {
      // Hết thời gian chọn: mở hàng chưa mở đầu tiên.
      const next = nextClosed(state);
      if (next && !rowActive(state) && !state.done) {
        if (next.kind === 'row') selectRow(ctx, state, next.index, ' (hết thời gian chọn)');
        else openCell(ctx, state, next, '');
      }
      return;
    }
    if (purpose === 'auto') {
      if (state.done) return;
      if (cell?.phase === 'showing') {
        startAnswering(ctx, state, cell);
      } else if (cell && FINAL_PHASES.has(cell.phase)) {
        state.current = null;
      } else if (!cell && !nextClosed(state)) {
        state.lastCall = true;
      }
    }
  },

  auto(ctx, state) {
    if (ctx.timer() || state.done) return false;
    // Lượt đoán từ khóa luôn chờ Host xác nhận (BR-R2-01, BR-GAME-05).
    if (state.guesses.some((g) => g.state === 'pending')) return false;
    const { readMs, revealMs } = autoDelays(ctx.settings);
    const cell = currentCell(state);
    if (cell) {
      if (cell.phase === 'showing') {
        ctx.startTimer('auto', readMs);
      } else if (cell.phase === 'judging' && allDefinitive(ctx, state, cell)) {
        revealCell(ctx, state, cell, 'system');
        return true;
      } else if (FINAL_PHASES.has(cell.phase)) {
        ctx.startTimer('auto', revealMs);
      }
      return false;
    }
    const next = nextClosed(state);
    if (inRound(ctx, state).length === 0 || (!next && state.lastCall)) {
      closeBoard(ctx, state);
      ctx.log('Không ai giải được chướng ngại vật, công bố từ khóa');
      return true;
    }
    if (!next) {
      ctx.startTimer('auto', LAST_CALL_MS);
      return false;
    }
    if (next.kind === 'row' && turnSeat(state) !== null) {
      ctx.startTimer('choose', CHOOSE_MS);
      return false;
    }
    if (next.kind === 'row') selectRow(ctx, state, next.index, '');
    else openCell(ctx, state, next, '');
    return true;
  },

  awaitingHost(state) {
    if (state.done) return false;
    if (state.guesses.some((g) => g.state === 'pending')) return true;
    const cell = currentCell(state);
    if (cell?.phase !== 'judging') return false;
    return Object.entries(cell.answers).some(
      ([seat, entry]) =>
        cell.verdicts[seat] === undefined &&
        !state.out.includes(Number(seat)) &&
        !isDefinitive(entry.auto, cell.question),
    );
  },

  finished(state) {
    return state.done;
  },

  activeSeat(state) {
    return turnSeat(state);
  },

  spare(state) {
    return state.extra;
  },

  summary(state) {
    const items: QuestionSummary[] = state.cells
      .filter((cell) => isSummarized(cell.phase))
      .map((cell) => ({
        ref: cell.ref,
        question: cell.question,
        outcomes: outcomesOf(cell.results, cell.answers),
      }));
    // Từ khóa: mỗi lần bấm chuông đoán là một lần giành quyền; đoán sai bị loại khỏi vòng.
    const judged = state.guesses.filter((g) => g.state === 'correct' || g.state === 'wrong');
    if (judged.length > 0) {
      items.push({
        ref: state.keywordRef,
        question: state.keyword,
        outcomes: judged
          .map((g) => ({
            seat: g.seat,
            result: g.state === 'correct' ? ('correct' as const) : ('wrong' as const),
            elapsedMs: null,
            buzzWon: true,
          }))
          .sort((a, b) => a.seat - b.seat),
      });
    }
    return items;
  },

  mediaIds(state) {
    const ids = state.keyword.mediaId ? [state.keyword.mediaId] : [];
    const cell = currentCell(state);
    if (cell?.question.mediaId && cell.phase !== 'pending') ids.push(cell.question.mediaId);
    return ids;
  },

  view(state, ctx): ObstacleView {
    const isHost = ctx.audience === 'host';
    const cell = currentCell(state);
    const rows: ObstacleRowView[] = state.cells.map((c) => {
      const announced = state.keywordRevealed || c.status === 'solved' || c.status === 'unsolved';
      return {
        index: c.index,
        kind: c.kind,
        letters: letterCount(answerText(c.question)),
        status: c.status,
        content: isHost || c.status !== 'closed' ? c.question.content : null,
        answer: isHost || announced ? answerText(c.question) : null,
        correctCount: Object.values(c.results).filter((r) => r === 'correct').length,
      };
    });
    let question: ObstacleView['question'] = null;
    if (cell && cell.phase !== 'pending') {
      const revealed = FINAL_PHASES.has(cell.phase);
      const answers: SeatAnswerView[] = state.seats.map((seat) => {
        const entry = cell.answers[String(seat)];
        const result = cell.results[String(seat)];
        const visible = isHost || ctx.seat === seat || revealed;
        return {
          seat,
          state: result ?? (entry ? 'answered' : 'none'),
          answer: entry && visible ? entry.answer : null,
          elapsedMs: entry && visible ? entry.elapsedMs : null,
          suggested: isHost ? (entry?.auto ?? null) : null,
          verdict: isHost ? (cell.verdicts[String(seat)] ?? null) : null,
          points: revealed && result === 'correct' ? state.rules.rowPoints : null,
        };
      });
      question = questionView({
        ref: cell.ref,
        phase: cell.phase,
        question: cell.question,
        points: { correct: state.rules.rowPoints, wrong: 0 },
        answeringSeat: null,
        answers,
        isHost,
        media: ctx.media,
      });
    }
    const keywordText = answerText(state.keyword);
    return {
      type: 'obstacle',
      phase: phaseOf(state),
      turnSeat: turnSeat(state),
      rowSelection: state.rules.rowSelection,
      rows,
      pieces: [...state.pieces],
      image: state.keyword.mediaId ? (ctx.media.get(state.keyword.mediaId) ?? null) : null,
      keyword: {
        ref: state.keywordRef,
        letters: letterCount(keywordText),
        answer: isHost || state.keywordRevealed ? keywordText : null,
        solvedBy: state.solvedBy,
        revealed: state.keywordRevealed,
        points: keywordPoints(state),
      },
      question,
      currentRow: cell ? cell.index : null,
      guesses: state.guesses.map((g) => ({
        seat: g.seat,
        text:
          isHost || ctx.seat === g.seat || g.state === 'correct' || g.state === 'wrong'
            ? g.text
            : null,
        state: g.state,
        points: g.points,
        suggested: isHost ? g.auto : null,
      })),
      outSeats: [...state.out],
    };
  },
};
