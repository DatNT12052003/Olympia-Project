import { randomBytes } from 'node:crypto';
import { ACCOUNT_DELETION_GRACE_DAYS } from '@olympia/shared';
import type { Logger } from 'pino';
import { type DataSource, type EntityManager, LessThanOrEqual } from 'typeorm';
import { AdminAuditLogEntity } from '../audit/admin-audit-log.entity';
import { AuthSessionEntity } from '../auth/auth-session.entity';
import { UserActionTokenEntity } from '../auth/user-action-token.entity';
import { MatchInterventionEntity } from '../game/match-records.entity';
import { OrganizationManagerEntity } from '../organizations/organization-manager.entity';
import { UserEntity } from './user.entity';

/** Tên hiển thị của tài khoản đã xóa (BR-DATA-03). */
export const DELETED_USER_NAME = 'Người dùng đã xóa';

/** Nhật ký can thiệp và nhật ký quản trị giữ 12 tháng (BR-DATA-05, DL-008). */
export const LOG_RETENTION_MONTHS = 12;

/** Module khác ẩn danh dữ liệu của người dùng trong bảng của mình (trận, phòng, báo cáo). */
export type UserAnonymizer = (manager: EntityManager, userId: string) => Promise<void>;

export interface DataRetentionDeps {
  dataSource: DataSource;
  anonymizers: UserAnonymizer[];
  tryLock(name: string, ttlMs: number): Promise<boolean>;
  logger: Logger;
  now?: () => Date;
  intervalMs?: number;
}

/**
 * Chính sách dữ liệu (mục 14.1, DL-008): tài khoản hết ân hạn chờ xóa thì xóa email, ảnh, hồ sơ và
 * ẩn danh kết quả trận; nhật ký can thiệp/quản trị quá 12 tháng bị xóa. Khóa Redis bảo đảm mỗi
 * lượt chỉ một instance chạy.
 */
export function createDataRetention(deps: DataRetentionDeps) {
  const { dataSource, logger } = deps;
  const now = deps.now ?? (() => new Date());
  const intervalMs = deps.intervalMs ?? 60 * 60 * 1000;
  let timer: NodeJS.Timeout | undefined;
  let running = false;

  async function purgeUser(userId: string): Promise<boolean> {
    return dataSource.transaction(async (manager) => {
      const user = await manager.findOne(UserEntity, {
        where: { id: userId, status: 'pending_deletion' },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) return false;
      await manager.update(
        UserEntity,
        { id: userId },
        {
          email: `deleted-${userId}@deleted.invalid`,
          // Không ai biết mật khẩu này; tài khoản không đăng nhập được nữa.
          passwordHash: randomBytes(32).toString('hex'),
          displayName: DELETED_USER_NAME,
          avatarUrl: null,
          emailVerifiedAt: null,
          canHost: false,
          systemRole: 'member',
          organizationId: null,
          status: 'deleted',
          deletedAt: now(),
          lockedAt: null,
          lockedReason: null,
        },
      );
      await manager.delete(AuthSessionEntity, { userId });
      await manager.delete(UserActionTokenEntity, { userId });
      await manager.delete(OrganizationManagerEntity, { userId });
      for (const anonymize of deps.anonymizers) await anonymize(manager, userId);
      return true;
    });
  }

  async function purgeExpiredAccounts(): Promise<number> {
    const threshold = new Date(now().getTime() - ACCOUNT_DELETION_GRACE_DAYS * 24 * 3600 * 1000);
    const due = await dataSource.getRepository(UserEntity).find({
      where: { status: 'pending_deletion', deletionRequestedAt: LessThanOrEqual(threshold) },
      select: { id: true },
      take: 100,
    });
    let purged = 0;
    for (const { id } of due) {
      if (await purgeUser(id)) purged += 1;
    }
    return purged;
  }

  async function purgeOldLogs(): Promise<number> {
    const threshold = new Date(now());
    threshold.setMonth(threshold.getMonth() - LOG_RETENTION_MONTHS);
    const audit = await dataSource
      .getRepository(AdminAuditLogEntity)
      .delete({ createdAt: LessThanOrEqual(threshold) });
    const interventions = await dataSource
      .getRepository(MatchInterventionEntity)
      .delete({ createdAt: LessThanOrEqual(threshold) });
    return (audit.affected ?? 0) + (interventions.affected ?? 0);
  }

  async function tick(): Promise<{ accounts: number; logs: number }> {
    if (running) return { accounts: 0, logs: 0 };
    running = true;
    try {
      if (!(await deps.tryLock('data-retention', intervalMs - 1000))) {
        return { accounts: 0, logs: 0 };
      }
      const accounts = await purgeExpiredAccounts();
      const logs = await purgeOldLogs();
      if (accounts || logs) logger.info({ accounts, logs }, 'Bảo trì dữ liệu cá nhân');
      return { accounts, logs };
    } catch (error) {
      logger.error({ err: error }, 'Lỗi bảo trì dữ liệu cá nhân');
      return { accounts: 0, logs: 0 };
    } finally {
      running = false;
    }
  }

  return {
    tick,
    purgeUser,
    start() {
      if (timer) return;
      // Chạy một lượt ngay sau khởi động rồi theo chu kỳ.
      setTimeout(() => void tick(), 30_000).unref();
      timer = setInterval(() => void tick(), intervalMs);
      timer.unref();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
    },
  };
}

export type DataRetention = ReturnType<typeof createDataRetention>;
