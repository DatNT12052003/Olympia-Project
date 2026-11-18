import type { Redis } from 'ioredis';
import {
  type RateLimiterAbstract,
  RateLimiterMemory,
  RateLimiterRedis,
  RateLimiterRes,
} from 'rate-limiter-flexible';

export interface LimiterOptions {
  /** Tiền tố khóa, phân biệt các loại giới hạn. */
  keyPrefix: string;
  /** Số lần tối đa trong cửa sổ. */
  points: number;
  durationSeconds: number;
}

/**
 * Bộ đếm theo cửa sổ thời gian.
 * - `consume`: tính một lần; trả về số giây phải chờ nếu đã vượt giới hạn, ngược lại `null`.
 * - `blockedFor`: chỉ kiểm tra, không tính lần nào (dùng cho "đăng nhập sai liên tiếp").
 */
export interface Limiter {
  consume(key: string): Promise<number | null>;
  blockedFor(key: string): Promise<number | null>;
  reset(key: string): Promise<void>;
}

export type LimiterFactory = (options: LimiterOptions) => Limiter;

function toSeconds(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1000));
}

function wrap(limiter: RateLimiterAbstract, points: number): Limiter {
  return {
    async consume(key) {
      try {
        await limiter.consume(key);
        return null;
      } catch (error) {
        if (error instanceof RateLimiterRes) return toSeconds(error.msBeforeNext);
        throw error;
      }
    },
    async blockedFor(key) {
      const res = await limiter.get(key);
      return res && res.consumedPoints >= points ? toSeconds(res.msBeforeNext) : null;
    },
    async reset(key) {
      await limiter.delete(key);
    },
  };
}

/** Giới hạn dùng chung giữa các instance qua Redis. */
export function createRedisLimiterFactory(redis: Redis): LimiterFactory {
  return ({ keyPrefix, points, durationSeconds }) =>
    wrap(
      new RateLimiterRedis({
        storeClient: redis,
        keyPrefix: `rl:${keyPrefix}`,
        points,
        duration: durationSeconds,
      }),
      points,
    );
}

/** Giới hạn trong bộ nhớ một tiến trình (test). */
export const memoryLimiterFactory: LimiterFactory = ({ keyPrefix, points, durationSeconds }) =>
  wrap(new RateLimiterMemory({ keyPrefix, points, duration: durationSeconds }), points);
