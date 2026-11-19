import { z } from 'zod';
import type { RoundKey } from './questions.js';

/**
 * Kịch bản trận đấu (đặc tả mục 6, DL-003): danh sách vòng theo thứ tự, luật từng vòng theo
 * preset (Host chỉnh mọi thông số), nguồn câu hỏi và thiết lập chung. Kịch bản thuộc Host và dùng
 * lại được cho nhiều phòng (BR-SCRIPT-02); khi trận bắt đầu, kịch bản được chốt snapshot
 * (BR-SCRIPT-03).
 */

export const ScriptErrorCode = {
  ScriptInvalid: 'SCRIPT_INVALID',
  SourceUnavailable: 'QUESTION_SOURCE_UNAVAILABLE',
  RoundNotSupported: 'ROUND_NOT_SUPPORTED',
} as const;

/** Vòng đã có plugin trong engine (P5: đủ bốn vòng). */
export const PLAYABLE_ROUNDS = [
  'warmup',
  'obstacle',
  'acceleration',
  'finish',
] as const satisfies readonly RoundKey[];

export const ROUND_TITLES: Record<RoundKey, string> = {
  warmup: 'Khởi động',
  obstacle: 'Vượt chướng ngại vật',
  acceleration: 'Tăng tốc',
  finish: 'Về đích',
};

/** Nguồn câu hỏi của một vòng: bộ đề của Host hoặc một phiên bản bộ public (DL-033). */
export const questionSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('set'), setId: z.uuid() }),
  z.object({ kind: z.literal('public'), versionId: z.uuid() }),
]);
export type QuestionSource = z.infer<typeof questionSourceSchema>;

/** Hình thức trả lời của phần thi theo lượt (BR-ROUND-02, DL-004). */
export const answerModeSchema = z.enum(['device', 'verbal']);
export type AnswerMode = z.infer<typeof answerModeSchema>;

const seconds = (max: number) =>
  z.number().int().min(1, 'Tối thiểu 1 giây.').max(max, `Tối đa ${max} giây.`);
const points = z.number().int().min(0, 'Điểm không âm.').max(1000, 'Tối đa 1000 điểm.');

/** Luật vòng Khởi động (7.1). */
export const warmupRulesSchema = z
  .object({
    answerMode: answerModeSchema,
    individual: z.object({
      enabled: z.boolean(),
      questionsPerPlayer: z.number().int().min(1, 'Tối thiểu 1 câu.').max(20, 'Tối đa 20 câu.'),
      timeSeconds: seconds(120),
      pointsCorrect: points,
    }),
    shared: z.object({
      enabled: z.boolean(),
      questionCount: z.number().int().min(1, 'Tối thiểu 1 câu.').max(40, 'Tối đa 40 câu.'),
      /** Thời gian mở chuông chờ người giành quyền. */
      buzzSeconds: seconds(60),
      /** Thời gian trả lời sau khi giành quyền. */
      answerSeconds: seconds(120),
      pointsCorrect: points,
      /** Số điểm bị trừ khi trả lời sai. */
      pointsWrong: points,
      /** Sau khi trả lời sai: mở chuông lại cho người khác hoặc chuyển câu. */
      afterWrong: z.enum(['reopen', 'next']),
    }),
  })
  .refine((rules) => rules.individual.enabled || rules.shared.enabled, {
    path: ['individual', 'enabled'],
    message: 'Bật ít nhất một phần thi.',
  });
export type WarmupRules = z.infer<typeof warmupRulesSchema>;

export interface RoundPreset<R> {
  id: string;
  name: string;
  rules: R;
}

