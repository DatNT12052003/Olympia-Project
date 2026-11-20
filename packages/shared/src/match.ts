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

/**
 * Lựa chọn của Player đến lượt (Host chọn thay được): hàng ngang ở vòng Vượt chướng ngại vật, gói
 * câu hỏi và Ngôi sao hy vọng ở vòng Về đích.
 */
export const playerChoiceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('row'), row: z.number().int().min(1).max(8) }),
  z.object({
    type: z.literal('pack'),
    /** Mức điểm của từng câu trong gói, theo thứ tự. */
    levels: z.array(z.number().int().min(1).max(1000)).min(1).max(6),
    /** Câu dùng Ngôi sao hy vọng (chỉ số từ 0), `null` nếu không dùng. */
    star: z.number().int().min(0).max(5).nullable(),
  }),
  /** Đổi câu dùng Ngôi sao hy vọng trước khi câu đó hiển thị. */
  z.object({ type: z.literal('star'), star: z.number().int().min(0).max(5).nullable() }),
]);
export type PlayerChoice = z.infer<typeof playerChoiceSchema>;

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
  /** Công bố kết quả câu cùng trả lời (hàng ngang, Tăng tốc): áp điểm theo kết quả đã chấm. */
  z.object({ type: z.literal('reveal') }),
  /** Chọn thay Player đến lượt (hàng ngang, gói câu hỏi). */
  z.object({ type: z.literal('choose'), choice: playerChoiceSchema }),
  /** Vượt chướng ngại vật: chấm lượt đoán từ khóa, mở ô trung tâm/mảnh ảnh, công bố từ khóa. */
  z.object({ type: z.literal('judge_keyword'), seat: seatSchema, correct: z.boolean() }),
  z.object({ type: z.literal('open_center') }),
  z.object({ type: z.literal('open_piece'), piece: z.number().int().min(1).max(9) }),
  z.object({ type: z.literal('reveal_keyword') }),
  /** Đóng chuông giành quyền (không ai giành quyền). */
  z.object({ type: z.literal('close_buzz') }),
]);
export type HostCommand = z.infer<typeof hostCommandSchema>;

export const matchChoicePayloadSchema = z.object({
  roomId: z.uuid(),
  actionId: z.uuid(),
  choice: playerChoiceSchema,
});

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
  /**
   * Mục đích: `answer` (trả lời), `buzz` (chuông), `choose` (chọn hàng/gói), `auto` (chế độ tự
   * động chờ bước tiếp theo), `break` (nghỉ giữa vòng).
   */
  purpose: string;
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
  /** Host đã chấm (trước khi công bố) ở câu cùng trả lời; chỉ Host thấy. */
  verdict?: 'correct' | 'wrong' | null;
  /** Điểm đã nhận ở câu này (sau khi công bố). */
  points?: number | null;
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

/** Một ô (hàng ngang hoặc ô trung tâm) của bảng chướng ngại vật. */
export interface ObstacleRowView {
  /** Số thứ tự từ 1; ô trung tâm là `rowCount + 1`. */
  index: number;
  kind: 'row' | 'center';
  /** Số ký tự của đáp án (không tính khoảng trắng). */
  letters: number;
  /**
   * `closed`: chưa mở; `active`: đang thi; `solved`: có người đúng; `unsolved`: không ai đúng;
   * `voided`: Host hủy.
   */
  status: 'closed' | 'active' | 'solved' | 'unsolved' | 'voided';
  /** Nội dung hàng: Host luôn thấy; người khác khi hàng đã mở. */
  content: string | null;
  /** Đáp án: Host luôn thấy; người khác khi đã công bố. */
  answer: string | null;
  correctCount: number;
}

export interface ObstacleGuessView {
  seat: number;
  /** Nội dung đoán: Host thấy ngay; người khác khi đã chấm. */
  text: string | null;
  state: 'pending' | 'correct' | 'wrong' | 'cancelled';
  /** Điểm CNV nếu đúng (tính theo số hàng đã mở lúc bấm chuông). */
  points: number;
  /** Gợi ý chấm tự động cho Host. */
  suggested: 'correct' | 'wrong' | null;
}

