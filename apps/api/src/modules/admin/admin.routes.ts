import { auditLogQuerySchema, closeRoomRequestSchema, SystemPermission } from '@olympia/shared';
import { Router } from 'express';
import { z } from 'zod';
import { requirePermission, userPrincipal } from '../../shared/auth/http-auth';
import type { AdminService } from './admin.service';

const roomParams = z.object({ roomId: z.uuid() });

/** `/api/admin/rooms`: giám sát phòng đang hoạt động, đóng phòng vi phạm (15.1, 15.2). */
export function createAdminRoomsRouter(admin: AdminService): Router {
  const router = Router();
  router.use(requirePermission(SystemPermission.MonitorRooms));

  router.get('/', async (req, res) => {
    res.json({ items: await admin.listRooms(userPrincipal(req)) });
  });

  router.post(
    '/:roomId/close',
    requirePermission(SystemPermission.EnforceModeration),
    async (req, res) => {
      const { roomId } = roomParams.parse(req.params);
      const { reason } = closeRoomRequestSchema.parse(req.body);
      await admin.closeRoom(userPrincipal(req), roomId, reason);
      res.status(204).end();
    },
  );

  return router;
}

/** `/api/admin/audit-logs`: nhật ký hoạt động quản trị (15.1). */
export function createAuditLogsRouter(admin: AdminService): Router {
  const router = Router();
  router.use(requirePermission(SystemPermission.ConfigureSystem));
  router.get('/', async (req, res) => {
    const filters = auditLogQuerySchema.parse(req.query);
    res.json(await admin.auditLogs(userPrincipal(req), filters));
  });
  return router;
}