/** Preset vòng Khởi động (BR-ROUND-00). Thêm preset không cần sửa engine. */
export const WARMUP_PRESETS: readonly RoundPreset<WarmupRules>[] = [
  {
    id: 'olympia',
    name: 'Mặc định Olympia',
    rules: {
      answerMode: 'device',
      individual: { enabled: true, questionsPerPlayer: 6, timeSeconds: 5, pointsCorrect: 10 },
      shared: {
        enabled: true,
        questionCount: 12,
        buzzSeconds: 5,
        answerSeconds: 5,
        pointsCorrect: 10,
        pointsWrong: 5,
        afterWrong: 'reopen',
      },
    },
  },
  {
    id: 'short',
    name: 'Rút gọn',
    rules: {
      answerMode: 'device',
      individual: { enabled: true, questionsPerPlayer: 3, timeSeconds: 10, pointsCorrect: 10 },
      shared: {
        enabled: true,
        questionCount: 6,
        buzzSeconds: 5,
        answerSeconds: 10,
        pointsCorrect: 10,
        pointsWrong: 5,
        afterWrong: 'next',
      },
    },
  },
  {
    id: 'verbal',
    name: 'Trả lời bằng lời',
    rules: {
      answerMode: 'verbal',
      individual: { enabled: true, questionsPerPlayer: 6, timeSeconds: 5, pointsCorrect: 10 },
      shared: {
        enabled: true,
        questionCount: 12,
        buzzSeconds: 5,
        answerSeconds: 5,
        pointsCorrect: 10,
        pointsWrong: 5,
        afterWrong: 'reopen',
      },
    },
  },
];

/**
 * Luật vòng Vượt chướng ngại vật (7.2, DL-041). Câu hỏi của vòng theo thứ tự trong bộ đề: câu 1
 * là từ khóa CNV (media của câu là ảnh nền), tiếp theo là các hàng ngang, cuối cùng là ô trung tâm
 * (nếu bật). Mọi câu đều là trả lời ngắn.
 */
export const obstacleRulesSchema = z.object({
  rowCount: z.number().int().min(1, 'Tối thiểu 1 hàng.').max(8, 'Tối đa 8 hàng.'),
  centerEnabled: z.boolean(),
  /** Ai chọn hàng tiếp theo: lần lượt từng Player, hoặc mở theo thứ tự hàng. */
  rowSelection: z.enum(['player', 'order']),
  rowSeconds: seconds(120),
  rowPoints: points,
  /** Điểm CNV khi mới mở 1 hàng; mỗi hàng mở thêm giảm `keywordStep`. */
  keywordStartPoints: points,
  keywordStep: points,
  /** Điểm CNV sau khi đã mở ô trung tâm (và mức thấp nhất). */
  keywordCenterPoints: points,
});
export type ObstacleRules = z.infer<typeof obstacleRulesSchema>;

/** Luật vòng Tăng tốc (7.3). */
export const accelerationRulesSchema = z.object({
  questionCount: z.number().int().min(1, 'Tối thiểu 1 câu.').max(20, 'Tối đa 20 câu.'),
  timeSeconds: seconds(120),
  /** Điểm theo thứ tự trả lời đúng nhanh nhất (người đúng thứ 1, 2, ...). */
  rankPoints: z.array(points).min(1, 'Nhập ít nhất 1 mức điểm.').max(4, 'Tối đa 4 mức điểm.'),
  /** Cho gửi lại để ghi đè đáp án trước (thời gian tính theo lần gửi cuối). */
  allowResubmit: z.boolean(),
});
export type AccelerationRules = z.infer<typeof accelerationRulesSchema>;

export const finishLevelSchema = z.object({
  points: z.number().int().min(1, 'Điểm tối thiểu 1.').max(1000, 'Tối đa 1000 điểm.'),
  seconds: seconds(120),
});

