import { z } from 'zod';
import { matchShortAnswer, type MediaView, type QuestionAnswer } from './questions.js';
import type { ConnectionStatus } from './rooms.js';
import type { RoundType } from './scripts.js';

/**
 * Hợp đồng trận đấu (đặc tả mục 8–10): bắt đầu trận (REST), lệnh Host, trả lời/bấm chuông của
 * Player (Socket.IO có ack, DL-026) và trạng thái trận gửi theo đối tượng xem (BR-RT-01).
 */

export const MatchErrorCode = {
  ScriptMissing: 'MATCH_SCRIPT_MISSING',
  ScriptInvalid: 'MATCH_SCRIPT_INVALID',
  AutoModeUnsupported: 'MATCH_AUTO_MODE_UNSUPPORTED',
  NotEnoughPlayers: 'MATCH_NOT_ENOUGH_PLAYERS',
  PlayersNotReady: 'MATCH_PLAYERS_NOT_READY',
  AlreadyRunning: 'MATCH_ALREADY_RUNNING',
  NoActiveMatch: 'MATCH_NOT_ACTIVE',
  Paused: 'MATCH_PAUSED',
  InvalidState: 'MATCH_INVALID_STATE',
  NotYourTurn: 'MATCH_NOT_YOUR_TURN',
  AnswerClosed: 'MATCH_ANSWER_CLOSED',
  AlreadyAnswered: 'MATCH_ALREADY_ANSWERED',
  QuestionMismatch: 'MATCH_QUESTION_MISMATCH',
  VerbalAnswer: 'MATCH_VERBAL_ANSWER',
  Busy: 'MATCH_BUSY',
} as const;

/** Thời gian cho phép trễ do mạng sau khi hết giờ (BR-GAME-02, mặc định đề xuất). */
export const ANSWER_GRACE_MS = 300;

export const startMatchRequestSchema = z.object({
  /** Host bỏ qua điều kiện mọi người chơi đã Sẵn sàng (BR-JOIN-04). */
  skipReady: z.boolean().default(false),
});
export type StartMatchRequest = z.input<typeof startMatchRequestSchema>;

export const matchStatusSchema = z.enum(['running', 'paused', 'finished']);
export type MatchStatus = z.infer<typeof matchStatusSchema>;

/** Câu trả lời của Player, theo dạng đáp án của câu hỏi. */
export const playerAnswerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('mcq'), index: z.number().int().min(0).max(5) }),
  z.object({ type: z.literal('true_false'), value: z.boolean() }),
  z.object({ type: z.literal('short_answer'), text: z.string().trim().min(1).max(200) }),
]);
export type PlayerAnswer = z.infer<typeof playerAnswerSchema>;

const seatSchema = z.number().int().min(1).max(4);

/** Lệnh của Host (8.3, 8.5). Lệnh vòng thi do plugin của vòng xử lý (DL-012). */
export const hostCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('pause') }),
  z.object({ type: z.literal('resume') }),
  z.object({ type: z.literal('end_match') }),
  z.object({ type: z.literal('next_round') }),
  z.object({
    type: z.literal('adjust_score'),
    seat: seatSchema,
    delta: z
      .number()
      .int()
      .min(-1000)
      .max(1000)
      .refine((value) => value !== 0, 'Nhập số điểm khác 0.'),
    reason: z.string().trim().min(3, 'Lý do tối thiểu 3 ký tự.').max(200),
  }),
  z.object({ type: z.literal('eliminate_player'), seat: seatSchema }),
  // Lệnh vòng thi.
  z.object({ type: z.literal('next_question') }),
  z.object({ type: z.literal('start_timer') }),
  z.object({ type: z.literal('judge'), seat: seatSchema, correct: z.boolean() }),
  z.object({ type: z.literal('skip_question') }),
  z.object({ type: z.literal('void_question') }),
  z.object({
    type: z.literal('regrade'),
    questionRef: z.string().max(40),
    seat: seatSchema,
    correct: z.boolean(),
  }),
]);
export type HostCommand = z.infer<typeof hostCommandSchema>;

export const matchCommandPayloadSchema = z.object({
  roomId: z.uuid(),
  /** Id hành động do client sinh để chống gửi trùng (BR-GAME-03). */
  actionId: z.uuid(),
  command: hostCommandSchema,
});

export const matchAnswerPayloadSchema = z.object({
  roomId: z.uuid(),
  actionId: z.uuid(),
  questionRef: z.string().max(40),
  answer: playerAnswerSchema,
});

export const matchBuzzPayloadSchema = z.object({
  roomId: z.uuid(),
  actionId: z.uuid(),
  questionRef: z.string().max(40),
});

// --- Trạng thái trận gửi xuống client ---

/**
 * Trạng thái câu hỏi (8.2). `showing`: đang hiển thị/đọc; `answering`: đang nhận trả lời;
 * `buzzing`: chuông đang mở; `judging`: đã khóa, chờ Host chấm; `revealed`: đã chấm và công bố;
 * `skipped`/`voided`: Host bỏ qua/hủy câu.
 */
export type QuestionPhase =
  'showing' | 'answering' | 'buzzing' | 'judging' | 'revealed' | 'skipped' | 'voided';

export type AnswerResult = 'correct' | 'wrong' | 'skipped';

export interface MatchPlayerView {
  seat: number;
  displayName: string;
  kind: 'user' | 'guest';
  score: number;
  /** Điểm theo từng vòng (cùng thứ tự `rounds`). */
  roundScores: number[];
  connection: ConnectionStatus;
  disconnectedAt: string | null;
  eliminated: boolean;
}

