import { organizationRequestSchema, SystemPermission } from '@olympia/shared';
import { Router } from 'express';
import { z } from 'zod';
import { requirePermission, userPrincipal } from '../../shared/auth/http-auth';
import type { OrganizationsService } from './organizations.service';

const organizationParams = z.object({ organizationId: z.uuid() });
const managerParams = organizationParams.extend({ userId: z.uuid() });

/** `/api/admin/organizations`: Manager chỉ xem tổ chức mình; thay đổi chỉ Super Admin. */
export function createOrganizationsRouter(service: OrganizationsService): Router {
  const router = Router();
  router.use(requirePermission(SystemPermission.ManageUsers));
  const superAdminOnly = requirePermission(SystemPermission.ConfigureSystem);

  router.get('/', async (req, res) => {
    res.json({ items: await service.list(userPrincipal(req)) });
  });

  router.post('/', superAdminOnly, async (req, res) => {
    const input = organizationRequestSchema.parse(req.body);
    res.status(201).json({ organization: await service.create(userPrincipal(req), input) });
  });

  router.patch('/:organizationId', superAdminOnly, async (req, res) => {
    const { organizationId } = organizationParams.parse(req.params);
    const input = organizationRequestSchema.parse(req.body);
    res.json({
      organization: await service.rename(userPrincipal(req), organizationId, input),
    });
  });

  router.put('/:organizationId/managers/:userId', superAdminOnly, async (req, res) => {
    const { organizationId, userId } = managerParams.parse(req.params);
    await service.addManager(userPrincipal(req), organizationId, userId);
    res.status(204).end();
  });

  router.delete('/:organizationId/managers/:userId', superAdminOnly, async (req, res) => {
    const { organizationId, userId } = managerParams.parse(req.params);
    await service.removeManager(userPrincipal(req), organizationId, userId);
    res.status(204).end();
  });

  return router;
}
