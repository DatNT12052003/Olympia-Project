import { z } from 'zod';

/**
 * Lỗi giao diện trình duyệt gửi về API (giám sát lỗi tự host, DL-053): chỉ ghi log có cấu trúc
 * và đếm metrics, không gửi ra dịch vụ bên ngoài (BR-DATA-06). Không kèm dữ liệu người dùng.
 */
export const clientErrorReportSchema = z.object({
  message: z.string().trim().min(1).max(500),
  stack: z.string().max(4000).optional(),
  /** Đường dẫn trang (không kèm query string để tránh lộ token trong link). */
  path: z.string().max(300),
  kind: z.enum(['error', 'unhandledrejection', 'render']),
  release: z.string().max(60).optional(),
});
export type ClientErrorReport = z.infer<typeof clientErrorReportSchema>;
