import { z } from 'zod';

/** Hợp đồng ngân hàng câu hỏi, bộ đề, media và kiểm duyệt bộ public (đặc tả mục 5, P2). */

export const QuestionErrorCode = {
  MediaInvalid: 'MEDIA_INVALID',
  MediaNotReady: 'MEDIA_NOT_READY',
  MediaTooLarge: 'MEDIA_TOO_LARGE',
  MediaTypeNotAllowed: 'MEDIA_TYPE_NOT_ALLOWED',
  EmptySet: 'QUESTION_SET_EMPTY',
  InvalidReviewState: 'INVALID_REVIEW_STATE',
} as const;

// --- Phân loại ---

/** Bốn vòng thi (mục 7). Khóa ổn định, nhãn hiển thị ở frontend. */
export const ROUND_KEYS = ['warmup', 'obstacle', 'acceleration', 'finish'] as const;
export const roundKeySchema = z.enum(ROUND_KEYS);
export type RoundKey = z.infer<typeof roundKeySchema>;

/** Dạng đáp án (5.2). Câu hỏi hình ảnh/video/âm thanh = media + một dạng đáp án. */
export const answerTypeSchema = z.enum(['mcq', 'true_false', 'short_answer']);
export type AnswerType = z.infer<typeof answerTypeSchema>;

export const difficultySchema = z.enum(['easy', 'medium', 'hard']);
export type Difficulty = z.infer<typeof difficultySchema>;

export const mediaKindSchema = z.enum(['image', 'video', 'audio']);
export type MediaKind = z.infer<typeof mediaKindSchema>;

export const MIN_GRADE = 1;
export const MAX_GRADE = 12;
export const MCQ_MIN_OPTIONS = 2;
export const MCQ_MAX_OPTIONS = 6;
export const MAX_ACCEPTED_ANSWERS = 20;
export const MAX_TAGS = 10;
export const MAX_SET_ITEMS = 200;

// --- Media (BR-QB-02) ---

const MB = 1024 * 1024;

/** Định dạng và dung lượng tối đa theo loại media (mặc định đề xuất BR-QB-02). */
export const MEDIA_RULES: Record<MediaKind, { maxBytes: number; contentTypes: readonly string[] }> =
  {
    image: { maxBytes: 5 * MB, contentTypes: ['image/jpeg', 'image/png', 'image/webp'] },
    video: { maxBytes: 50 * MB, contentTypes: ['video/mp4'] },
    audio: { maxBytes: 50 * MB, contentTypes: ['audio/mpeg'] },
  };

/** Loại media theo content type; `null` nếu không được hỗ trợ. */
export function mediaKindOf(contentType: string): MediaKind | null {
  for (const kind of mediaKindSchema.options) {
    if (MEDIA_RULES[kind].contentTypes.includes(contentType)) return kind;
  }
  return null;
}

export const createUploadRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().toLowerCase().max(100),
  sizeBytes: z.number().int().min(1),
});
export type CreateUploadRequest = z.input<typeof createUploadRequestSchema>;

export const createUploadResponseSchema = z.object({
  mediaId: z.uuid(),
  /** Presigned URL: client PUT nội dung tệp trực tiếp lên object storage. */
  uploadUrl: z.url(),
  /** Header bắt buộc gửi kèm khi PUT. */
  headers: z.record(z.string(), z.string()),
  expiresAt: z.iso.datetime(),
});
export type CreateUploadResponse = z.infer<typeof createUploadResponseSchema>;

export const mediaViewSchema = z.object({
  id: z.uuid(),
  kind: mediaKindSchema,
  contentType: z.string(),
  sizeBytes: z.number().int(),
  /** URL đọc tạm thời (presigned), hết hạn sau một khoảng ngắn. */
  url: z.url(),
});
export type MediaView = z.infer<typeof mediaViewSchema>;

// --- Câu hỏi ---

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => (value.length > 0 ? value : null))
    .nullable();

const answerText = z
  .string()
  .trim()
  .min(1, 'Đáp án không được để trống.')
  .max(200, 'Đáp án tối đa 200 ký tự.');

export const mcqAnswerSchema = z
  .object({
    type: z.literal('mcq'),
    options: z
      .array(
        z
          .string()
          .trim()
          .min(1, 'Phương án không được để trống.')
          .max(300, 'Phương án tối đa 300 ký tự.'),
      )
      .min(MCQ_MIN_OPTIONS, `Cần ít nhất ${MCQ_MIN_OPTIONS} phương án.`)
      .max(MCQ_MAX_OPTIONS, `Tối đa ${MCQ_MAX_OPTIONS} phương án.`),
    correctIndex: z.number().int().min(0),
  })
  .refine((answer) => answer.correctIndex < answer.options.length, {
    path: ['correctIndex'],
    message: 'Chọn đúng 1 đáp án đúng.',
  });

