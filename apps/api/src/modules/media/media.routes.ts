import { createUploadRequestSchema, SystemPermission } from '@olympia/shared';
import { Router } from 'express';
import { z } from 'zod';
import { requirePermission, userPrincipal } from '../../shared/auth/http-auth';
import type { MediaService } from './media.service';

const mediaParams = z.object({ mediaId: z.uuid() });

/** `/api/media`: upload media cho câu hỏi qua presigned URL (BR-QB-02). */
export function createMediaRouter(mediaService: MediaService): Router {
  const router = Router();
  router.use(requirePermission(SystemPermission.ManageOwnQuestions));

  router.post('/uploads', async (req, res) => {
    const input = createUploadRequestSchema.parse(req.body);
    res.status(201).json(await mediaService.createUpload(userPrincipal(req), input));
  });

  router.post('/:mediaId/complete', async (req, res) => {
    const { mediaId } = mediaParams.parse(req.params);
    res.json({ media: await mediaService.complete(userPrincipal(req), mediaId) });
  });

  return router;
}
