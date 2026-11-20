import { startMatchRequestSchema } from '@olympia/shared';
import { Router } from 'express';
import { z } from 'zod';
import { requireUser, userPrincipal } from '../../shared/auth/http-auth';
import type { MatchService } from './match.service';

const roomParams = z.object({ roomId: z.uuid() });

/**
 * `/api/rooms/:roomId/match`: Host bắt đầu trận. Hành động trong trận đi qua Socket.IO có ack
 * (DL-026). Phòng của người khác trả 404 (Room Management kiểm tra).
 */
export function createMatchRouter(matches: MatchService): Router {
  const router = Router({ mergeParams: true });

  router.post('/', requireUser, async (req, res) => {
    const { roomId } = roomParams.parse(req.params);
    const options = startMatchRequestSchema.parse(req.body ?? {});
    res.status(201).json(await matches.start(userPrincipal(req), roomId, options));
  });

  return router;
}
