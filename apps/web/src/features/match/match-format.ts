import {
  describeAnswer,
  describeCorrectAnswer,
  type MatchQuestionView,
  type MatchTimerView,
  type MatchView,
  type QuestionPhase,
} from '@olympia/shared';
import { useEffect, useState } from 'react';

/** Hàm, nhãn và hook dùng chung của các màn trận đấu (không phải component). */

/** Thời gian còn lại (ms) theo thời điểm kết thúc do server gửi, đã hiệu chỉnh lệch đồng hồ (BR-RT-02). */
export function useRemainingMs(timer: MatchTimerView | null, clockOffset: number): number | null {
  const [now, setNow] = useState(() => Date.now());
  const running = timer?.endsAt != null;
  useEffect(() => {
    if (!running) return;
    const handle = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(handle);
  }, [running]);
  if (!timer) return null;
  if (timer.endsAt === null) return timer.remainingMs;
  // Chặn trên bằng thời lượng: độ trễ mạng làm lệch đồng hồ ước tính vài chục ms.
  return Math.min(timer.durationMs, Math.max(0, timer.endsAt - (now + clockOffset)));
}

/** Thời gian máy, cập nhật định kỳ (đếm ngược giữ chỗ). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(handle);
  }, [intervalMs]);
  return now;
}

export function seconds(ms: number | null): number {
  return ms === null ? 0 : Math.ceil(ms / 1000);
}

export const ANSWER_TYPE_LABELS: Record<MatchQuestionView['answerType'], string> = {
  mcq: 'Trắc nghiệm',
  true_false: 'Đúng/Sai',
  short_answer: 'Trả lời ngắn',
};

export const PHASE_LABELS: Record<QuestionPhase, string> = {
  showing: 'Đang hiển thị câu hỏi',
  answering: 'Đang nhận trả lời',
  buzzing: 'Chuông đang mở',
  judging: 'Chờ Host chấm',
  revealed: 'Đã công bố đáp án',
  skipped: 'Đã bỏ qua câu',
  voided: 'Đã hủy câu',
};

/** "Vòng 1 · Khởi động" */
export function roundTitle(view: MatchView): string {
  return `Vòng ${view.roundIndex + 1} · ${view.rounds[view.roundIndex]?.title ?? ''}`;
}

/** Mô tả phần thi hiện tại: "Phần thi riêng · Lượt Minh Anh · Câu 4/6". */
export function partLabel(view: MatchView, mySeat: number | null = null): string {
  const round = view.round;
  const no = round.questionNo > 0 ? ` · Câu ${round.questionNo}/${round.questionTotal}` : '';
  if (round.part === 'individual') {
    const turn = view.players.find((p) => p.seat === round.turnSeat);
    const who = round.turnSeat === mySeat ? 'Lượt của bạn' : `Lượt ${turn?.displayName ?? ''}`;
    return `Phần thi riêng · ${who}${no}`;
  }
  if (round.part === 'shared') return `Phần thi chung${no}`;
  return 'Đã hết câu hỏi của vòng';
}

export function pointsLabel(question: MatchQuestionView): string {
  return question.points.wrong > 0
    ? `Đúng +${question.points.correct} · Sai −${question.points.wrong}`
    : `${question.points.correct} điểm`;
}

export function playerName(view: MatchView, seat: number | null): string {
  return view.players.find((p) => p.seat === seat)?.displayName ?? `Ghế ${seat ?? '?'}`;
}

export function answerText(question: MatchQuestionView, seat: number): string | null {
  const entry = question.answers.find((a) => a.seat === seat);
  return entry?.answer ? describeAnswer(entry.answer, question.options) : null;
}

export function correctText(question: MatchQuestionView): string | null {
  return question.correctAnswer ? describeCorrectAnswer(question.correctAnswer) : null;
}
