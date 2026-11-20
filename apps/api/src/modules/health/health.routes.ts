import { Router } from 'express';
import { createHealthController } from './health.controller';
import type { HealthService } from './health.service';

export function createHealthRouter(healthService: HealthService): Router {
  const controller = createHealthController(healthService);
  const router = Router();
  router.get('/live', controller.live);
  router.get('/ready', controller.ready);
  return router;
}
