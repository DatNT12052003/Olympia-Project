import type {
  MatchLogEntry,
  MatchStatus,
  PlayerAnswer,
  QuestionAnswer,
  MatchRoundType,
  ScriptRound,
  ScriptSettings,
} from '@olympia/shared';

/**
 * Trạng thái trận đấu (mục 8): dữ liệu thuần JSON để lưu Redis/PostgreSQL và khôi phục ở instance
 * khác (DL-013). Mọi thay đổi đi qua reducer của engine (`match-engine.ts`).
 */

/** Bản sao nội dung câu hỏi dùng trong trận (BR-QB-04). */
export interface MatchQuestion {
  sourceQuestionId: string;
  content: string;
  answer: QuestionAnswer;
  explanation: string | null;
  mediaId: string | null;
  /** Điểm mặc định của câu (vòng Về đích xếp câu theo mức điểm, DL-043). */
  defaultPoints?: number | null;
}

/** Kịch bản và câu hỏi chốt lúc bắt đầu trận (BR-SCRIPT-03). Bất biến trong suốt trận. */
export interface ScriptSnapshot {
  scriptId: string | null;
  name: string;
  settings: ScriptSettings;
  rounds: { round: ScriptRound; questions: MatchQuestion[] }[];
}

export interface MatchPlayerState {
  seat: number;
  displayName: string;
  kind: 'user' | 'guest';
  /** Khóa danh tính trong phòng (`u:<userId>` / `g:<guestId>`), khớp với presence. */
  key: string;
  score: number;
  roundScores: number[];
  eliminated: boolean;
}

/** Đồng hồ phía server (BR-GAME-01…04). `id` đổi mỗi lần đặt/tạm dừng/tiếp tục. */
export interface TimerState {
  id: string;
  purpose: string;
  durationMs: number;
  /** Epoch ms; `null` khi tạm dừng. */
  endsAt: number | null;
  /** Còn lại khi tạm dừng. */
  remainingMs: number | null;
}

export type PauseReason = 'host' | 'host_disconnected' | 'player_disconnected';

export interface MatchState {
  matchId: string;
  roomId: string;
  /** Khóa danh tính của Host trong phòng (để nhận biết Host mất kết nối). */
  hostKey: string;
  /** Tăng sau mỗi thay đổi (BR-RT-03). */
  version: number;
  status: MatchStatus;
  endReason: MatchEndReason | null;
  /** Chế độ điều khiển (8.3, 8.4). Trận tạo trước P5 không có trường này (= thủ công). */
  mode?: 'manual' | 'auto';
  pause: { reason: PauseReason; since: number } | null;
  /** Host mất kết nối từ lúc nào (4.5: quá hạn thì kết thúc bất thường). */
  hostDisconnectedAt: number | null;
  settings: ScriptSettings;
  rounds: { type: MatchRoundType; title: string }[];
  roundIndex: number;
  /** Trạng thái riêng của plugin vòng hiện tại. */
  round: unknown;
  players: MatchPlayerState[];
  timer: TimerState | null;
  timerSeq: number;
  scoreSeq: number;
  log: MatchLogEntry[];
  /** Câu chưa dùng của các vòng đã qua, làm câu hỏi phụ (DL-044). */
  spare?: MatchQuestion[];
  /** Người thắng câu hỏi phụ (9.3). */
  tiebreakWinner?: number | null;
}

export type MatchEndReason = 'completed' | 'host' | 'abnormal';

/** Tác động phụ của một bước xử lý, được ghi bền vào PostgreSQL cùng checkpoint. */
export type EngineEffect =
  | {
      kind: 'answer';
      roundIndex: number;
      questionRef: string;
      seat: number;
      answer: PlayerAnswer;
      autoResult: 'correct' | 'wrong' | null;
      receivedAt: number;
      elapsedMs: number;
    }
  | {
      kind: 'score';
      seq: number;
      seat: number;
      roundIndex: number;
      questionRef: string | null;
      delta: number;
      nominal: number;
      reason: string;
      note: string | null;
      actor: 'system' | 'host';
    }
  | {
      kind: 'intervention';
      action: string;
      detail: Record<string, unknown>;
      reason: string | null;
    }
  | { kind: 'finished' };
