import { duplicateScriptRequestSchema, scriptInputSchema, SystemPermission } from '@olympia/shared';
import { Router } from 'express';
import { z } from 'zod';
import { requirePermission, userPrincipal } from '../../shared/auth/http-auth';
import type { ScriptsService } from './scripts.service';

const scriptParams = z.object({ scriptId: z.uuid() });

/** `/api/scripts`: kịch bản trận đấu của Host (mục 6). Kịch bản của người khác trả 404. */
export function createScriptsRouter(scripts: ScriptsService): Router {
  const router = Router();
  router.use(requirePermission(SystemPermission.CreateRooms));

  router.get('/', async (req, res) => {
    res.json({ items: await scripts.list(userPrincipal(req)) });
  });

  router.post('/', async (req, res) => {
    const input = scriptInputSchema.parse(req.body);
    res.status(201).json({ script: await scripts.create(userPrincipal(req), input) });
  });

  router.get('/:scriptId', async (req, res) => {
    const { scriptId } = scriptParams.parse(req.params);
    res.json({ script: await scripts.get(userPrincipal(req), scriptId) });
  });

  router.put('/:scriptId', async (req, res) => {
    const { scriptId } = scriptParams.parse(req.params);
    const input = scriptInputSchema.parse(req.body);
    res.json({ script: await scripts.update(userPrincipal(req), scriptId, input) });
  });

  router.post('/:scriptId/duplicate', async (req, res) => {
    const { scriptId } = scriptParams.parse(req.params);
    const { name } = duplicateScriptRequestSchema.parse(req.body ?? {});
    res.status(201).json({ script: await scripts.duplicate(userPrincipal(req), scriptId, name) });
  });

  router.delete('/:scriptId', async (req, res) => {
    const { scriptId } = scriptParams.parse(req.params);
    await scripts.remove(userPrincipal(req), scriptId);
    res.status(204).end();
  });

  return router;
}