export interface MatchTimerView {
  /** Thời điểm kết thúc theo đồng hồ server (epoch ms); `null` khi đang tạm dừng. */
  endsAt: number | null;
  durationMs: number;
  /** Thời gian còn lại khi tạm dừng (BR-GAME-04). */
  remainingMs: number | null;
}

export interface SeatAnswerView {
  seat: number;
  /** `answered`: đã gửi, chưa công bố kết quả. */
  state: 'none' | 'answered' | AnswerResult;
  /** Nội dung trả lời: Host thấy ngay; người khác chỉ sau khi công bố (BR-SPEC-03). */
  answer: PlayerAnswer | null;
  elapsedMs: number | null;
  /** Kết quả chấm tự động gợi ý cho Host. */
  suggested: 'correct' | 'wrong' | null;
}

export interface MatchQuestionView {
  ref: string;
  phase: QuestionPhase;
  content: string;
  answerType: QuestionAnswer['type'];
  /** Phương án trắc nghiệm (không kèm đáp án đúng). */
  options: string[] | null;
  media: MediaView | null;
  points: { correct: number; wrong: number };
  /** Đáp án đúng: Host luôn thấy; người khác chỉ sau khi công bố (BR-RT-01). */
  correctAnswer: QuestionAnswer | null;
  explanation: string | null;
  /** Ghế được trả lời lúc này (`null` khi chưa ai có quyền). */
  answeringSeat: number | null;
  answers: SeatAnswerView[];
}

export interface WarmupHistoryItem {
  ref: string;
  label: string;
  part: 'individual' | 'shared';
  seat: number;
  answer: PlayerAnswer | null;
  result: AnswerResult;
}

export interface WarmupView {
  type: 'warmup';
  part: 'individual' | 'shared' | 'done';
  answerMode: 'device' | 'verbal';
  /** Ghế đang đến lượt ở phần thi riêng. */
  turnSeat: number | null;
  /** Số thứ tự câu trong lượt / phần thi chung (bắt đầu từ 1; 0 khi chưa có câu). */
  questionNo: number;
  questionTotal: number;
  question: MatchQuestionView | null;
  buzz: { open: boolean; winnerSeat: number | null; attemptedSeats: number[] } | null;
  /** Chỉ Host: câu đã chấm của vòng, để chấm lại. */
  history: WarmupHistoryItem[];
  /** Chỉ Host: số câu dự phòng còn lại. */
  reserves: number;
}

export type RoundView = WarmupView;

export interface MatchLogEntry {
  at: number;
  text: string;
}

export interface MatchView {
  matchId: string;
  roomId: string;
  /** Tăng dần; client bỏ qua bản cũ hơn (BR-RT-03). */
  version: number;
  audience: 'host' | 'player' | 'spectator';
  /** Ghế của người xem (Player). */
  mySeat: number | null;
  status: MatchStatus;
  endReason: 'host' | 'abnormal' | null;
  pause: { reason: 'host' | 'host_disconnected' | 'player_disconnected'; since: number } | null;
  rounds: { type: RoundType; title: string }[];
  roundIndex: number;
  /** Vòng hiện tại đã hết câu. */
  roundFinished: boolean;
  players: MatchPlayerView[];
  timer: MatchTimerView | null;
  round: RoundView;
  /** Chỉ Host: nhật ký trận gần nhất. */
  log: MatchLogEntry[];
  /** Thời điểm server khi tạo bản trạng thái (để hiệu chỉnh đồng hồ, BR-RT-02). */
  serverTime: number;
}

/**
 * Chấm tự động câu trả lời (5.2). Trả `null` khi không chấm được (sai dạng đáp án); trả lời ngắn
 * không khớp trả `false` để Host xác nhận lại.
 */
export function gradeAnswer(answer: PlayerAnswer, correct: QuestionAnswer): boolean | null {
  if (answer.type !== correct.type) return null;
  switch (correct.type) {
    case 'mcq':
      return answer.type === 'mcq' && answer.index === correct.correctIndex;
    case 'true_false':
      return answer.type === 'true_false' && answer.value === correct.correct;
    case 'short_answer':
      return answer.type === 'short_answer' && matchShortAnswer(answer.text, correct);
  }
}

/** Chữ cái phương án trắc nghiệm. */
export const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

/** Mô tả ngắn câu trả lời để hiển thị ("C – 4", "Đúng", nội dung trả lời ngắn). */
export function describeAnswer(answer: PlayerAnswer, options: string[] | null): string {
  switch (answer.type) {
    case 'mcq': {
      const letter = OPTION_LETTERS[answer.index] ?? '?';
      const text = options?.[answer.index];
      return text === undefined ? letter : `${letter} – ${text}`;
    }
    case 'true_false':
      return answer.value ? 'Đúng' : 'Sai';
    case 'short_answer':
      return answer.text;
  }
}

/** Mô tả đáp án đúng để hiển thị. */
export function describeCorrectAnswer(answer: QuestionAnswer): string {
  switch (answer.type) {
    case 'mcq':
      return `${OPTION_LETTERS[answer.correctIndex] ?? '?'} – ${answer.options[answer.correctIndex] ?? ''}`;
    case 'true_false':
      return answer.correct ? 'Đúng' : 'Sai';
    case 'short_answer':
      return answer.answer;
  }
}
