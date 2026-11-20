import { SystemPermission, updateSystemSettingsSchema } from '@olympia/shared';
import { Router } from 'express';
import { requirePermission, userPrincipal } from '../../shared/auth/http-auth';
import type { SettingsService } from './settings.service';

/** `/api/admin/settings`: Super Admin xem/sửa cấu hình hệ thống (15.1, DL-049). */
export function createAdminSettingsRouter(settings: SettingsService): Router {
  const router = Router();
  router.use(requirePermission(SystemPermission.ConfigureSystem));

  router.get('/', async (req, res) => {
    res.json(await settings.getForAdmin(userPrincipal(req)));
  });

  router.patch('/', async (req, res) => {
    const patch = updateSystemSettingsSchema.parse(req.body);
    res.json(await settings.update(userPrincipal(req), patch));
  });

  return router;
}

/** `/api/settings/public`: cấu hình giao diện cần (reaction, dung lượng media). */
export function createPublicSettingsRouter(settings: SettingsService): Router {
  const router = Router();
  router.get('/public', (_req, res) => {
    res.json(settings.publicSettings());
  });
  return router;
}