/** Luật vòng Về đích (7.4, DL-043). */
export const finishRulesSchema = z
  .object({
    answerMode: answerModeSchema,
    /** Thứ tự thi: điểm thấp thi trước hoặc theo vị trí. */
    order: z.enum(['score_asc', 'seat']),
    questionsPerPlayer: z.number().int().min(1, 'Tối thiểu 1 câu.').max(6, 'Tối đa 6 câu.'),
    /** Các mức điểm Player chọn cho từng câu trong gói. */
    levels: z.array(finishLevelSchema).min(1, 'Cần ít nhất 1 mức điểm.').max(3, 'Tối đa 3 mức.'),
    /** Ngôi sao hy vọng: tối đa 1 lần mỗi lượt; đúng ×2, sai trừ điểm câu. */
    starEnabled: z.boolean(),
    steal: z.object({
      enabled: z.boolean(),
      /** Thời gian bấm chuông giành quyền. */
      buzzSeconds: seconds(60),
      /** Thời gian trả lời sau khi giành quyền. */
      answerSeconds: seconds(120),
      /** Đúng: điểm câu lấy từ Player chính (hoặc hệ thống cộng thêm). */
      takeFromMain: z.boolean(),
      /** Sai: bị trừ bao nhiêu % điểm câu. */
      wrongPenaltyPercent: z.number().int().min(0).max(100),
    }),
  })
  .refine((rules) => new Set(rules.levels.map((l) => l.points)).size === rules.levels.length, {
    path: ['levels'],
    message: 'Các mức điểm phải khác nhau.',
  });
export type FinishRules = z.infer<typeof finishRulesSchema>;

export const OBSTACLE_PRESETS: readonly RoundPreset<ObstacleRules>[] = [
  {
    id: 'olympia',
    name: 'Mặc định Olympia',
    rules: {
      rowCount: 4,
      centerEnabled: true,
      rowSelection: 'player',
      rowSeconds: 15,
      rowPoints: 10,
      keywordStartPoints: 80,
      keywordStep: 20,
      keywordCenterPoints: 10,
    },
  },
  {
    id: 'in_order',
    name: 'Mở hàng theo thứ tự',
    rules: {
      rowCount: 4,
      centerEnabled: true,
      rowSelection: 'order',
      rowSeconds: 20,
      rowPoints: 10,
      keywordStartPoints: 80,
      keywordStep: 20,
      keywordCenterPoints: 10,
    },
  },
];

export const ACCELERATION_PRESETS: readonly RoundPreset<AccelerationRules>[] = [
  {
    id: 'olympia',
    name: 'Mặc định Olympia',
    rules: {
      questionCount: 4,
      timeSeconds: 30,
      rankPoints: [40, 30, 20, 10],
      allowResubmit: false,
    },
  },
  {
    id: 'resubmit',
    name: 'Cho sửa đáp án',
    rules: { questionCount: 4, timeSeconds: 30, rankPoints: [40, 30, 20, 10], allowResubmit: true },
  },
];

const FINISH_STEAL_DEFAULT: FinishRules['steal'] = {
  enabled: true,
  buzzSeconds: 5,
  answerSeconds: 10,
  takeFromMain: true,
  wrongPenaltyPercent: 50,
};

export const FINISH_PRESETS: readonly RoundPreset<FinishRules>[] = [
  {
    id: 'olympia',
    name: 'Mặc định Olympia',
    rules: {
      answerMode: 'device',
      order: 'score_asc',
      questionsPerPlayer: 3,
      levels: [
        { points: 20, seconds: 15 },
        { points: 30, seconds: 20 },
      ],
      starEnabled: true,
      steal: FINISH_STEAL_DEFAULT,
    },
  },
  {
    id: 'verbal',
    name: 'Trả lời bằng lời',
    rules: {
      answerMode: 'verbal',
      order: 'score_asc',
      questionsPerPlayer: 3,
      levels: [
        { points: 20, seconds: 15 },
        { points: 30, seconds: 20 },
      ],
      starEnabled: true,
      steal: FINISH_STEAL_DEFAULT,
    },
  },
];

const roundBase = {
  /** Preset đã chọn làm gốc (chỉ để hiển thị; `rules` là giá trị thật). */
  preset: z.string().max(40),
  /** `null` khi đang soạn; bắt buộc trước khi bắt đầu trận (BR-SCRIPT-01). */
  source: questionSourceSchema.nullable(),
};