export const trueFalseAnswerSchema = z.object({
  type: z.literal('true_false'),
  correct: z.boolean(),
});

export const shortAnswerSchema = z.object({
  type: z.literal('short_answer'),
  answer: answerText,
  acceptedAnswers: z
    .array(answerText)
    .max(MAX_ACCEPTED_ANSWERS, `Tối đa ${MAX_ACCEPTED_ANSWERS} đáp án chấp nhận.`)
    .default([]),
  /** BR-QB-01: tùy chọn bỏ dấu tiếng Việt khi so khớp. */
  ignoreDiacritics: z.boolean().default(false),
});

export const answerSchema = z.discriminatedUnion('type', [
  mcqAnswerSchema,
  trueFalseAnswerSchema,
  shortAnswerSchema,
]);
export type QuestionAnswer = z.infer<typeof answerSchema>;

const tagSchema = z.string().trim().toLowerCase().min(1).max(30, 'Mỗi thẻ tối đa 30 ký tự.');

export const questionInputSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Nhập nội dung câu hỏi.')
    .max(2000, 'Nội dung tối đa 2000 ký tự.'),
  answer: answerSchema,
  explanation: optionalText(2000, 'Giải thích tối đa 2000 ký tự.').default(null),
  mediaId: z.uuid().nullable().default(null),
  subject: optionalText(50, 'Môn học tối đa 50 ký tự.').default(null),
  topic: optionalText(100, 'Chủ đề tối đa 100 ký tự.').default(null),
  grade: z.number().int().min(MIN_GRADE).max(MAX_GRADE).nullable().default(null),
  difficulty: difficultySchema.nullable().default(null),
  rounds: z
    .array(roundKeySchema)
    .max(ROUND_KEYS.length)
    .transform((rounds) => [...new Set(rounds)])
    .default([]),
  defaultPoints: z
    .number()
    .int()
    .min(0, 'Điểm không âm.')
    .max(1000, 'Điểm tối đa 1000.')
    .nullable()
    .default(null),
  defaultTimeSeconds: z
    .number()
    .int()
    .min(1, 'Thời gian tối thiểu 1 giây.')
    .max(600, 'Thời gian tối đa 600 giây.')
    .nullable()
    .default(null),
  tags: z
    .array(tagSchema)
    .max(MAX_TAGS, `Tối đa ${MAX_TAGS} thẻ.`)
    .transform((tags) => [...new Set(tags)])
    .default([]),
});
export type QuestionInput = z.input<typeof questionInputSchema>;

export const questionViewSchema = z.object({
  id: z.uuid(),
  content: z.string(),
  answer: answerSchema,
  explanation: z.string().nullable(),
  media: mediaViewSchema.nullable(),
  subject: z.string().nullable(),
  topic: z.string().nullable(),
  grade: z.number().int().nullable(),
  difficulty: difficultySchema.nullable(),
  rounds: z.array(roundKeySchema),
  defaultPoints: z.number().int().nullable(),
  defaultTimeSeconds: z.number().int().nullable(),
  tags: z.array(z.string()),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type QuestionView = z.infer<typeof questionViewSchema>;

export const QUESTION_PAGE_SIZE_MAX = 100;

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

/** Bộ lọc ngân hàng câu hỏi (5.1: môn/chủ đề/lớp/độ khó/vòng/thẻ). Dùng cho query string. */
export const questionListQuerySchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
  subject: z.preprocess(emptyToUndefined, z.string().trim().max(50).optional()),
  grade: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(MIN_GRADE).max(MAX_GRADE).optional(),
  ),
  difficulty: z.preprocess(emptyToUndefined, difficultySchema.optional()),
  answerType: z.preprocess(emptyToUndefined, answerTypeSchema.optional()),
  /** `none`: câu hỏi không có media. */
  media: z.preprocess(emptyToUndefined, z.enum(['none', 'image', 'video', 'audio']).optional()),
  round: z.preprocess(emptyToUndefined, roundKeySchema.optional()),
  tag: z.preprocess(emptyToUndefined, z.string().trim().toLowerCase().max(30).optional()),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(QUESTION_PAGE_SIZE_MAX).default(20),
});
/** Bộ lọc phía client (đều tùy chọn; server áp mặc định trang). */
export type QuestionListQuery = Partial<z.output<typeof questionListQuerySchema>>;

