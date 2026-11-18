import type { RequestHandler } from 'express';
import type { HealthService } from './health.service';

export function createHealthController(healthService: HealthService) {
  /** Liveness: tiến trình còn chạy, không kiểm tra phụ thuộc. */
  const live: RequestHandler = (_req, res) => {
    res.json({ status: 'ok' });
  };

  /** Readiness: sẵn sàng nhận request khi mọi phụ thuộc (DB, Redis) hoạt động. */
  const ready: RequestHandler = async (_req, res) => {
    const report = await healthService.check();
    res.status(report.status === 'ok' ? 200 : 503).json(report);
  };

  return { live, ready };
}