export const warmupRoundSchema = z.object({
  type: z.literal('warmup'),
  ...roundBase,
  rules: warmupRulesSchema,
});
export const obstacleRoundSchema = z.object({
  type: z.literal('obstacle'),
  ...roundBase,
  rules: obstacleRulesSchema,
});
export const accelerationRoundSchema = z.object({
  type: z.literal('acceleration'),
  ...roundBase,
  rules: accelerationRulesSchema,
});
export const finishRoundSchema = z.object({
  type: z.literal('finish'),
  ...roundBase,
  rules: finishRulesSchema,
});

/** Một vòng trong kịch bản. */
export const scriptRoundSchema = z.discriminatedUnion('type', [
  warmupRoundSchema,
  obstacleRoundSchema,
  accelerationRoundSchema,
  finishRoundSchema,
]);
export type ScriptRound = z.infer<typeof scriptRoundSchema>;
export type RoundType = ScriptRound['type'];

export const scriptSettingsSchema = z.object({
  /** Nghỉ giữa vòng (giây), dùng ở chế độ tự động. */
  breakSeconds: z.number().int().min(0).max(600),
  soundEffects: z.boolean(),
  /** BR-SCORE-03: mặc định điểm tổng không âm. */
  allowNegativeScore: z.boolean(),
  /** 8.5: Player đến lượt mất kết nối thì tạm dừng trận hay tính là bỏ qua. */
  onTurnDisconnect: z.enum(['pause', 'skip']),
  /** Chế độ tự động: thời gian hiển thị câu hỏi trước khi bắt đầu tính giờ (giây). */
  autoReadSeconds: z.number().int().min(0).max(60).default(3),
  /** Chế độ tự động: thời gian hiển thị đáp án trước khi chuyển câu (8.4, mặc định 3 giây). */
  autoRevealSeconds: z.number().int().min(1).max(60).default(3),
  /** 9.3: câu hỏi phụ khi các Player dẫn đầu hòa điểm sau vòng cuối; tắt thì đồng hạng. */
  tiebreakEnabled: z.boolean().default(true),
});
export type ScriptSettings = z.infer<typeof scriptSettingsSchema>;

export const DEFAULT_SCRIPT_SETTINGS: ScriptSettings = {
  breakSeconds: 30,
  soundEffects: true,
  allowNegativeScore: false,
  onTurnDisconnect: 'pause',
  autoReadSeconds: 3,
  autoRevealSeconds: 3,
  tiebreakEnabled: true,
};

/** Thiết lập của kịch bản cũ (trước P5) thiếu trường mới: điền giá trị mặc định. */
export function withSettingDefaults(settings: Partial<ScriptSettings>): ScriptSettings {
  return { ...DEFAULT_SCRIPT_SETTINGS, ...settings };
}

/** Điểm CNV khi giải được sau `opened` hàng (đã mở ô trung tâm thì dùng `keywordCenterPoints`). */
export function obstacleKeywordPoints(
  rules: ObstacleRules,
  opened: number,
  centerOpened: boolean,
): number {
  if (centerOpened) return rules.keywordCenterPoints;
  const value = rules.keywordStartPoints - rules.keywordStep * Math.max(0, opened - 1);
  return Math.max(rules.keywordCenterPoints, value);
}

export const scriptInputSchema = z.object({
  name: z
    .string()
    .transform((value) => value.trim().replace(/\s+/g, ' '))
    .pipe(
      z
        .string()
        .min(3, 'Tên kịch bản tối thiểu 3 ký tự.')
        .max(100, 'Tên kịch bản tối đa 100 ký tự.'),
    ),
  settings: scriptSettingsSchema,
  rounds: z
    .array(scriptRoundSchema)
    .min(1, 'Kịch bản cần ít nhất 1 vòng thi.')
    .max(4, 'Tối đa 4 vòng thi.')
    .refine(
      (rounds) => new Set(rounds.map((r) => r.type)).size === rounds.length,
      'Mỗi loại vòng chỉ xuất hiện một lần.',
    ),
});
export type ScriptInput = z.input<typeof scriptInputSchema>;

