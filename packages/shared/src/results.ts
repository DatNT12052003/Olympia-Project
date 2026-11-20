import { z } from 'zod';
import { answerSchema, mediaViewSchema, roundKeySchema } from './questions.js';

/** Hợp đồng REST kết quả trận, lịch sử và thống kê (mục 9.4, 14). */

export const ResultsErrorCode = {
  /** Trận chưa kết thúc: chưa có tổng kết. */
  MatchNotFinished: 'MATCH_NOT_FINISHED',
  MatchAlreadyVoided: 'MATCH_ALREADY_VOIDED',
} as const;

/** Tên hiển thị thay cho người chơi đã xóa tài khoản (BR-DATA-03). */
export const DELETED_PLAYER_NAME = 'Người chơi đã xóa';

/**
 * Trạng thái hiển thị của trận đã kết thúc: hoàn thành (sau vòng cuối), Host kết thúc sớm, kết
 * thúc bất thường (Host mất kết nối) hoặc kết quả đã bị Super Admin hủy.
 */
export const matchOutcomeSchema = z.enum(['completed', 'ended_early', 'abnormal', 'voided']);
export type MatchOutcome = z.infer<typeof matchOutcomeSchema>;

export const MATCH_OUTCOME_LABELS: Record<MatchOutcome, string> = {
  completed: 'Hoàn thành',
  ended_early: 'Host kết thúc sớm',
  abnormal: 'Kết thúc bất thường',
  voided: 'Kết quả đã hủy',
};

/** Người xem lịch sử: trận đã tổ chức (Host), đã tham gia (Player) hoặc mọi trận (quản trị). */
export const historyScopeSchema = z.enum(['hosted', 'played', 'all']);
export type HistoryScope = z.infer<typeof historyScopeSchema>;

export const HISTORY_PERIODS = [7, 30, 90, 365] as const;

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

