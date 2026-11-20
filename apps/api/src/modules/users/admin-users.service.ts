import {
  AdminErrorCode,
  type AdminUser,
  type AdminUserList,
  type listUsersQuerySchema,
  type lockUserRequestSchema,
  type updateUserRequestSchema,
} from '@olympia/shared';
import type { DataSource, SelectQueryBuilder } from 'typeorm';
import type { z } from 'zod';
import type { UserPrincipal } from '../../shared/auth/principal';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../shared/errors/app-error';
import { writeAuditLog } from '../audit/audit-log';
import { AuthSessionEntity } from '../auth/auth-session.entity';
import type { AuthService } from '../auth/auth.service';
import { OrganizationManagerEntity } from '../organizations/organization-manager.entity';
import type { OrganizationsService } from '../organizations/organizations.service';
import { UserEntity } from './user.entity';
import { toAdminUser } from './user.mapper';

export interface AdminUsersServiceDeps {
  dataSource: DataSource;
  authService: Pick<
    AuthService,
    'revokeAllSessions' | 'notifySessionsRevoked' | 'sendPasswordReset' | 'sendVerificationEmailTo'
  >;
  organizationsService: Pick<OrganizationsService, 'managedOrganizationIds' | 'exists'>;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Quản trị tài khoản (mục 15.1, 15.2).
 *
 * Phạm vi: Super Admin quản lý mọi tài khoản; Manager chỉ quản lý tài khoản `member` thuộc tổ
 * chức mình được gán (DL-005). Tài khoản ngoài phạm vi trả 404 để không lộ sự tồn tại.
 */
export function createAdminUsersService({
  dataSource,
  authService,
  organizationsService,
}: AdminUsersServiceDeps) {
  const users = dataSource.getRepository(UserEntity);

  /** Áp phạm vi của người thao tác vào truy vấn người dùng (alias `u`). */
  function applyScope(query: SelectQueryBuilder<UserEntity>, actor: UserPrincipal): void {
    if (actor.systemRole === 'super_admin') return;
    query
      .andWhere("u.systemRole = 'member'")
      .andWhere(
        `u.organizationId IN (${query
          .subQuery()
          .select('m.organization_id')
          .from(OrganizationManagerEntity, 'm')
          .where('m.user_id = :actorId')
          .getQuery()})`,
      )
      .setParameter('actorId', actor.userId);
  }

  async function loadInScope(actor: UserPrincipal, userId: string): Promise<UserEntity> {
    const query = users.createQueryBuilder('u').where('u.id = :userId', { userId });
    applyScope(query, actor);
    const user = await query.getOne();
    if (!user) throw new NotFoundError('Không tìm thấy tài khoản.');
    return user;
  }

  /** Kèm thời điểm hoạt động gần nhất (phiên được dùng gần nhất) cho danh sách quản trị. */
  async function presentMany(list: UserEntity[]): Promise<AdminUser[]> {
    if (list.length === 0) return [];
    const rows = await dataSource
      .getRepository(AuthSessionEntity)
      .createQueryBuilder('s')
      .select('s.userId', 'userId')
      .addSelect('MAX(s.lastUsedAt)', 'lastActiveAt')
      .where('s.userId IN (:...ids)', { ids: list.map((u) => u.id) })
      .groupBy('s.userId')
      .getRawMany<{ userId: string; lastActiveAt: Date | string }>();
    const activity = new Map(rows.map((row) => [row.userId, new Date(row.lastActiveAt)]));
    return list.map((user) => toAdminUser(user, activity.get(user.id) ?? null));
  }

  async function present(user: UserEntity): Promise<AdminUser> {
    return (await presentMany([user]))[0]!;
  }

  function assertNotSelf(actor: UserPrincipal, user: UserEntity): void {
    if (actor.userId === user.id) {
      throw new ForbiddenError(
        'Không thể thực hiện thao tác này trên chính tài khoản của bạn.',
        AdminErrorCode.SelfModification,
      );
    }
  }

  /** Tài khoản chờ xóa/đã xóa không khóa, mở khóa hay gửi email được nữa (DL-008). */
  function assertNotDeleted(user: UserEntity): void {
    if (user.status === 'pending_deletion' || user.status === 'deleted') {
      throw new ConflictError(
        user.status === 'deleted' ? 'Tài khoản đã bị xóa.' : 'Tài khoản đang chờ xóa.',
      );
    }
  }

  return {
    assertNotDeleted,

    async list(
      actor: UserPrincipal,
      filters: z.output<typeof listUsersQuerySchema>,
    ): Promise<AdminUserList> {
      const query = users.createQueryBuilder('u');
      applyScope(query, actor);
      if (filters.search) {
        query.andWhere(
          "(u.email ILIKE :search ESCAPE '\\' OR u.displayName ILIKE :search ESCAPE '\\')",
          {
            search: `%${escapeLike(filters.search)}%`,
          },
        );
      }
      if (filters.organizationId) {
        query.andWhere('u.organizationId = :organizationId', {
          organizationId: filters.organizationId,
        });
      }
      if (filters.status) query.andWhere('u.status = :status', { status: filters.status });
      if (filters.systemRole) {
        query.andWhere('u.systemRole = :systemRole', { systemRole: filters.systemRole });
      }
      const [items, total] = await query
        .orderBy('u.createdAt', 'DESC')
        .addOrderBy('u.id', 'ASC')
        .skip((filters.page - 1) * filters.pageSize)
        .take(filters.pageSize)
        .getManyAndCount();
      return {
        items: await presentMany(items),
        page: filters.page,
        pageSize: filters.pageSize,
        total,
      };
    },

    async get(actor: UserPrincipal, userId: string): Promise<AdminUser> {
      return present(await loadInScope(actor, userId));
    },

    /** Khóa tài khoản: thu hồi mọi phiên và ngắt kết nối realtime (BR-AUTH-02). */
    async lock(
      actor: UserPrincipal,
      userId: string,
      input: z.output<typeof lockUserRequestSchema>,
    ): Promise<AdminUser> {
      const user = await loadInScope(actor, userId);
      assertNotSelf(actor, user);
      if (user.status === 'locked') return present(user);
      assertNotDeleted(user);

      const event = await dataSource.transaction(async (manager) => {
        user.status = 'locked';
        user.lockedAt = new Date();
        user.lockedReason = input.reason;
        await manager.save(user);
        await writeAuditLog(manager, {
          actorUserId: actor.userId,
          action: 'user.lock',
          targetType: 'user',
          targetId: user.id,
          details: { reason: input.reason },
        });
        return authService.revokeAllSessions(manager, user.id, 'account_locked');
      });
      authService.notifySessionsRevoked(event);
      return present(user);
    },

    async unlock(actor: UserPrincipal, userId: string): Promise<AdminUser> {
      const user = await loadInScope(actor, userId);
      if (user.status === 'active') return present(user);
      assertNotDeleted(user);
      await dataSource.transaction(async (manager) => {
        user.status = 'active';
        user.lockedAt = null;
        user.lockedReason = null;
        await manager.save(user);
        await writeAuditLog(manager, {
          actorUserId: actor.userId,
          action: 'user.unlock',
          targetType: 'user',
          targetId: user.id,
        });
      });
      return present(user);
    },

    /** Gửi email đặt lại mật khẩu cho người dùng (không để quản trị viên biết mật khẩu). */
    async requestPasswordReset(actor: UserPrincipal, userId: string): Promise<void> {
      const user = await loadInScope(actor, userId);
      assertNotDeleted(user);
      await authService.sendPasswordReset(user);
      await dataSource.transaction((manager) =>
        writeAuditLog(manager, {
          actorUserId: actor.userId,
          action: 'user.password_reset_requested',
          targetType: 'user',
          targetId: user.id,
        }),
      );
    },

    /** Gửi lại email xác minh cho tài khoản chưa xác minh. */
    async resendVerificationEmail(actor: UserPrincipal, userId: string): Promise<void> {
      const user = await loadInScope(actor, userId);
      assertNotDeleted(user);
      await authService.sendVerificationEmailTo(user);
      await dataSource.transaction((manager) =>
        writeAuditLog(manager, {
          actorUserId: actor.userId,
          action: 'user.verification_email_sent',
          targetType: 'user',
          targetId: user.id,
        }),
      );
    },

    /** Chỉ Super Admin (route kiểm tra): cấp vai trò, thu hồi quyền Host, gán tổ chức. */
    async update(
      actor: UserPrincipal,
      userId: string,
      input: z.output<typeof updateUserRequestSchema>,
    ): Promise<AdminUser> {
      if (actor.systemRole !== 'super_admin') throw new ForbiddenError();
      const user = await loadInScope(actor, userId);
      if (input.systemRole !== undefined && input.systemRole !== user.systemRole) {
        assertNotSelf(actor, user);
      }
      if (input.organizationId && !(await organizationsService.exists(input.organizationId))) {
        throw new BadRequestError('Tổ chức không tồn tại.');
      }

      const changes: Record<string, { from: unknown; to: unknown }> = {};
      if (input.systemRole !== undefined && input.systemRole !== user.systemRole) {
        changes.systemRole = { from: user.systemRole, to: input.systemRole };
        user.systemRole = input.systemRole;
      }
      if (input.canHost !== undefined && input.canHost !== user.canHost) {
        changes.canHost = { from: user.canHost, to: input.canHost };
        user.canHost = input.canHost;
      }
      if (input.organizationId !== undefined && input.organizationId !== user.organizationId) {
        changes.organizationId = { from: user.organizationId, to: input.organizationId };
        user.organizationId = input.organizationId;
      }
      if (Object.keys(changes).length === 0) return present(user);

      await dataSource.transaction(async (manager) => {
        await manager.save(user);
        // Không còn là Manager => bỏ mọi phân công quản lý tổ chức.
        if (changes.systemRole && user.systemRole !== 'manager') {
          await manager.delete(OrganizationManagerEntity, { userId: user.id });
        }
        await writeAuditLog(manager, {
          actorUserId: actor.userId,
          action: 'user.update',
          targetType: 'user',
          targetId: user.id,
          details: changes,
        });
      });
      return present(user);
    },
  };
}

export type AdminUsersService = ReturnType<typeof createAdminUsersService>;