export interface ObstacleView {
  type: 'obstacle';
  /**
   * `choosing`: chờ chọn hàng; `row`: đang thi một hàng; `keyword`: hết hàng, chỉ còn đoán từ
   * khóa; `done`: đã giải hoặc công bố từ khóa.
   */
  phase: 'choosing' | 'row' | 'keyword' | 'done';
  /** Player đến lượt chọn hàng (khi chọn theo lượt). */
  turnSeat: number | null;
  rowSelection: 'player' | 'order';
  rows: ObstacleRowView[];
  /** Mảnh ảnh đã mở, theo thứ tự ô (cùng độ dài `rows`). */
  pieces: boolean[];
  image: MediaView | null;
  keyword: {
    ref: string;
    letters: number;
    /** Host luôn thấy; người khác khi đã giải/công bố. */
    answer: string | null;
    solvedBy: number | null;
    revealed: boolean;
    /** Điểm nếu giải được lúc này. */
    points: number;
  };
  /** Hàng đang thi (câu hỏi kèm câu trả lời theo ghế). */
  question: MatchQuestionView | null;
  currentRow: number | null;
  guesses: ObstacleGuessView[];
  /** Ghế bị loại khỏi phần còn lại của vòng (đoán sai từ khóa). */
  outSeats: number[];
}

export interface AccelerationView {
  type: 'acceleration';
  questionNo: number;
  questionTotal: number;
  question: MatchQuestionView | null;
  rankPoints: number[];
  allowResubmit: boolean;
  /** Chỉ Host: số câu dự phòng còn lại. */
  reserves: number;
}

export interface FinishPackItemView {
  points: number;
  seconds: number;
  star: boolean;
  /** Kết quả của câu trong gói. */
  state: 'pending' | 'current' | 'correct' | 'wrong' | 'stolen' | 'skipped' | 'voided';
}

export interface FinishView {
  type: 'finish';
  /** `picking`: Player đến lượt chọn gói; `playing`: đang thi gói; `done`: hết lượt. */
  phase: 'picking' | 'playing' | 'done';
  answerMode: 'device' | 'verbal';
  /** Thứ tự thi (ghế) và vị trí lượt hiện tại. */
  order: number[];
  turn: number;
  turnSeat: number | null;
  levels: { points: number; seconds: number }[];
  questionsPerPlayer: number;
  starEnabled: boolean;
  pack: FinishPackItemView[] | null;
  questionNo: number;
  question: MatchQuestionView | null;
  /** Phần giành quyền của câu hiện tại. */
  steal: {
    open: boolean;
    winnerSeat: number | null;
    attemptedSeats: number[];
    /** Điểm đúng / bị trừ khi sai. */
    points: number;
    penalty: number;
  } | null;
  stealEnabled: boolean;
  /** Chỉ Host: số câu còn lại theo mức điểm. */
  available: Record<string, number>;
}

/** Câu hỏi phụ khi hòa điểm (9.3, DL-044). */
export interface TiebreakView {
  type: 'tiebreak';
  /** Ghế đang hòa điểm dẫn đầu. */
  seats: number[];
  questionNo: number;
  question: MatchQuestionView | null;
  buzz: { open: boolean; winnerSeat: number | null; attemptedSeats: number[] } | null;
  winnerSeat: number | null;
  /** Hết câu hỏi phụ mà chưa phân thắng thua: đồng hạng. */
  exhausted: boolean;
}

export type RoundView = WarmupView | ObstacleView | AccelerationView | FinishView | TiebreakView;

/** Loại vòng trong trận: bốn vòng của kịch bản và câu hỏi phụ. */
export type MatchRoundType = RoundType | 'tiebreak';

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
  /** Chế độ điều khiển (8.3, 8.4). */
  mode: 'manual' | 'auto';
  status: MatchStatus;
  /** `completed`: trận kết thúc sau vòng cuối; `host`: Host kết thúc sớm. */
  endReason: 'completed' | 'host' | 'abnormal' | null;
  pause: { reason: 'host' | 'host_disconnected' | 'player_disconnected'; since: number } | null;
  rounds: { type: MatchRoundType; title: string }[];
  roundIndex: number;
  /** Vòng hiện tại đã hết câu. */
  roundFinished: boolean;
  /**
   * Bước tiếp theo khi vòng hiện tại kết thúc: sang vòng sau, câu hỏi phụ (hòa điểm) hoặc kết
   * thúc trận.
   */
  nextStep: 'round' | 'tiebreak' | 'finish';
  /** Chế độ tự động đang chờ Host xác nhận (BR-GAME-05). */
  awaitingHost: boolean;
  /** Người thắng câu hỏi phụ. */
  tiebreakWinner: number | null;
  /** Hiệu ứng âm thanh theo thiết lập kịch bản (11.4); người xem vẫn tự tắt được trên máy mình. */
  soundEffects: boolean;
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

/** Số ký tự của đáp án hiển thị trên bảng chướng ngại vật (bỏ khoảng trắng). */
export function letterCount(text: string): number {
  return text.replace(/\s+/g, '').length;
}