export const questionListSchema = z.object({
  items: z.array(questionViewSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
export type QuestionList = z.infer<typeof questionListSchema>;

/** Giá trị đang dùng trong ngân hàng của Host, để gợi ý ở bộ lọc. */
export const questionFacetsSchema = z.object({
  subjects: z.array(z.string()),
  grades: z.array(z.number().int()),
  total: z.number().int(),
});
export type QuestionFacets = z.infer<typeof questionFacetsSchema>;

export const questionIdsRequestSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(QUESTION_PAGE_SIZE_MAX),
});

// --- Bộ đề (5.3) ---

export const questionSetInputSchema = z.object({
  name: z
    .string()
    .transform((value) => value.trim().replace(/\s+/g, ' '))
    .pipe(
      z.string().min(3, 'Tên bộ đề tối thiểu 3 ký tự.').max(100, 'Tên bộ đề tối đa 100 ký tự.'),
    ),
  description: optionalText(500, 'Mô tả tối đa 500 ký tự.').default(null),
  subject: optionalText(50, 'Môn học tối đa 50 ký tự.').default(null),
  grade: z.number().int().min(MIN_GRADE).max(MAX_GRADE).nullable().default(null),
});
export type QuestionSetInput = z.input<typeof questionSetInputSchema>;

export const setItemInputSchema = z.object({
  questionId: z.uuid(),
  /** Nhóm theo vòng để gán vào kịch bản; `null` = chưa xếp vòng. */
  round: roundKeySchema.nullable(),
});

/** Thay toàn bộ danh sách câu hỏi (theo thứ tự) của bộ đề. */
export const replaceSetItemsRequestSchema = z.object({
  items: z
    .array(setItemInputSchema)
    .max(MAX_SET_ITEMS, `Bộ đề tối đa ${MAX_SET_ITEMS} câu hỏi.`)
    .refine(
      (items) => new Set(items.map((item) => item.questionId)).size === items.length,
      'Mỗi câu hỏi chỉ xuất hiện một lần trong bộ đề.',
    ),
});

export const appendSetItemsRequestSchema = z.object({
  questionIds: z.array(z.uuid()).min(1).max(MAX_SET_ITEMS),
  round: roundKeySchema.nullable().default(null),
});

/** Chọn câu ngẫu nhiên theo tiêu chí (5.3). */
export const randomFillRequestSchema = z.object({
  count: z.number().int().min(1).max(50),
  round: roundKeySchema.nullable().default(null),
  /** Chỉ lấy câu hỏi đánh dấu phù hợp với vòng `round`. */
  matchRound: z.boolean().default(true),
  subject: optionalText(50, 'Môn học tối đa 50 ký tự.').default(null),
  grade: z.number().int().min(MIN_GRADE).max(MAX_GRADE).nullable().default(null),
  difficulty: difficultySchema.nullable().default(null),
  /** Chỉ lấy câu có dạng đáp án này (trắc nghiệm / đúng-sai / trả lời ngắn). */
  answerType: answerTypeSchema.nullable().default(null),
});
export type RandomFillRequest = z.input<typeof randomFillRequestSchema>;

export const publicationStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
  'superseded',
  'withdrawn',
]);
export type PublicationStatus = z.infer<typeof publicationStatusSchema>;

/** Trạng thái chia sẻ public của một bộ đề (5.4, BR-QB-09). */
export const setPublicationSchema = z.object({
  /** Phiên bản đang public (đã duyệt). */
  approved: z
    .object({ versionId: z.uuid(), versionNo: z.number().int(), reviewedAt: z.iso.datetime() })
    .nullable(),
  /** Phiên bản đang chờ duyệt. */
  pending: z
    .object({ versionId: z.uuid(), versionNo: z.number().int(), submittedAt: z.iso.datetime() })
    .nullable(),
  /** Lần gửi duyệt gần nhất bị từ chối (nếu sau đó chưa gửi lại). */
  rejected: z
    .object({
      versionId: z.uuid(),
      versionNo: z.number().int(),
      reason: z.string(),
      reviewedAt: z.iso.datetime(),
    })
    .nullable(),
});
export type SetPublication = z.infer<typeof setPublicationSchema>;

export const questionSetSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  subject: z.string().nullable(),
  grade: z.number().int().nullable(),
  questionCount: z.number().int(),
  roundCounts: z.record(z.string(), z.number().int()),
  publication: setPublicationSchema,
  updatedAt: z.iso.datetime(),
});
export type QuestionSetSummary = z.infer<typeof questionSetSummarySchema>;

