import {
  listUsersQuerySchema,
  lockUserRequestSchema,
  SystemPermission,
  updateUserRequestSchema,
} from '@olympia/shared';
import { Router } from 'express';
import { z } from 'zod';
import { requirePermission, userPrincipal } from '../../shared/auth/http-auth';
import type { AdminUsersService } from './admin-users.service';

const userIdParams = z.object({ userId: z.uuid() });

/** `/api/admin/users`: Super Admin toàn hệ thống, Manager trong phạm vi tổ chức. */
export function createAdminUsersRouter(service: AdminUsersService): Router {
  const router = Router();
  router.use(requirePermission(SystemPermission.ManageUsers));

  router.get('/', async (req, res) => {
    const filters = listUsersQuerySchema.parse(req.query);
    res.json(await service.list(userPrincipal(req), filters));
  });

  router.get('/:userId', async (req, res) => {
    const { userId } = userIdParams.parse(req.params);
    res.json({ user: await service.get(userPrincipal(req), userId) });
  });

  router.patch(
    '/:userId',
    requirePermission(SystemPermission.ConfigureSystem),
    async (req, res) => {
      const { userId } = userIdParams.parse(req.params);
      const input = updateUserRequestSchema.parse(req.body);
      res.json({ user: await service.update(userPrincipal(req), userId, input) });
    },
  );

  router.post('/:userId/lock', async (req, res) => {
    const { userId } = userIdParams.parse(req.params);
    const input = lockUserRequestSchema.parse(req.body);
    res.json({ user: await service.lock(userPrincipal(req), userId, input) });
  });

  router.post('/:userId/unlock', async (req, res) => {
    const { userId } = userIdParams.parse(req.params);
    res.json({ user: await service.unlock(userPrincipal(req), userId) });
  });

  router.post('/:userId/verification-email', async (req, res) => {
    const { userId } = userIdParams.parse(req.params);
    await service.resendVerificationEmail(userPrincipal(req), userId);
    res.status(202).end();
  });

  router.post('/:userId/password-reset', async (req, res) => {
    const { userId } = userIdParams.parse(req.params);
    await service.requestPasswordReset(userPrincipal(req), userId);
    res.status(202).end();
  });

  return router;
}
