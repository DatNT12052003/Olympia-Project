import { updateProfileRequestSchema } from '@olympia/shared';
import { Router } from 'express';
import { requireUser, userPrincipal } from '../../shared/auth/http-auth';
import type { UsersService } from './users.service';

/** `/api/me`: chỉ thao tác trên tài khoản của chính mình nên không có tham số id (tránh IDOR). */
export function createMeRouter(usersService: UsersService): Router {
  const router = Router();
  router.use(requireUser);

  router.get('/', async (req, res) => {
    res.json({ user: await usersService.getMe(userPrincipal(req).userId) });
  });

  router.patch('/', async (req, res) => {
    const input = updateProfileRequestSchema.parse(req.body);
    res.json({ user: await usersService.updateProfile(userPrincipal(req).userId, input) });
  });

  return router;
}
