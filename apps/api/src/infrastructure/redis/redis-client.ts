import { Redis } from 'ioredis';

/** Tạo kết nối Redis; gọi `connect()` khi khởi động để phát hiện lỗi cấu hình sớm. */
export function createRedisClient(redisUrl: string): Redis {
  return new Redis(redisUrl, { lazyConnect: true });
}
