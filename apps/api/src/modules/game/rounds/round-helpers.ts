import {
  ANSWER_GRACE_MS,
  gradeAnswer,
  MatchErrorCode,
  type MatchQuestionView,
  type MediaView,
  type PlayerAnswer,
  type QuestionPhase,
  type SeatAnswerView,
} from '@olympia/shared';
import { BadRequestError } from '../../../shared/errors/app-error';
import type { MatchQuestion } from '../engine/match-state';
import { MatchRuleError, type RoundContext } from '../engine/round-plugin';

/** Tiện ích dùng chung cho các plugin vòng thi. */

export const FINAL_PHASES: ReadonlySet<string> = new Set(['revealed', 'skipped', 'voided']);

export function assertRef(actual: string, expected: string): void {
  if (actual !== expected) {
    throw new MatchRuleError('Câu hỏi đã thay đổi.', MatchErrorCode.QuestionMismatch);
  }
}

/** Câu trả lời đến sau khi hết giờ (kể cả sai số mạng) bị từ chối (BR-GAME-02). */
export function assertInTime(ctx: RoundContext, purpose: string, receivedAt: number): void {
  const timer = ctx.timer();
  if (
    timer?.purpose === purpose &&
    timer.endsAt !== null &&
    receivedAt > timer.endsAt + ANSWER_GRACE_MS
  ) {
    throw new MatchRuleError('Đã hết thời gian.', MatchErrorCode.AnswerClosed);
  }
}

/** Câu trả lời phải đúng dạng câu hỏi. */
export function assertAnswerShape(answer: PlayerAnswer, question: MatchQuestion): void {
  const correct = question.answer;
  if (
    answer.type !== correct.type ||
    (answer.type === 'mcq' && correct.type === 'mcq' && answer.index >= correct.options.length)
  ) {
    throw new BadRequestError('Đáp án không đúng dạng câu hỏi.');
  }
}

/** Kết quả chấm tự động gợi ý (5.2). */
export function suggest(answer: PlayerAnswer, question: MatchQuestion): 'correct' | 'wrong' | null {
  const graded = gradeAnswer(answer, question.answer);
  return graded === null ? null : graded ? 'correct' : 'wrong';
}

/**
 * Kết quả chấm tự động có chắc chắn không (BR-GAME-05): đúng luôn chắc chắn; sai chỉ chắc chắn với
 * trắc nghiệm/đúng-sai (trả lời ngắn không khớp phải chờ Host xác nhận).
 */
export function isDefinitive(
  suggested: 'correct' | 'wrong' | null,
  question: MatchQuestion,
): boolean {
  if (suggested === 'correct') return true;
  return suggested === 'wrong' && question.answer.type !== 'short_answer';
}

export function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

/** Đáp án dạng chữ (câu trả lời ngắn) để hiển thị trên bảng chướng ngại vật. */
export function answerText(question: MatchQuestion): string {
  const answer = question.answer;
  switch (answer.type) {
    case 'short_answer':
      return answer.answer;
    case 'true_false':
      return answer.correct ? 'Đúng' : 'Sai';
    case 'mcq':
      return answer.options[answer.correctIndex] ?? '';
  }
}

/** Dựng view câu hỏi; đáp án chỉ tới Host cho tới khi công bố (BR-RT-01). */
export function questionView(input: {
  ref: string;
  phase: QuestionPhase;
  question: MatchQuestion;
  points: { correct: number; wrong: number };
  answeringSeat: number | null;
  answers: SeatAnswerView[];
  isHost: boolean;
  media: Map<string, MediaView>;
}): MatchQuestionView {
  const { question, isHost } = input;
  const revealed = FINAL_PHASES.has(input.phase);
  const answer = question.answer;
  return {
    ref: input.ref,
    phase: input.phase,
    content: question.content,
    answerType: answer.type,
    options: answer.type === 'mcq' ? answer.options : null,
    media: question.mediaId ? (input.media.get(question.mediaId) ?? null) : null,
    points: input.points,
    correctAnswer: isHost || revealed ? answer : null,
    explanation: isHost || revealed ? question.explanation : null,
    answeringSeat: input.answeringSeat,
    answers: input.answers,
  };
}

/** Câu trả lời của một ghế ở câu cùng trả lời (hàng ngang, Tăng tốc). */
export interface SeatEntry {
  answer: PlayerAnswer;
  receivedAt: number;
  elapsedMs: number;
  auto: 'correct' | 'wrong' | null;
}
