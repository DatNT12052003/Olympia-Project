import { updateAvPolicyRequestSchema } from '@olympia/shared';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuthenticated, requestPrincipal } from '../../shared/auth/http-auth';
import type { AvService } from './av.service';

const roomParams = z.object({ roomId: z.uuid() });

/**
 * `/api/rooms/:roomId/av`: token LiveKit cho người trong phòng (người dùng hoặc khách) và chính
 * sách âm thanh/hình ảnh của Host (11.2). Quyền kiểm tra theo vai trò trong phòng ở service.
 */
export function createAvRouter(avService: AvService): Router {
  const router = Router({ mergeParams: true });

  router.post('/token', requireAuthenticated, async (req, res) => {
    const { roomId } = roomParams.parse(req.params);
    res.json(await avService.token(roomId, requestPrincipal(req)));
  });

  router.get('/policy', requireAuthenticated, async (req, res) => {
    const { roomId } = roomParams.parse(req.params);
    res.json({ policy: await avService.getPolicy(roomId, requestPrincipal(req)) });
  });

  router.patch('/policy', requireAuthenticated, async (req, res) => {
    const { roomId } = roomParams.parse(req.params);
    const request = updateAvPolicyRequestSchema.parse(req.body);
    res.json({ policy: await avService.updatePolicy(roomId, requestPrincipal(req), request) });
  });

  return router;
}
