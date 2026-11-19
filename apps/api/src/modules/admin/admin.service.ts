import type { AdminRoom, AuditLogList, auditLogQuerySchema } from '@olympia/shared';
import type { Logger } from 'pino';
import type { DataSource } from 'typeorm';
import type { z } from 'zod';
import type { UserPrincipal } from '../../shared/auth/principal';
import { ForbiddenError, NotFoundError } from '../../shared/errors/app-error';
import { writeAuditLog } from '../audit/audit-log';

export interface AdminServiceDeps {
  dataSource: DataSource;
  logger: Logger;
  /** Kết thúc trận đang diễn ra của phòng (Game Engine). */
  forceEndMatch(roomId: string, actorUserId: string): Promise<boolean>;
  /** Đóng phòng đang mở (Room Management). */
  forceCloseRoom(roomId: string): Promise<boolean>;
}

interface RoomRow {
  id: string;
  name: string;
  code: string | null;
  status: 'open' | 'in_match';
  visibility: 'public' | 'private';
  host_id: string;
  host_name: string;
  organization_name: string | null;
  player_count: number;
  spectator_count: number;
  opened_at: Date | null;
}

/**
 * Giám sát của Super Admin/Manager (mục 15.1, 15.2): phòng đang hoạt động, đóng phòng vi phạm
 * (kể cả đang thi), nhật ký quản trị. Manager chỉ thấy phòng của Host thuộc tổ chức mình.
 */
export function createAdminService(deps: AdminServiceDeps) {
  const { dataSource } = deps;

  async function listRooms(actor: UserPrincipal, roomId?: string): Promise<AdminRoom[]> {
    if (actor.systemRole !== 'super_admin' && actor.systemRole !== 'manager') {
      throw new ForbiddenError();
    }
    const params: unknown[] = [];
    const where = ["r.status IN ('open', 'in_match')"];
    if (actor.systemRole === 'manager') {
      params.push(actor.userId);
      where.push(
        `u.system_role = 'member' AND u.organization_id IN (SELECT organization_id FROM organization_managers WHERE user_id = $${params.length})`,
      );
    }
    if (roomId) {
      params.push(roomId);
      where.push(`r.id = $${params.length}`);
    }
    const rows = await dataSource.query<RoomRow[]>(
      `SELECT r.id, r.name, r.code, r.status, r.visibility, r.opened_at,
              u.id AS host_id, u.display_name AS host_name, o.name AS organization_name,
              count(p.id) FILTER (WHERE p.role = 'player' AND p.status = 'approved')::int AS player_count,
              count(p.id) FILTER (WHERE p.role = 'spectator' AND p.status = 'approved')::int AS spectator_count
         FROM rooms r
         JOIN users u ON u.id = r.host_user_id
         LEFT JOIN organizations o ON o.id = u.organization_id
         LEFT JOIN room_participants p ON p.room_id = r.id
        WHERE ${where.join(' AND ')}
        GROUP BY r.id, u.id, o.name
        ORDER BY r.status DESC, r.opened_at DESC NULLS LAST
        LIMIT 500`,
      params,
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      status: row.status,
      visibility: row.visibility,
      hostId: row.host_id,
      hostName: row.host_name,
      organizationName: row.organization_name,
      playerCount: row.player_count,
      spectatorCount: row.spectator_count,
      openedAt: row.opened_at?.toISOString() ?? null,
    }));
  }

  return {
    listRooms: (actor: UserPrincipal) => listRooms(actor),

    /** Đóng phòng vi phạm: đang thi thì kết thúc trận trước (kết thúc bất thường). */
    async closeRoom(actor: UserPrincipal, roomId: string, reason: string): Promise<void> {
      const [room] = await listRooms(actor, roomId);
      if (!room) throw new NotFoundError('Không tìm thấy phòng đang hoạt động.');
      if (room.status === 'in_match') await deps.forceEndMatch(roomId, actor.userId);
      await deps.forceCloseRoom(roomId);
      await dataSource.transaction((manager) =>
        writeAuditLog(manager, {
          actorUserId: actor.userId,
          action: 'room.close',
          targetType: 'room',
          targetId: roomId,
          details: { reason, name: room.name, hostName: room.hostName },
        }),
      );
      deps.logger.info({ roomId, actorUserId: actor.userId }, 'Quản trị viên đóng phòng');
    },

    /** Nhật ký quản trị (15.1); chỉ Super Admin. */
    async auditLogs(
      actor: UserPrincipal,
      filters: z.output<typeof auditLogQuerySchema>,
    ): Promise<AuditLogList> {
      if (actor.systemRole !== 'super_admin') throw new ForbiddenError();
      const params: unknown[] = [];
      let where = 'TRUE';
      if (filters.category) {
        params.push(`${filters.category}.%`);
        where = `l.action LIKE $${params.length}`;
      }
      const [{ total }] = await dataSource.query<[{ total: number }]>(
        `SELECT count(*)::int AS total FROM admin_audit_logs l WHERE ${where}`,
        params,
      );
      params.push(filters.pageSize, (filters.page - 1) * filters.pageSize);
      const rows = await dataSource.query<
        {
          id: string;
          action: string;
          target_type: string;
          target_id: string | null;
          details: Record<string, unknown>;
          created_at: Date;
          actor_name: string | null;
        }[]
      >(
        `SELECT l.id::text AS id, l.action, l.target_type, l.target_id, l.details, l.created_at,
                u.display_name AS actor_name
           FROM admin_audit_logs l
           LEFT JOIN users u ON u.id = l.actor_user_id
          WHERE ${where}
          ORDER BY l.created_at DESC, l.id DESC
          LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      return {
        items: rows.map((row) => ({
          id: row.id,
          action: row.action,
          actorName: row.actor_name,
          targetType: row.target_type,
          targetId: row.target_id,
          details: row.details,
          createdAt: row.created_at.toISOString(),
        })),
        page: filters.page,
        pageSize: filters.pageSize,
        total,
      };
    },
  };
}

export type AdminService = ReturnType<typeof createAdminService>;
