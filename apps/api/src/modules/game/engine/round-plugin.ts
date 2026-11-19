import type {
  HostCommand,
  MediaView,
  PlayerAnswer,
  RoundView,
  ScriptRound,
  ScriptSettings,
} from '@olympia/shared';
import { ConflictError } from '../../../shared/errors/app-error';
import type { MatchQuestion, TimerState } from './match-state';

/**
 * Interface plugin vòng thi (DL-012, BR-ROUND-01). Engine không chứa logic riêng của vòng nào:
 * mỗi loại vòng cài đặt interface này và đăng ký trong `round-registry.ts`.
 *
 * Plugin thao tác trên bản sao trạng thái (được phép thay đổi trực tiếp) và chỉ tác động ra ngoài
 * qua `RoundContext` (điểm, câu trả lời, đồng hồ, nhật ký) để engine ghi sổ đầy đủ.
 */

/** Lỗi luật chơi (trạng thái không cho phép hành động); trả về client qua ack. */
export class MatchRuleError extends ConflictError {}

export interface RoundContext {
  now: number;
  settings: ScriptSettings;
  roundIndex: number;
  /** Ghế còn thi (chưa bị loại), theo thứ tự ghế. */
  activeSeats(): number[];
  isEliminated(seat: number): boolean;
  playerName(seat: number): string;
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

export interface RoundPlugin<S = unknown> {
  type: ScriptRound['type'];
  /** Số câu hỏi cần theo luật (BR-SCRIPT-01). */
  requirement(round: ScriptRound): { fixed: number; perPlayer: number };
  /** Khởi tạo vòng với câu hỏi đã chốt và các ghế đang thi (theo thứ tự ghế). */
  init(round: ScriptRound, questions: MatchQuestion[], seats: number[], roundIndex: number): S;
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
  /** Đồng hồ hết giờ. */
  timer(ctx: RoundContext, state: S, purpose: string): void;
  /** Vòng đã hết câu. */
  finished(state: S): boolean;
  /** Ghế đang đến lượt/đang được trả lời (để xử lý mất kết nối, 8.5). */
  activeSeat(state: S): number | null;
  /** Media cần cấp URL khi dựng view. */
  mediaIds(state: S): string[];
  view(state: S, ctx: ViewContext): RoundView;
}
