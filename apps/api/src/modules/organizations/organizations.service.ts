import { AdminErrorCode, type Organization, type organizationRequestSchema } from '@olympia/shared';
import { type DataSource, QueryFailedError } from 'typeorm';
import type { z } from 'zod';
import type { UserPrincipal } from '../../shared/auth/principal';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors/app-error';
import { writeAuditLog } from '../audit/audit-log';
import { UserEntity } from '../users/user.entity';
import { OrganizationManagerEntity } from './organization-manager.entity';
import { OrganizationEntity } from './organization.entity';

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string } | undefined)?.code === '23505'
  );
}

/**
 * Tổ chức và phân công Manager (DL-005, mục 15.2). Tạo/sửa/phân công chỉ Super Admin
 * (route kiểm tra); Manager chỉ xem tổ chức mình quản lý.
 */
export function createOrganizationsService(dataSource: DataSource) {
  async function toDto(organizations: OrganizationEntity[]): Promise<Organization[]> {
    if (organizations.length === 0) return [];
    const ids = organizations.map((o) => o.id);
    const managers = await dataSource
      .getRepository(OrganizationManagerEntity)
      .createQueryBuilder('m')
      .where('m.organizationId IN (:...ids)', { ids })
      .orderBy('m.createdAt', 'ASC')
      .getMany();
    const counts = await dataSource
      .getRepository(UserEntity)
      .createQueryBuilder('u')
      .select('u.organizationId', 'organizationId')
      .addSelect('COUNT(*)::int', 'count')
      .where('u.organizationId IN (:...ids)', { ids })
      .groupBy('u.organizationId')
      .getRawMany<{ organizationId: string; count: number }>();
    return organizations.map((org) => ({
      id: org.id,
      name: org.name,
      managerIds: managers.filter((m) => m.organizationId === org.id).map((m) => m.userId),
      memberCount: counts.find((c) => c.organizationId === org.id)?.count ?? 0,
      createdAt: org.createdAt.toISOString(),
    }));
  }

  async function loadOrganization(id: string): Promise<OrganizationEntity> {
    const org = await dataSource.getRepository(OrganizationEntity).findOneBy({ id });
    if (!org) throw new NotFoundError('Không tìm thấy tổ chức.');
    return org;
  }

  return {
    /** Tổ chức mà Manager được gán; dùng xác định phạm vi quản lý. */
    async managedOrganizationIds(userId: string): Promise<string[]> {
      const rows = await dataSource.getRepository(OrganizationManagerEntity).findBy({ userId });
      return rows.map((row) => row.organizationId);
    },

    async list(actor: UserPrincipal): Promise<Organization[]> {
      const query = dataSource
        .getRepository(OrganizationEntity)
        .createQueryBuilder('o')
        .orderBy('o.name', 'ASC');
      if (actor.systemRole !== 'super_admin') {
        query.innerJoin(
          OrganizationManagerEntity,
          'm',
          'm.organizationId = o.id AND m.userId = :userId',
          { userId: actor.userId },
        );
      }
      return toDto(await query.getMany());
    },

    async create(
      actor: UserPrincipal,
      input: z.output<typeof organizationRequestSchema>,
    ): Promise<Organization> {
      try {
        const org = await dataSource.transaction(async (manager) => {
          const created = await manager.save(
            manager.create(OrganizationEntity, { name: input.name }),
          );
          await writeAuditLog(manager, {
            actorUserId: actor.userId,
            action: 'organization.create',
            targetType: 'organization',
            targetId: created.id,
            details: { name: created.name },
          });
          return created;
        });
        const [dto] = await toDto([org]);
        return dto!;
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictError('Tên tổ chức đã tồn tại.', AdminErrorCode.OrganizationNameTaken);
        }
        throw error;
      }
    },

    async rename(
      actor: UserPrincipal,
      id: string,
      input: z.output<typeof organizationRequestSchema>,
    ): Promise<Organization> {
      const org = await loadOrganization(id);
      const previousName = org.name;
      org.name = input.name;
      try {
        await dataSource.transaction(async (manager) => {
          await manager.save(org);
          await writeAuditLog(manager, {
            actorUserId: actor.userId,
            action: 'organization.rename',
            targetType: 'organization',
            targetId: id,
            details: { from: previousName, to: input.name },
          });
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictError('Tên tổ chức đã tồn tại.', AdminErrorCode.OrganizationNameTaken);
        }
        throw error;
      }
      const [dto] = await toDto([org]);
      return dto!;
    },

    async addManager(actor: UserPrincipal, organizationId: string, userId: string): Promise<void> {
      await loadOrganization(organizationId);
      const user = await dataSource.getRepository(UserEntity).findOneBy({ id: userId });
      if (!user) throw new NotFoundError('Không tìm thấy tài khoản.');
      if (user.systemRole !== 'manager') {
        throw new BadRequestError(
          'Tài khoản cần có vai trò Manager trước khi được gán quản lý tổ chức.',
          AdminErrorCode.NotAManager,
        );
      }
      await dataSource.transaction(async (manager) => {
        const result = await manager
          .createQueryBuilder()
          .insert()
          .into(OrganizationManagerEntity)
          .values({ organizationId, userId })
          .orIgnore()
          .returning('user_id')
          .execute();
        // ON CONFLICT DO NOTHING không trả dòng nào khi đã được gán từ trước: không ghi log lặp.
        if ((result.raw as unknown[]).length > 0) {
          await writeAuditLog(manager, {
            actorUserId: actor.userId,
            action: 'organization.manager_add',
            targetType: 'organization',
            targetId: organizationId,
            details: { userId },
          });
        }
      });
    },

    async removeManager(
      actor: UserPrincipal,
      organizationId: string,
      userId: string,
    ): Promise<void> {
      await dataSource.transaction(async (manager) => {
        const result = await manager.delete(OrganizationManagerEntity, { organizationId, userId });
        if (!result.affected) throw new NotFoundError('Tài khoản không quản lý tổ chức này.');
        await writeAuditLog(manager, {
          actorUserId: actor.userId,
          action: 'organization.manager_remove',
          targetType: 'organization',
          targetId: organizationId,
          details: { userId },
        });
      });
    },

    async exists(id: string): Promise<boolean> {
      return dataSource.getRepository(OrganizationEntity).existsBy({ id });
    },

    /**
     * Phạm vi quản trị (DL-005): Super Admin quản lý mọi người dùng; Manager quản lý người dùng
     * `member` thuộc tổ chức mình được gán.
     */
    async inStaffScope(actor: UserPrincipal, userId: string): Promise<boolean> {
      if (actor.systemRole === 'super_admin') return true;
      if (actor.systemRole !== 'manager') return false;
      return dataSource
        .getRepository(UserEntity)
        .createQueryBuilder('u')
        .innerJoin(OrganizationManagerEntity, 'm', 'm.organization_id = u.organization_id')
        .where('u.id = :userId AND m.user_id = :actorId', { userId, actorId: actor.userId })
        .andWhere("u.system_role = 'member'")
        .getExists();
    },

    /** Tổ chức của người dùng (gắn báo cáo vi phạm cho Manager tương ứng). */
    async organizationOf(userId: string): Promise<string | null> {
      const user = await dataSource
        .getRepository(UserEntity)
        .findOne({ where: { id: userId }, select: { id: true, organizationId: true } });
      return user?.organizationId ?? null;
    },
  };
}

export type OrganizationsService = ReturnType<typeof createOrganizationsService>;
