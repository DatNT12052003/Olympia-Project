import type { EntityManager } from 'typeorm';
import { AdminAuditLogEntity } from './admin-audit-log.entity';

export interface AuditEntry {
  actorUserId: string;
  action: string;
  targetType:
    | 'user'
    | 'organization'
    | 'question_set_version'
    | 'match'
    | 'room'
    | 'report'
    | 'system_settings';
  targetId: string | null;
  details?: Record<string, unknown>;
}

/** Ghi nhật ký quản trị trong cùng transaction với thay đổi được ghi lại. */
export async function writeAuditLog(manager: EntityManager, entry: AuditEntry): Promise<void> {
  await manager.insert(AdminAuditLogEntity, {
    actorUserId: entry.actorUserId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    details: entry.details ?? {},
  });
}
