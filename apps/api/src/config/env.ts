import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:5173')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0),
      ),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    REDIS_URL: z.url({ protocol: /^rediss?$/ }),

    /** Số proxy tin cậy phía trước (để lấy đúng IP client cho rate limit). 0 = không có proxy. */
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    /** URL giao diện web, dùng tạo link trong email. */
    APP_URL: z.url().default('http://localhost:5173'),

    /** Khóa ký JWT (HS256). Tối thiểu 32 ký tự; mỗi môi trường một giá trị riêng. */
    JWT_SECRET: z.string().min(32, 'JWT_SECRET cần tối thiểu 32 ký tự.'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    /** Hiệu lực phiên khách (BR-AUTH-05). */
    GUEST_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
    /** Cookie chỉ gửi qua HTTPS. Mặc định bật ở production. */
    COOKIE_SECURE: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => (value === undefined ? undefined : value === 'true')),

    /** Giới hạn đăng nhập sai liên tiếp (BR-AUTH-03). */
    LOGIN_MAX_FAILURES: z.coerce.number().int().min(1).default(5),
    LOGIN_FAILURE_WINDOW_MINUTES: z.coerce.number().int().min(1).default(15),

    SMTP_URL: z.url({ protocol: /^smtps?$/ }).default('smtp://localhost:1026'),
    MAIL_FROM: z.string().min(3).default('Olympia Online <no-reply@olympia.local>'),
  })
  .refine((env) => env.NODE_ENV !== 'production' || !env.JWT_SECRET.startsWith('dev-only'), {
    path: ['JWT_SECRET'],
    message: 'Không dùng JWT_SECRET mẫu ở production.',
  })
  .transform((env) => ({
    ...env,
    COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
  }));

export type Env = z.infer<typeof envSchema>;

/** Đọc và kiểm tra biến môi trường; ném lỗi ngay khi khởi động nếu cấu hình sai. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Biến môi trường không hợp lệ:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