export const historyQuerySchema = z.object({
  scope: historyScopeSchema.default('played'),
  /** Tìm theo tên phòng hoặc tên người chơi. */
  q: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
  /** Số ngày gần nhất; bỏ trống = mọi thời gian. */
  days: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(3650).optional()),
  status: z.preprocess(emptyToUndefined, matchOutcomeSchema.optional()),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type HistoryQuery = z.input<typeof historyQuerySchema>;

export const historyPlayerSchema = z.object({
  seat: z.number().int(),
  displayName: z.string(),
  score: z.number().int().nullable(),
});

export const historyItemSchema = z.object({
  matchId: z.uuid(),
  roomName: z.string(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime(),
  durationSeconds: z.number().int(),
  players: z.array(historyPlayerSchema),
  /** Người thắng (nhiều người khi đồng hạng); rỗng khi kết quả đã hủy. */
  winners: z.array(historyPlayerSchema),
  outcome: matchOutcomeSchema,
  /** Ghế của người xem nếu đã thi trận này. */
  mySeat: z.number().int().nullable(),
});
export type HistoryItem = z.infer<typeof historyItemSchema>;

export const historyListSchema = z.object({
  items: z.array(historyItemSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
export type HistoryList = z.infer<typeof historyListSchema>;

export const playerMatchStatsSchema = z.object({
  correct: z.number().int(),
  wrong: z.number().int(),
  skipped: z.number().int(),
  /** Thời gian trả lời trung bình (ms) của các câu trả lời trên thiết bị. */
  avgAnswerMs: z.number().int().nullable(),
  /** Số lần giành quyền trả lời thành công. */
  buzzWins: z.number().int(),
});
export type PlayerMatchStats = z.infer<typeof playerMatchStatsSchema>;

export const resultPlayerSchema = z.object({
  seat: z.number().int(),
  displayName: z.string(),
  rank: z.number().int(),
  score: z.number().int(),
  roundScores: z.array(z.number().int()),
  winner: z.boolean(),
  eliminated: z.boolean(),
  /** Thắng nhờ câu hỏi phụ (9.3). */
  wonTiebreak: z.boolean(),
  stats: playerMatchStatsSchema,
});
export type ResultPlayer = z.infer<typeof resultPlayerSchema>;

export const hardQuestionSchema = z.object({
  ref: z.string(),
  content: z.string(),
  wrong: z.number().int(),
  total: z.number().int(),
});
export type HardQuestion = z.infer<typeof hardQuestionSchema>;

export const resultQuestionSchema = z.object({
  ref: z.string(),
  roundIndex: z.number().int(),
  content: z.string(),
  media: mediaViewSchema.nullable(),
  answer: answerSchema,
  explanation: z.string().nullable(),
  outcomes: z.array(
    z.object({ seat: z.number().int(), result: z.enum(['correct', 'wrong', 'skipped']) }),
  ),
});
export type ResultQuestion = z.infer<typeof resultQuestionSchema>;

export const matchResultSchema = z.object({
  matchId: z.uuid(),
  roomId: z.uuid(),
  roomName: z.string(),
  scriptName: z.string(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime(),
  outcome: matchOutcomeSchema,
  voided: z.object({ at: z.iso.datetime(), reason: z.string() }).nullable(),
  rounds: z.array(
    z.object({ type: z.union([roundKeySchema, z.literal('tiebreak')]), title: z.string() }),
  ),
  players: z.array(resultPlayerSchema),
  hardQuestions: z.array(hardQuestionSchema),
  /** Player/khán giả xem được đáp án (Host luôn xem được). */
  answersPublic: z.boolean(),
  /** Câu hỏi kèm đáp án/giải thích; `null` khi người xem chưa được xem. */
  questions: z.array(resultQuestionSchema).nullable(),
  viewer: z.object({
    role: z.enum(['host', 'player', 'spectator', 'staff']),
    seat: z.number().int().nullable(),
    canToggleAnswers: z.boolean(),
    canVoid: z.boolean(),
  }),
});
export type MatchResult = z.infer<typeof matchResultSchema>;

export const answersVisibilityRequestSchema = z.object({ answersPublic: z.boolean() });
export type AnswersVisibilityRequest = z.input<typeof answersVisibilityRequestSchema>;

export const voidMatchRequestSchema = z.object({
  reason: z.string().trim().min(1, 'Cần nhập lý do hủy kết quả.').max(500),
});
export type VoidMatchRequest = z.input<typeof voidMatchRequestSchema>;

export const accuracyGroupSchema = z.object({
  subject: z.string().nullable(),
  topic: z.string().nullable(),
  correct: z.number().int(),
  total: z.number().int(),
});
export type AccuracyGroup = z.infer<typeof accuracyGroupSchema>;

/** Thống kê Player (mục 14): số trận, số trận thắng, tỷ lệ đúng theo môn/chủ đề. */
export const playerStatsSchema = z.object({
  matches: z.number().int(),
  wins: z.number().int(),
  correct: z.number().int(),
  answered: z.number().int(),
  bySubject: z.array(accuracyGroupSchema),
});
export type PlayerStats = z.infer<typeof playerStatsSchema>;

/** Thống kê Host (mục 14): số phòng, số trận, câu hỏi hay bị trả lời sai. */
export const hostStatsSchema = z.object({
  rooms: z.number().int(),
  matches: z.number().int(),
  players: z.number().int(),
  correct: z.number().int(),
  answered: z.number().int(),
  hardQuestions: z.array(
    z.object({
      sourceQuestionId: z.uuid().nullable(),
      content: z.string(),
      wrong: z.number().int(),
      total: z.number().int(),
    }),
  ),
});
export type HostStats = z.infer<typeof hostStatsSchema>;

export const myStatsSchema = z.object({
  player: playerStatsSchema,
  host: hostStatsSchema.nullable(),
});
export type MyStats = z.infer<typeof myStatsSchema>;
