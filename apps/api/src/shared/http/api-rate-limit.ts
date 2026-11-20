import type { RequestHandler } from 'express';
import type { LimiterFactory } from '../../infrastructure/rate-limit/rate-limiter';
import { TooManyRequestsError } from '../errors/app-error';

/**
 * Giới hạn chung số request REST mỗi phút cho một IP (mục 16: rate limit), lớp chặn thô trước các
 * giới hạn riêng (đăng nhập, vào phòng, upload...). `perMinute = 0` tắt giới hạn.
 */
export function createApiRateLimit(limiters: LimiterFactory, perMinute: number): RequestHandler {
  if (perMinute <= 0) return (_req, _res, next) => next();
  const limiter = limiters({ keyPrefix: 'api', points: perMinute, durationSeconds: 60 });
  return (req, _res, next) => {
    limiter
      .consume(req.ip ?? 'unknown')
      .then((blocked) => next(blocked === null ? undefined : new TooManyRequestsError(blocked)))
      .catch(next);
  };
}
