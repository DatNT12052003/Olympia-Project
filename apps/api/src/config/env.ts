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
    /** Số kết nối PostgreSQL tối đa mỗi instance API. */
    DATABASE_POOL_SIZE: z.coerce.number().int().min(2).max(200).default(20),

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

    /** Cổng `/metrics` cho Prometheus, chỉ mở trong mạng nội bộ. 0 = tắt. */
    METRICS_PORT: z.coerce.number().int().min(0).max(65535).default(0),

    /** Giới hạn chung số request REST mỗi phút cho một IP (mục 16, rate limit). 0 = tắt. */
    API_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(0).default(600),

    /** Giới hạn đăng nhập sai liên tiếp (BR-AUTH-03). */
    LOGIN_MAX_FAILURES: z.coerce.number().int().min(1).default(5),
    LOGIN_FAILURE_WINDOW_MINUTES: z.coerce.number().int().min(1).default(15),

    SMTP_URL: z.url({ protocol: /^smtps?$/ }).default('smtp://localhost:1026'),
    MAIL_FROM: z.string().min(3).default('Olympia Online <no-reply@olympia.local>'),

    /** Giới hạn phòng thi (DL-031); chuyển sang cấu hình hệ thống ở P7. */
    MAX_ACTIVE_ROOMS_PER_HOST: z.coerce.number().int().min(1).default(5),
    MAX_SPECTATORS_PER_ROOM: z.coerce.number().int().min(1).default(200),
    /** Giữ chỗ khi mất kết nối (BR-RC-01, DL-029). */
    RECONNECT_GRACE_SECONDS: z.coerce.number().int().min(5).default(120),
    /** Phòng Open không hoạt động thì tự đóng (BR-ROOM-02, DL-030). */
    ROOM_IDLE_MINUTES: z.coerce.number().int().min(1).default(60),
    /** Host mất kết nối quá thời gian này thì trận kết thúc bất thường (4.5). */
    HOST_RECONNECT_MINUTES: z.coerce.number().int().min(1).default(10),

    /** Object storage S3-compatible cho media câu hỏi (DL-025: SeaweedFS khi dev). */
    S3_ENDPOINT: z.url().default('http://localhost:8340'),
    /** Endpoint trình duyệt dùng để upload/tải; bỏ trống = S3_ENDPOINT. */
    S3_PUBLIC_ENDPOINT: z.url().optional(),
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_BUCKET: z.string().min(3).default('olympia-media'),
    S3_ACCESS_KEY_ID: z.string().min(1).default('dev'),
    S3_SECRET_ACCESS_KEY: z.string().min(1).default('dev'),
    S3_FORCE_PATH_STYLE: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),

    /** SFU LiveKit (DL-019). URL WebSocket trình duyệt kết nối tới. */
    LIVEKIT_URL: z.url({ protocol: /^wss?$/ }).default('ws://localhost:7880'),
    /** URL API của LiveKit cho server (đổi quyền, ngắt kết nối); bỏ trống = suy từ LIVEKIT_URL. */
    LIVEKIT_API_URL: z.url({ protocol: /^https?$/ }).optional(),
    /** Khóa API LiveKit; chế độ `--dev` dùng `devkey` / `secret`. */
    LIVEKIT_API_KEY: z.string().min(1).default('devkey'),
    LIVEKIT_API_SECRET: z.string().min(1).default('secret'),
  })
  .refine((env) => env.NODE_ENV !== 'production' || !env.JWT_SECRET.startsWith('dev-only'), {
    path: ['JWT_SECRET'],
    message: 'Không dùng JWT_SECRET mẫu ở production.',
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.S3_SECRET_ACCESS_KEY !== 'dev', {
    path: ['S3_SECRET_ACCESS_KEY'],
    message: 'Cần khóa object storage thật ở production.',
  })
  .refine((env) => env.NODE_ENV !== 'production' || env.LIVEKIT_API_SECRET.length >= 32, {
    path: ['LIVEKIT_API_SECRET'],
    message: 'Cần khóa LiveKit thật (tối thiểu 32 ký tự) ở production.',
  })
  .refine(
    (env) =>
      env.NODE_ENV !== 'production' ||
      (env.APP_URL.startsWith('https://') &&
        env.CORS_ORIGINS.every((origin) => origin.startsWith('https://'))),
    {
      path: ['CORS_ORIGINS'],
      message: 'Production cần APP_URL và CORS_ORIGINS dùng https://.',
    },
  )
  .refine((env) => env.NODE_ENV !== 'production' || env.LIVEKIT_URL.startsWith('wss://'), {
    path: ['LIVEKIT_URL'],
    message: 'Production cần LIVEKIT_URL dạng wss:// (trình duyệt chặn ws:// trên trang https).',
  })
  .transform((env) => ({
    ...env,
    COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
    LIVEKIT_API_URL: env.LIVEKIT_API_URL ?? env.LIVEKIT_URL.replace(/^ws/, 'http'),
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
