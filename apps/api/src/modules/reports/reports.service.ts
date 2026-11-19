import {
  type createReportRequestSchema,
  REPORT_CATEGORY_LABELS,
  ReportErrorCode,
  type ReportList,
  type ReportResolution,
  type ReportView,
  type resolveReportRequestSchema,
  type ReportStatus,
} from '@olympia/shared';
import type { Logger } from 'pino';
import { type DataSource, type EntityManager, In } from 'typeorm';
import type { z } from 'zod';
import type { LimiterFactory } from '../../infrastructure/rate-limit/rate-limiter';
import type { UserPrincipal } from '../../shared/auth/principal';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
} from '../../shared/errors/app-error';
import type { Mailer } from '../../shared/mail/mailer';
import { writeAuditLog } from '../audit/audit-log';
import { UserEntity } from '../users/user.entity';
import { warningEmail } from './report.mails';
import { ReportEntity } from './report.entity';

export interface ReportsServiceDeps {
  dataSource: DataSource;
  limiters: LimiterFactory;
  mailer: Mailer;
  logger: Logger;
  publicSets: {
    reportTarget(versionId: string): Promise<{ label: string; ownerUserId: string } | null>;
    takedown(
      manager: EntityManager,
      actor: UserPrincipal,
      versionId: string,
      reason: string,
    ): Promise<void>;
  };
  rooms: {
    reportTarget(
      roomId: string,
      participantId: string | null,
      reporter: UserPrincipal,
    ): Promise<{
      label: string;
      hostUserId: string;
      subject: { userId: string | null; guestId: string | null; name: string };
    }>;
    staffBanGuest(
      roomId: string,
      guestId: string,
      displayName: string,
      actorUserId: string,
    ): Promise<void>;
  };
  /** Đóng phòng vi phạm (kể cả đang thi). */
  closeRoom(actor: UserPrincipal, roomId: string, reason: string): Promise<void>;
  lockUser(actor: UserPrincipal, userId: string, reason: string): Promise<void>;
  organizations: {
    organizationOf(userId: string): Promise<string | null>;
    managedOrganizationIds(userId: string): Promise<string[]>;
    inStaffScope(actor: UserPrincipal, userId: string): Promise<boolean>;
  };
}

/** Cách xử lý áp dụng được cho một báo cáo (15.3, DL-050). */
function actionsFor(report: ReportEntity, subject: UserEntity | null): ReportResolution[] {
  const actions: ReportResolution[] = ['dismiss', 'remove_content'];
  if (report.subjectUserId && subject && subject.status !== 'deleted') {
    actions.push('warn');
    if (subject.status === 'active' && subject.systemRole === 'member') {
      actions.push('lock_account');
    }
  }
  if (report.targetType === 'room' && report.subjectGuestId) actions.push('block_guest');
  return actions;
}

/**
 * Báo cáo vi phạm (mục 15.3): người dùng báo cáo câu hỏi public hoặc hành vi trong phòng; Manager
 * (trong phạm vi tổ chức) và Super Admin xử lý: bỏ qua, gỡ nội dung, cảnh báo, chặn khách, khóa.
 */
