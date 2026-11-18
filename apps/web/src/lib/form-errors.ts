import { CommonErrorCode } from '@olympia/shared';
import type { z } from 'zod';
import { ApiError } from './http';

export type FieldErrors = Partial<Record<string, string>>;

/** Lỗi đầu tiên của mỗi trường cấp một từ kết quả Zod. */
export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const result: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '');
    result[key] ??= issue.message;
  }
  return result;
}

/** Lỗi theo trường từ phản hồi `VALIDATION_ERROR` của server (nếu có). */
export function apiFieldErrors(error: unknown): FieldErrors {
  if (!(error instanceof ApiError) || error.code !== CommonErrorCode.ValidationError) return {};
  if (!Array.isArray(error.details)) return {};
  const result: FieldErrors = {};
  for (const item of error.details as { path?: unknown[]; message?: string }[]) {
    const first = item.path?.[0];
    const key = typeof first === 'string' || typeof first === 'number' ? String(first) : '';
    if (item.message) result[key] ??= item.message;
  }
  return result;
}

/**
 * Kiểm tra dữ liệu form bằng schema dùng chung với backend.
 * Trả về dữ liệu đã chuẩn hóa, hoặc lỗi theo trường.
 */
export function validate<S extends z.ZodType>(
  schema: S,
  values: unknown,
): { data: z.output<S>; errors?: undefined } | { data?: undefined; errors: FieldErrors } {
  const parsed = schema.safeParse(values);
  return parsed.success ? { data: parsed.data } : { errors: zodFieldErrors(parsed.error) };
}
