import { clientErrorReportSchema } from '@olympia/shared';
import { Router } from 'express';
import type { Logger } from 'pino';
import type { Metrics } from '../../infrastructure/metrics/metrics';
import type { LimiterFactory } from '../../infrastructure/rate-limit/rate-limiter';

/**
 * `POST /api/client-errors`: lỗi giao diện trình duyệt (DL-053). Ghi log cảnh báo có cấu trúc
 * (Loki/Grafana gom lại) và đếm metrics. Công khai (lỗi có thể xảy ra trước khi đăng nhập) nên
 * giới hạn theo IP; vượt giới hạn thì lặng lẽ bỏ qua để trình duyệt không thử lại.
 */
export function createClientErrorsRouter(deps: {
  logger: Logger;
  limiters: LimiterFactory;
  metrics?: Metrics;
}): Router {
  const router = Router();
  const limiter = deps.limiters({ keyPrefix: 'client-error', points: 20, durationSeconds: 60 });
  router.post('/', async (req, res) => {
    const blocked = await limiter.consume(req.ip ?? 'unknown');
    const parsed = clientErrorReportSchema.safeParse(req.body);
    if (blocked === null && parsed.success) {
      deps.metrics?.clientErrors.inc({ kind: parsed.data.kind });
      deps.logger.warn(
        {
          clientError: parsed.data,
          userId: req.principal?.kind === 'user' ? req.principal.userId : undefined,
          userAgent: req.get('user-agent')?.slice(0, 200),
        },
        'Lỗi giao diện trình duyệt',
      );
    }
    res.status(204).end();
  });
  return router;
}