export function createReportsService(deps: ReportsServiceDeps) {
  const { dataSource, logger } = deps;
  const reportLimiter = deps.limiters({
    keyPrefix: 'report:user',
    points: 10,
    durationSeconds: 3600,
  });

  /** Manager thấy báo cáo bộ public (kiểm duyệt chung) và báo cáo trong tổ chức mình. */
  async function scopeOf(actor: UserPrincipal): Promise<string[] | 'all'> {
    if (actor.systemRole === 'super_admin') return 'all';
    if (actor.systemRole !== 'manager') throw new ForbiddenError();
    return deps.organizations.managedOrganizationIds(actor.userId);
  }

  function inScope(report: ReportEntity, scope: string[] | 'all'): boolean {
    if (scope === 'all' || report.targetType === 'question_set_version') return true;
    return report.organizationId !== null && scope.includes(report.organizationId);
  }

  async function present(reports: ReportEntity[]): Promise<ReportView[]> {
    const userIds = [
      ...new Set(
        reports.flatMap((r) =>
          [r.reporterUserId, r.subjectUserId, r.resolvedBy].filter((id): id is string => !!id),
        ),
      ),
    ];
    const users =
      userIds.length === 0
        ? []
        : await dataSource.getRepository(UserEntity).findBy({ id: In(userIds) });
    const byId = new Map(users.map((u) => [u.id, u]));

    const subjectKeys = reports.map((r) => r.subjectUserId ?? r.subjectGuestId).filter(Boolean);
    const priorRows =
      subjectKeys.length === 0
        ? []
        : await dataSource.query<{ subject: string; count: number }[]>(
            `SELECT coalesce(subject_user_id, subject_guest_id) AS subject, count(*)::int AS count
               FROM reports
              WHERE coalesce(subject_user_id, subject_guest_id) = ANY($1::uuid[])
              GROUP BY 1`,
            [subjectKeys],
          );
    const prior = new Map(priorRows.map((row) => [row.subject, row.count]));

    return reports.map((r) => {
      const subjectUser = r.subjectUserId ? (byId.get(r.subjectUserId) ?? null) : null;
      const subjectKey = r.subjectUserId ?? r.subjectGuestId;
      return {
        id: r.id,
        targetType: r.targetType,
        targetId: r.targetId,
        targetLabel: r.targetLabel,
        subject:
          r.subjectUserId || r.subjectGuestId
            ? {
                kind: r.subjectUserId ? 'user' : 'guest',
                userId: r.subjectUserId,
                name: subjectUser?.displayName ?? r.subjectName ?? 'Không rõ',
                warningCount: subjectUser?.warningCount ?? null,
                accountStatus: subjectUser?.status ?? null,
                priorReports: Math.max(0, (subjectKey ? (prior.get(subjectKey) ?? 1) : 1) - 1),
              }
            : null,
        category: r.category,
        description: r.description,
        reporterName: r.reporterUserId ? (byId.get(r.reporterUserId)?.displayName ?? null) : null,
        status: r.status,
        resolution: r.resolution,
        resolutionNote: r.resolutionNote,
        resolvedByName: r.resolvedBy ? (byId.get(r.resolvedBy)?.displayName ?? null) : null,
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        actions: r.status === 'open' ? actionsFor(r, subjectUser) : [],
      };
    });
  }

  async function sendWarning(user: UserEntity, report: ReportEntity, note: string) {
    try {
      await deps.mailer.send(
        warningEmail(
          user.email,
          user.displayName,
          REPORT_CATEGORY_LABELS[report.category],
          report.targetLabel,
          note,
        ),
      );
    } catch (error) {
      logger.error({ err: error, reportId: report.id }, 'Gửi email cảnh báo thất bại');
    }
  }

  return {
    async create(
      reporter: UserPrincipal,
      input: z.output<typeof createReportRequestSchema>,
    ): Promise<{ id: string }> {
      const retryAfter = await reportLimiter.consume(reporter.userId);
      if (retryAfter !== null) {
        throw new TooManyRequestsError(retryAfter, 'Bạn gửi báo cáo quá nhiều. Hãy thử lại sau.');
      }
      let values: Partial<ReportEntity>;
      if (input.targetType === 'question_set_version') {
        const target = await deps.publicSets.reportTarget(input.targetId);
        if (!target) throw new NotFoundError('Không tìm thấy bộ câu hỏi.');
        const owner = await dataSource
          .getRepository(UserEntity)
          .findOneBy({ id: target.ownerUserId });
        values = {
          targetLabel: target.label.slice(0, 200),
          subjectUserId: target.ownerUserId,
          subjectName: owner?.displayName ?? null,
          organizationId: await deps.organizations.organizationOf(target.ownerUserId),
        };
      } else {
        const target = await deps.rooms.reportTarget(input.targetId, input.participantId, reporter);
        // Khách: báo cáo thuộc tổ chức của Host phòng.
        const orgUser = target.subject.userId ?? target.hostUserId;
        values = {
          targetLabel: target.label.slice(0, 200),
          subjectUserId: target.subject.userId,
          subjectGuestId: target.subject.guestId,
          subjectName: target.subject.name.slice(0, 32),
          organizationId: await deps.organizations.organizationOf(orgUser),
        };
      }
      const report = await dataSource.getRepository(ReportEntity).save({
        ...values,
        reporterUserId: reporter.userId,
        targetType: input.targetType,
        targetId: input.targetId,
        category: input.category,
        description: input.description,
        status: 'open',
      });
      return { id: report.id };
    },

    async list(actor: UserPrincipal, status: ReportStatus): Promise<ReportList> {
      const scope = await scopeOf(actor);
      const query = dataSource
        .getRepository(ReportEntity)
        .createQueryBuilder('r')
        .orderBy('r.createdAt', status === 'open' ? 'ASC' : 'DESC')
        .take(200);
      const scoped = (q: typeof query) =>
        scope === 'all'
          ? q
          : q.andWhere(
              "(r.targetType = 'question_set_version' OR r.organizationId IN (:...orgs))",
              { orgs: scope.length > 0 ? scope : ['00000000-0000-0000-0000-000000000000'] },
            );
      const items = await scoped(query.where('r.status = :status', { status })).getMany();
      const openCount = await scoped(
        dataSource.getRepository(ReportEntity).createQueryBuilder('r').where("r.status = 'open'"),
      ).getCount();
      return { items: await present(items), openCount };
    },

    async resolve(
      actor: UserPrincipal,
      reportId: string,
      input: z.output<typeof resolveReportRequestSchema>,
    ): Promise<ReportView> {
      const scope = await scopeOf(actor);
      const report = await dataSource.getRepository(ReportEntity).findOneBy({ id: reportId });
      if (!report || !inScope(report, scope)) throw new NotFoundError('Không tìm thấy báo cáo.');
      if (report.status !== 'open') {
        throw new ConflictError('Báo cáo đã được xử lý.', ReportErrorCode.ReportAlreadyResolved);
      }
      const subject = report.subjectUserId
        ? await dataSource.getRepository(UserEntity).findOneBy({ id: report.subjectUserId })
        : null;
      if (!actionsFor(report, subject).includes(input.action)) {
        throw new ConflictError(
          'Cách xử lý này không áp dụng được cho báo cáo.',
          ReportErrorCode.ActionNotAllowed,
        );
      }
      const note = input.note || REPORT_CATEGORY_LABELS[report.category];
      const needsScope = input.action === 'warn' || input.action === 'lock_account';
      if (needsScope && !(await deps.organizations.inStaffScope(actor, report.subjectUserId!))) {
        throw new ForbiddenError('Tài khoản này ngoài phạm vi quản lý của bạn.');
      }

      // Hành động có tác động bên ngoài chạy trước; đánh dấu đã xử lý sau khi thành công.
      switch (input.action) {
        case 'remove_content':
          if (report.targetType === 'room') {
            await deps.closeRoom(actor, report.targetId, `Báo cáo vi phạm: ${note}`);
          } else {
            await dataSource.transaction((manager) =>
              deps.publicSets.takedown(manager, actor, report.targetId, note),
            );
          }
          break;
        case 'block_guest':
          await deps.rooms.staffBanGuest(
            report.targetId,
            report.subjectGuestId!,
            report.subjectName ?? 'Khách',
            actor.userId,
          );
          break;
        case 'lock_account':
          await deps.lockUser(actor, report.subjectUserId!, `Báo cáo vi phạm: ${note}`);
          break;
        case 'warn':
        case 'dismiss':
          break;
      }

      await dataSource.transaction(async (manager) => {
        await manager.update(
          ReportEntity,
          { id: report.id },
          {
            status: 'resolved',
            resolution: input.action,
            resolutionNote: input.note || null,
            resolvedBy: actor.userId,
            resolvedAt: new Date(),
          },
        );
        if (input.action === 'warn') {
          await manager.increment(UserEntity, { id: report.subjectUserId! }, 'warningCount', 1);
          await writeAuditLog(manager, {
            actorUserId: actor.userId,
            action: 'user.warn',
            targetType: 'user',
            targetId: report.subjectUserId,
            details: { reportId: report.id, note },
          });
        }
        await writeAuditLog(manager, {
          actorUserId: actor.userId,
          action: 'report.resolve',
          targetType: 'report',
          targetId: report.id,
          details: { resolution: input.action, note: input.note, target: report.targetLabel },
        });
      });
      if (input.action === 'warn' && subject) await sendWarning(subject, report, note);

      const updated = await dataSource
        .getRepository(ReportEntity)
        .findOneByOrFail({ id: reportId });
      return (await present([updated]))[0]!;
    },

    /** Ẩn danh tên đối tượng đã xóa tài khoản (BR-DATA-03). */
    async anonymizeUser(manager: EntityManager, userId: string): Promise<void> {
      await manager.update(ReportEntity, { subjectUserId: userId }, { subjectName: null });
    },
  };
}

export type ReportsService = ReturnType<typeof createReportsService>;
