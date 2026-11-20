import type {
  HostCommand,
  MatchRoundType,
  MediaView,
  PlayerAnswer,
  PlayerChoice,
  RoundView,
  ScriptRound,
  ScriptSettings,
} from '@olympia/shared';
import { ConflictError } from '../../../shared/errors/app-error';
import type { MatchQuestion, QuestionSummary, TimerState } from './match-state';

/**
 * Interface plugin vòng thi (DL-012, BR-ROUND-01). Engine không chứa logic riêng của vòng nào:
 * mỗi loại vòng cài đặt interface này và đăng ký trong `round-registry.ts`.
 *
 * Plugin thao tác trên bản sao trạng thái (được phép thay đổi trực tiếp) và chỉ tác động ra ngoài
 * qua `RoundContext` (điểm, câu trả lời, đồng hồ, nhật ký) để engine ghi sổ đầy đủ.
 *
 * Đồng hồ: mỗi trận có một đồng hồ. Plugin dùng các mục đích `answer`, `buzz`, `choose` và `auto`
 * (chế độ tự động chờ bước tiếp theo); `break` dành cho engine (nghỉ giữa vòng).
 */

/** Lỗi luật chơi (trạng thái không cho phép hành động); trả về client qua ack. */
export class MatchRuleError extends ConflictError {}

export interface RoundContext {
  now: number;
  settings: ScriptSettings;
  roundIndex: number;
  /** Chế độ tự động (8.4): plugin tự chấm câu có đáp án xác định, tự chuyển bước. */
  auto: boolean;
  /** Ghế còn thi (chưa bị loại khỏi trận), theo thứ tự ghế. */
  activeSeats(): number[];
  isEliminated(seat: number): boolean;
  playerName(seat: number): string;
  score(seat: number): number;
  /** Cộng/trừ điểm theo luật; trả về điểm thực áp dụng (BR-SCORE-03). */
  award(
    seat: number,
    nominal: number,
    reason: string,
    questionRef: string | null,
    actor: 'system' | 'host',
    note?: string | null,
  ): number;
  recordAnswer(input: {
    questionRef: string;
    seat: number;
    answer: PlayerAnswer;
    autoResult: 'correct' | 'wrong' | null;
    receivedAt: number;
    elapsedMs: number;
  }): void;
  intervention(action: string, detail: Record<string, unknown>, reason?: string | null): void;
  /** Đồng hồ hiện tại (để kiểm tra trả lời đúng hạn). */
  timer(): TimerState | null;
  startTimer(purpose: string, durationMs: number): void;
  clearTimer(): void;
  log(text: string): void;
}

export interface ViewContext {
  audience: 'host' | 'player' | 'spectator';
  seat: number | null;
  media: Map<string, MediaView>;
}

export interface RoundInit {
  /** Vòng trong kịch bản (`null` với câu hỏi phụ). */
  round: ScriptRound | null;
  questions: MatchQuestion[];
  /** Ghế đang thi, theo thứ tự ghế. */
  seats: number[];
  roundIndex: number;
  /** Điểm hiện tại theo ghế (vòng Về đích: điểm thấp thi trước). */
  scores: Record<string, number>;
}

export interface RoundPlugin<S = unknown> {
  type: MatchRoundType;
  /** Số câu hỏi cần theo luật (BR-SCRIPT-01). */
  requirement(round: ScriptRound): { fixed: number; perPlayer: number };
  /** Kiểm tra dạng câu hỏi khi bắt đầu trận; trả về mô tả lỗi hoặc `null`. */
  validate?(round: ScriptRound, questions: MatchQuestion[]): string | null;
  init(input: RoundInit): S;
  /** Lệnh vòng thi của Host. Lệnh không thuộc vòng này ném `MatchRuleError`. */
  command(ctx: RoundContext, state: S, command: HostCommand): void;
  answer(
    ctx: RoundContext,
    state: S,
    seat: number,
    questionRef: string,
    answer: PlayerAnswer,
    receivedAt: number,
  ): { elapsedMs: number };
  buzz(
    ctx: RoundContext,
    state: S,
    seat: number,
    questionRef: string,
    receivedAt: number,
  ): { won: boolean };
  /** Lựa chọn của Player đến lượt (hàng ngang, gói câu hỏi). */
  choose?(ctx: RoundContext, state: S, seat: number, choice: PlayerChoice): void;
  /** Đồng hồ hết giờ. */
  timer(ctx: RoundContext, state: S, purpose: string): void;
  /**
   * Chế độ tự động (8.4): thực hiện bước tiếp theo nếu không cần Host. Trả về `true` khi đã làm
   * một bước tức thì (engine gọi lại cho tới khi plugin chờ đồng hồ hoặc chờ Host).
   */
  auto(ctx: RoundContext, state: S): boolean;
  /** Đang chờ Host xác nhận (BR-GAME-05): chế độ tự động không tự đi tiếp. */
  awaitingHost(state: S): boolean;
  /** Vòng đã hết câu. */
  finished(state: S): boolean;
  /** Ghế đang đến lượt/đang được trả lời (để xử lý mất kết nối, 8.5). */
  activeSeat(state: S): number | null;
  /** Câu hỏi chưa dùng khi vòng kết thúc (dùng cho câu hỏi phụ, DL-044). */
  spare(state: S): MatchQuestion[];
  /** Media cần cấp URL khi dựng view. */
  mediaIds(state: S): string[];
  /**
   * Tóm tắt các câu đã dùng của vòng và kết quả theo ghế (mục 14), gọi khi rời vòng hoặc kết thúc
   * trận. Bỏ câu chưa hiển thị và câu bị hủy.
   */
  summary(state: S): QuestionSummary[];
  view(state: S, ctx: ViewContext): RoundView;
}

/** Thời gian chờ của chế độ tự động theo thiết lập kịch bản. */
export function autoDelays(settings: ScriptSettings): { readMs: number; revealMs: number } {
  return {
    readMs: (settings.autoReadSeconds ?? 3) * 1000,
    revealMs: (settings.autoRevealSeconds ?? 3) * 1000,
  };
}
