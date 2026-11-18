import { z } from 'zod';

/**
 * Mã lỗi chung trả về trong body lỗi của REST API.
 * Module nghiệp vụ có thể dùng thêm mã riêng (chuỗi UPPER_SNAKE_CASE).
 */
export const CommonErrorCode = {
  BadRequest: 'BAD_REQUEST',
  ValidationError: 'VALIDATION_ERROR',
  Unauthenticated: 'UNAUTHENTICATED',
  Forbidden: 'FORBIDDEN',
  NotFound: 'NOT_FOUND',
  Conflict: 'CONFLICT',
  PayloadTooLarge: 'PAYLOAD_TOO_LARGE',
  TooManyRequests: 'TOO_MANY_REQUESTS',
  InternalError: 'INTERNAL_ERROR',
} as const;

export type CommonErrorCode = (typeof CommonErrorCode)[keyof typeof CommonErrorCode];

export const apiErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;