export const questionSetDetailSchema = questionSetSummarySchema.extend({
  items: z.array(z.object({ round: roundKeySchema.nullable(), question: questionViewSchema })),
});
export type QuestionSetDetail = z.infer<typeof questionSetDetailSchema>;

export const questionSetListSchema = z.object({ items: z.array(questionSetSummarySchema) });

// --- Bộ public và kiểm duyệt (5.4) ---

/** Câu hỏi trong bản snapshot của một phiên bản bộ public. */
export const snapshotQuestionSchema = questionViewSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({ sourceQuestionId: z.uuid() });
export type SnapshotQuestion = z.infer<typeof snapshotQuestionSchema>;

export const publicSetSummarySchema = z.object({
  versionId: z.uuid(),
  setId: z.uuid(),
  versionNo: z.number().int(),
  name: z.string(),
  description: z.string().nullable(),
  subject: z.string().nullable(),
  grade: z.number().int().nullable(),
  ownerName: z.string(),
  /** Bộ public của chính người xem. */
  mine: z.boolean(),
  questionCount: z.number().int(),
  approvedAt: z.iso.datetime(),
});
export type PublicSetSummary = z.infer<typeof publicSetSummarySchema>;

export const publicSetListSchema = z.object({ items: z.array(publicSetSummarySchema) });

export const publicSetDetailSchema = publicSetSummarySchema.extend({
  items: z.array(z.object({ round: roundKeySchema.nullable(), question: snapshotQuestionSchema })),
});
export type PublicSetDetail = z.infer<typeof publicSetDetailSchema>;

export const publicSetListQuerySchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
  subject: z.preprocess(emptyToUndefined, z.string().trim().max(50).optional()),
});

export const reviewQueueItemSchema = z.object({
  versionId: z.uuid(),
  setId: z.uuid(),
  versionNo: z.number().int(),
  name: z.string(),
  ownerName: z.string(),
  questionCount: z.number().int(),
  /** `update`: bộ đã có phiên bản public, đây là bản cập nhật (BR-QB-09). */
  kind: z.enum(['new', 'update']),
  submittedAt: z.iso.datetime(),
});
export type ReviewQueueItem = z.infer<typeof reviewQueueItemSchema>;

export const reviewQueueSchema = z.object({ items: z.array(reviewQueueItemSchema) });

export const versionChangeSchema = z.object({
  kind: z.enum(['added', 'changed', 'removed']),
  question: snapshotQuestionSchema,
});

export const reviewDetailSchema = reviewQueueItemSchema.extend({
  description: z.string().nullable(),
  subject: z.string().nullable(),
  grade: z.number().int().nullable(),
  status: publicationStatusSchema,
  /** Phiên bản đang public của cùng bộ (nếu có), để so sánh. */
  approvedVersionNo: z.number().int().nullable(),
  mediaCount: z.number().int(),
  /** So với phiên bản đang public; bộ mới thì mọi câu là `added`. */
  changes: z.array(versionChangeSchema),
  items: z.array(z.object({ round: roundKeySchema.nullable(), question: snapshotQuestionSchema })),
});
export type ReviewDetail = z.infer<typeof reviewDetailSchema>;

export const rejectVersionRequestSchema = z.object({
  reason: z.string().trim().min(5, 'Lý do tối thiểu 5 ký tự.').max(500, 'Lý do tối đa 500 ký tự.'),
});

// --- So khớp câu trả lời ngắn (BR-QB-01) ---

/** Bỏ dấu tiếng Việt (kể cả đ/Đ). */
export function removeVietnameseDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

/** Chuẩn hóa để so khớp: bỏ khoảng trắng thừa, không phân biệt hoa/thường, tùy chọn bỏ dấu. */
export function normalizeAnswer(value: string, ignoreDiacritics: boolean): string {
  const collapsed = value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN');
  return ignoreDiacritics ? removeVietnameseDiacritics(collapsed) : collapsed;
}

/** Câu trả lời khớp đáp án chuẩn hoặc một đáp án chấp nhận. */
export function matchShortAnswer(
  input: string,
  answer: Pick<
    z.infer<typeof shortAnswerSchema>,
    'answer' | 'acceptedAnswers' | 'ignoreDiacritics'
  >,
): boolean {
  const normalized = normalizeAnswer(input, answer.ignoreDiacritics);
  if (normalized.length === 0) return false;
  return [answer.answer, ...answer.acceptedAnswers].some(
    (candidate) => normalizeAnswer(candidate, answer.ignoreDiacritics) === normalized,
  );
}
