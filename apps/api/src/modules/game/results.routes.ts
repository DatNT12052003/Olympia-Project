import {
  answersVisibilityRequestSchema,
  historyQuerySchema,
  voidMatchRequestSchema,
} from '@olympia/shared';
import { Router } from 'express';
import { z } from 'zod';
import {
  requestPrincipal,
  requireAuthenticated,
  requireUser,
  userPrincipal,
} from '../../shared/auth/http-auth';
import type { ResultsService } from './results.service';

const matchParams = z.object({ matchId: z.uuid() });

/**
 * `/api/matches`: lịch sử trận, thống kê và tổng kết trận (mục 9.4, 14). Khách xem được trận của
 * phiên khách (BR-AUTH-06); trận người xem không liên quan trả 404.
 */
export function createResultsRouter(results: ResultsService): Router {
  const router = Router();

  router.get('/', requireAuthenticated, async (req, res) => {
    const filters = historyQuerySchema.parse(req.query);
    res.json(await results.history(requestPrincipal(req), filters));
  });

  router.get('/stats', requireAuthenticated, async (req, res) => {
    res.json(await results.stats(requestPrincipal(req)));
  });

  router.get('/:matchId', requireAuthenticated, async (req, res) => {
    const { matchId } = matchParams.parse(req.params);
    res.json(await results.result(requestPrincipal(req), matchId));
  });

  router.put('/:matchId/answers-visibility', requireUser, async (req, res) => {
    const { matchId } = matchParams.parse(req.params);
    const { answersPublic } = answersVisibilityRequestSchema.parse(req.body);
    await results.setAnswersPublic(userPrincipal(req), matchId, answersPublic);
    res.status(204).end();
  });

  router.post('/:matchId/void', requireUser, async (req, res) => {
    const { matchId } = matchParams.parse(req.params);
    const { reason } = voidMatchRequestSchema.parse(req.body);
    await results.voidResult(userPrincipal(req), matchId, reason);
    res.status(204).end();
  });

  return router;
}
