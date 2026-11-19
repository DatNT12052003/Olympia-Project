import {
  createReportRequestSchema,
  reportListQuerySchema,
  resolveReportRequestSchema,
  SystemPermission,
} from '@olympia/shared';
import { Router } from 'express';
import { z } from 'zod';
import { requirePermission, requireUser, userPrincipal } from '../../shared/auth/http-auth';
import type { ReportsService } from './reports.service';

const reportParams = z.object({ reportId: z.uuid() });

/** `/api/reports`: người dùng gửi báo cáo vi phạm (khách không được, BR-AUTH-06). */
export function createReportsRouter(reports: ReportsService): Router {
  const router = Router();
  router.post(
    '/',
    requireUser,
    requirePermission(SystemPermission.SubmitReports),
    async (req, res) => {
      const input = createReportRequestSchema.parse(req.body);
      res.status(201).json(await reports.create(userPrincipal(req), input));
    },
  );
  return router;
}

/** `/api/moderation/reports`: Manager/Super Admin xử lý báo cáo (15.3). */
export function createReportModerationRouter(reports: ReportsService): Router {
  const router = Router();
  router.use(requirePermission(SystemPermission.EnforceModeration));

  router.get('/', async (req, res) => {
    const { status } = reportListQuerySchema.parse(req.query);
    res.json(await reports.list(userPrincipal(req), status));
  });

  router.post('/:reportId/resolve', async (req, res) => {
    const { reportId } = reportParams.parse(req.params);
    const input = resolveReportRequestSchema.parse(req.body);
    res.json({ report: await reports.resolve(userPrincipal(req), reportId, input) });
  });

  return router;
}
