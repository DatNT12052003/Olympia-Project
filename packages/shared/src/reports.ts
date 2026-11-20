import { z } from 'zod';

/** Hợp đồng REST báo cáo vi phạm (mục 15.3, DL-050). */

export const ReportErrorCode = {
  ReportAlreadyResolved: 'REPORT_ALREADY_RESOLVED',
  /** Cách xử lý không áp dụng được cho báo cáo này (ví dụ chặn khách khi đối tượng là tài khoản). */
  ActionNotAllowed: 'REPORT_ACTION_NOT_ALLOWED',
} as const;

export const reportTargetTypeSchema = z.enum(['question_set_version', 'room']);
export type ReportTargetType = z.infer<typeof reportTargetTypeSchema>;

export const reportCategorySchema = z.enum([
  'wrong_answer',
  'inappropriate',
  'copyright',
  'harassment',
  'cheating',
  'other',
]);
export type ReportCategory = z.infer<typeof reportCategorySchema>;

export const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
  wrong_answer: 'Câu hỏi có đáp án sai',
  inappropriate: 'Nội dung không phù hợp',
  copyright: 'Vi phạm bản quyền',
  harassment: 'Quấy rối, xúc phạm',
  cheating: 'Gian lận',
  other: 'Khác',
};

/** Loại vi phạm theo đối tượng báo cáo. */
export const REPORT_CATEGORIES: Record<ReportTargetType, readonly ReportCategory[]> = {
  question_set_version: ['wrong_answer', 'inappropriate', 'copyright', 'other'],
  room: ['harassment', 'inappropriate', 'cheating', 'other'],
};

const description = z
  .string()
  .trim()
  .min(10, 'Mô tả tối thiểu 10 ký tự.')
  .max(1000, 'Mô tả tối đa 1000 ký tự.');

export const createReportRequestSchema = z
  .discriminatedUnion('targetType', [
    z.object({
      targetType: z.literal('question_set_version'),
      /** Phiên bản bộ public bị báo cáo. */
      targetId: z.uuid(),
      category: reportCategorySchema,
      description,
    }),
    z.object({
      targetType: z.literal('room'),
      /** Phòng xảy ra vi phạm. */
      targetId: z.uuid(),
      /** Người tham gia bị báo cáo; bỏ trống = báo cáo Host/phòng. */
      participantId: z.uuid().nullable().default(null),
      category: reportCategorySchema,
      description,
    }),
  ])
  .refine((input) => REPORT_CATEGORIES[input.targetType].includes(input.category), {
    path: ['category'],
    message: 'Loại vi phạm không phù hợp.',
  });
export type CreateReportRequest = z.input<typeof createReportRequestSchema>;

export const reportResolutionSchema = z.enum([
  'dismiss',
  'remove_content',
  'warn',
  'block_guest',
  'lock_account',
]);
export type ReportResolution = z.infer<typeof reportResolutionSchema>;

export const REPORT_RESOLUTION_LABELS: Record<ReportResolution, string> = {
  dismiss: 'Bỏ qua',
  remove_content: 'Gỡ nội dung',
  warn: 'Cảnh báo',
  block_guest: 'Chặn phiên khách',
  lock_account: 'Khóa tài khoản',
};

export const reportStatusSchema = z.enum(['open', 'resolved']);
export type ReportStatus = z.infer<typeof reportStatusSchema>;

export const reportSubjectSchema = z.object({
  kind: z.enum(['user', 'guest']),
  userId: z.uuid().nullable(),
  name: z.string(),
  /** Số lần đã bị cảnh báo (tài khoản). */
  warningCount: z.number().int().nullable(),
  /** Trạng thái tài khoản; `null` với khách. */
  accountStatus: z.string().nullable(),
  /** Số báo cáo trước đó về cùng đối tượng. */
  priorReports: z.number().int(),
});
export type ReportSubject = z.infer<typeof reportSubjectSchema>;

export const reportViewSchema = z.object({
  id: z.uuid(),
  targetType: reportTargetTypeSchema,
  targetId: z.uuid(),
  targetLabel: z.string(),
  subject: reportSubjectSchema.nullable(),
  category: reportCategorySchema,
  description: z.string(),
  reporterName: z.string().nullable(),
  status: reportStatusSchema,
  resolution: reportResolutionSchema.nullable(),
  resolutionNote: z.string().nullable(),
  resolvedByName: z.string().nullable(),
  resolvedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  /** Cách xử lý áp dụng được. */
  actions: z.array(reportResolutionSchema),
});
export type ReportView = z.infer<typeof reportViewSchema>;

export const reportListQuerySchema = z.object({
  status: reportStatusSchema.default('open'),
});

export const reportListSchema = z.object({
  items: z.array(reportViewSchema),
  openCount: z.number().int(),
});
export type ReportList = z.infer<typeof reportListSchema>;

export const resolveReportRequestSchema = z.object({
  action: reportResolutionSchema,
  note: z.string().trim().max(500, 'Ghi chú tối đa 500 ký tự.').default(''),
});
export type ResolveReportRequest = z.input<typeof resolveReportRequestSchema>;