/** Thông tin nguồn câu hỏi của vòng, kèm số câu dùng được cho vòng đó. */
export const sourceInfoSchema = z.object({
  kind: z.enum(['set', 'public']),
  name: z.string(),
  /** Số câu hỏi trong nguồn được xếp cho vòng này. */
  available: z.number().int(),
  /** Nguồn không còn dùng được (bộ đề đã xóa, bộ public không còn). */
  unavailable: z.boolean(),
});
export type SourceInfo = z.infer<typeof sourceInfoSchema>;

/** Đánh giá đủ câu hỏi của vòng (BR-SCRIPT-01). */
export const roundCheckSchema = z.object({
  /** Số câu cố định (không phụ thuộc số người chơi). */
  fixed: z.number().int(),
  /** Số câu cho mỗi người chơi. */
  perPlayer: z.number().int(),
  /** Số người chơi tối đa (0–4) mà nguồn đủ câu. */
  supportedPlayers: z.number().int(),
  issues: z.array(z.string()),
});
export type RoundCheck = z.infer<typeof roundCheckSchema>;

export const scriptDetailSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  settings: scriptSettingsSchema,
  rounds: z.array(
    z.object({
      round: scriptRoundSchema,
      source: sourceInfoSchema.nullable(),
      check: roundCheckSchema,
    }),
  ),
  updatedAt: z.iso.datetime(),
});
export type ScriptDetail = z.infer<typeof scriptDetailSchema>;

export const scriptSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  rounds: z.array(z.enum(['warmup', 'obstacle', 'acceleration', 'finish'])),
  /** Số người chơi tối đa mọi vòng đều đủ câu (0 = chưa dùng được). */
  supportedPlayers: z.number().int(),
  updatedAt: z.iso.datetime(),
});
export type ScriptSummary = z.infer<typeof scriptSummarySchema>;

export const scriptListSchema = z.object({ items: z.array(scriptSummarySchema) });

export const duplicateScriptRequestSchema = z.object({
  name: scriptInputSchema.shape.name.optional(),
});

/** Số câu cần cho vòng Khởi động theo luật. */
export function warmupRequirement(rules: WarmupRules): { fixed: number; perPlayer: number } {
  return {
    fixed: rules.shared.enabled ? rules.shared.questionCount : 0,
    perPlayer: rules.individual.enabled ? rules.individual.questionsPerPlayer : 0,
  };
}

/** Số người chơi tối đa (0–4) mà `available` câu hỏi đủ dùng. */
export function supportedPlayersFor(
  available: number,
  requirement: { fixed: number; perPlayer: number },
  maxPlayers = 4,
): number {
  if (available < requirement.fixed) return 0;
  if (requirement.perPlayer === 0) return maxPlayers;
  return Math.min(maxPlayers, Math.floor((available - requirement.fixed) / requirement.perPlayer));
}

/** Số câu cần theo luật của một vòng (BR-SCRIPT-01). */
export function roundRequirement(round: ScriptRound): { fixed: number; perPlayer: number } {
  switch (round.type) {
    case 'warmup':
      return warmupRequirement(round.rules);
    case 'obstacle':
      // Từ khóa + các hàng ngang + ô trung tâm.
      return {
        fixed: 1 + round.rules.rowCount + (round.rules.centerEnabled ? 1 : 0),
        perPlayer: 0,
      };
    case 'acceleration':
      return { fixed: round.rules.questionCount, perPlayer: 0 };
    case 'finish':
      return { fixed: 0, perPlayer: round.rules.questionsPerPlayer };
  }
}

/** Preset của từng loại vòng (BR-ROUND-00). */
export const ROUND_PRESETS = {
  warmup: WARMUP_PRESETS,
  obstacle: OBSTACLE_PRESETS,
  acceleration: ACCELERATION_PRESETS,
  finish: FINISH_PRESETS,
} as const;
