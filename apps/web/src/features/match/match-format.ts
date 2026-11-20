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
  const who = (seat: number | null) =>
    seat === mySeat ? 'Lượt của bạn' : `Lượt ${playerName(view, seat)}`;
  switch (round.type) {
    case 'warmup': {
      const no = round.questionNo > 0 ? ` · Câu ${round.questionNo}/${round.questionTotal}` : '';
      if (round.part === 'individual') return `Phần thi riêng · ${who(round.turnSeat)}${no}`;
      if (round.part === 'shared') return `Phần thi chung${no}`;
      return 'Đã hết câu hỏi của vòng';
    }
    case 'obstacle': {
      if (round.phase === 'done') {
        return round.keyword.solvedBy !== null
          ? `${playerName(view, round.keyword.solvedBy)} đã giải chướng ngại vật`
          : 'Đã công bố từ khóa';
      }
      if (round.phase === 'row') {
        const row = round.rows.find((r) => r.index === round.currentRow);
        return row?.kind === 'center' ? 'Ô trung tâm' : `Hàng ${round.currentRow ?? ''}`;
      }
      if (round.phase === 'keyword') return 'Đã mở hết các ô · đoán chướng ngại vật';
      return round.turnSeat !== null ? `${who(round.turnSeat)} chọn hàng` : 'Chờ mở hàng tiếp theo';
    }
    case 'acceleration':
      return round.questionNo > 0
        ? `Câu ${round.questionNo}/${round.questionTotal}`
        : 'Chuẩn bị câu hỏi';
    case 'finish': {
      if (round.phase === 'done') return 'Đã hết lượt thi';
      if (round.phase === 'picking') return `${who(round.turnSeat)} · chọn gói câu hỏi`;
      const no =
        round.questionNo > 0 ? ` · Câu ${round.questionNo}/${round.questionsPerPlayer}` : '';
      return `${who(round.turnSeat)}${no}`;
    }
    case 'tiebreak':
      if (round.winnerSeat !== null)
        return `${playerName(view, round.winnerSeat)} thắng câu hỏi phụ`;
      if (round.exhausted) return 'Hết câu hỏi phụ · đồng hạng';
      return round.questionNo > 0 ? `Câu hỏi phụ ${round.questionNo}` : 'Chuẩn bị câu hỏi phụ';
  }
}

/** Câu hỏi đang hiển thị của vòng (vòng nào cũng có, trừ khi chưa mở câu). */
export function currentQuestion(view: MatchView): MatchQuestionView | null {
  return view.round.question;
}

/** Trạng thái ngắn của một ghế trong vòng hiện tại (thẻ người chơi, khán giả). */
export function seatStatus(
  view: MatchView,
  seat: number,
): { text: string; active: boolean } | null {
  const round = view.round;
  const question = round.question;
  if (round.type === 'obstacle' && round.outSeats.includes(seat)) {
    return { text: 'Bị loại khỏi vòng', active: false };
  }
  if (
    question &&
    question.answeringSeat === seat &&
    (question.phase === 'answering' || question.phase === 'judging')
  ) {
    return { text: 'Đang trả lời', active: true };
  }
  if (round.type === 'warmup' && round.part === 'individual' && round.turnSeat === seat) {
    return { text: 'Đến lượt', active: true };
  }
  if (round.type === 'finish' && round.turnSeat === seat && round.phase !== 'done') {
    return { text: round.phase === 'picking' ? 'Chọn gói' : 'Đến lượt', active: true };
  }
  if (round.type === 'obstacle' && round.phase === 'choosing' && round.turnSeat === seat) {
    return { text: 'Chọn hàng', active: true };
  }
  if (question && (round.type === 'acceleration' || round.type === 'obstacle')) {
    const entry = question.answers.find((a) => a.seat === seat);
    if (question.phase === 'answering') {
      return entry && entry.state !== 'none'
        ? { text: 'Đã gửi', active: false }
        : { text: 'Đang suy nghĩ', active: false };
    }
  }
  return null;
}

export const PHASE_LABEL_BY_TIMER: Record<string, string> = {
  choose: 'Đang chọn',
  auto: 'Tự động chuyển bước',
  break: 'Nghỉ giữa vòng',
};

export function formatElapsed(ms: number): string {
  return `${(ms / 1000).toFixed(3).replace('.', ',')} s`;
}

export function signedPoints(value: number): string {
  return value > 0 ? `+${value}` : String(value);
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
