import {
  type PublicSetDetail,
  type publicSetListQuerySchema,
  type PublicSetSummary,
  QuestionErrorCode,
  type ReviewDetail,
  type ReviewQueueItem,
} from '@olympia/shared';
import { type DataSource, type EntityManager, In } from 'typeorm';
import type { z } from 'zod';
import type { UserPrincipal } from '../../shared/auth/principal';
import { ConflictError, NotFoundError } from '../../shared/errors/app-error';
import { writeAuditLog } from '../audit/audit-log';
import type { MediaService } from '../media/media.service';
import { UserEntity } from '../users/user.entity';
import { buildSearchText, snapshotChanged, toSnapshotView } from './question-mapper';
import { QuestionSetItemEntity } from './question-set-item.entity';
import { type SetSnapshot, QuestionSetVersionEntity } from './question-set-version.entity';
import { QuestionSetEntity } from './question-set.entity';
import { QuestionEntity } from './question.entity';

const PUBLIC_LIST_LIMIT = 100;

function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export interface PublicSetsServiceDeps {
  dataSource: DataSource;
  media: MediaService;
  now?: () => Date;
}

/**
 * Bộ câu hỏi public (5.4): danh mục cho Host, sao chép về ngân hàng (BR-QB-05) và kiểm duyệt
 * của Manager/Super Admin (BR-QB-10). Đáp án chỉ trả cho người có quyền dùng/kiểm duyệt bộ
 * public, không bao giờ tới thiết bị Player (BR-QB-08).
 */
export function createPublicSetsService({
  dataSource,
  media,
  now = () => new Date(),
}: PublicSetsServiceDeps) {
  const versions = dataSource.getRepository(QuestionSetVersionEntity);

  async function ownerNames(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const users = await dataSource.getRepository(UserEntity).findBy({ id: In([...new Set(ids)]) });
    return new Map(users.map((u) => [u.id, u.displayName]));
  }

  async function snapshotItems(snapshot: SetSnapshot) {
    const mediaViews = await media.viewsFor(snapshot.items.map((item) => item.question.mediaId));
    return snapshot.items.map((item) => ({
      round: item.round,
      question: toSnapshotView(item.question, mediaViews),
    }));
  }

  async function loadOwners(list: QuestionSetVersionEntity[]) {
    const sets = list.length
      ? await dataSource
          .getRepository(QuestionSetEntity)
          .findBy({ id: In(list.map((v) => v.setId)) })
      : [];
    const ownerBySet = new Map(sets.map((s) => [s.id, s.ownerUserId]));
    const names = await ownerNames(sets.map((s) => s.ownerUserId));
    return { ownerBySet, names };
  }

  function summary(
    version: QuestionSetVersionEntity,
    ownerId: string | undefined,
    names: Map<string, string>,
    actor: UserPrincipal,
  ): PublicSetSummary {
    return {
      versionId: version.id,
      setId: version.setId,
      versionNo: version.versionNo,
      name: version.name,
      description: version.description,
      subject: version.subject,
      grade: version.grade,
      ownerName: (ownerId && names.get(ownerId)) ?? 'Host',
      mine: ownerId === actor.userId,
      questionCount: version.questionCount,
      approvedAt: (version.reviewedAt ?? version.submittedAt).toISOString(),
    };
  }

  async function loadApproved(versionId: string): Promise<QuestionSetVersionEntity> {
    const version = await versions.findOneBy({ id: versionId, status: 'approved' });
    if (!version) throw new NotFoundError('Không tìm thấy bộ câu hỏi public.');
    return version;
  }

  async function queueItems(list: QuestionSetVersionEntity[]): Promise<ReviewQueueItem[]> {
    const { ownerBySet, names } = await loadOwners(list);
    const approvedSets = list.length
      ? new Set(
          (
            await versions.find({
              where: { setId: In(list.map((v) => v.setId)), status: 'approved' },
              select: { setId: true },
            })
          ).map((v) => v.setId),
        )
      : new Set<string>();
    return list.map((v) => ({
      versionId: v.id,
      setId: v.setId,
      versionNo: v.versionNo,
      name: v.name,
      ownerName: names.get(ownerBySet.get(v.setId) ?? '') ?? 'Host',
      questionCount: v.questionCount,
      kind: approvedSets.has(v.setId) ? 'update' : 'new',
      submittedAt: v.submittedAt.toISOString(),
    }));
  }

  return {
    /** Danh mục bộ public đang hiển thị (phiên bản đã duyệt mới nhất của mỗi bộ). */
    async list(
      actor: UserPrincipal,
      query: z.output<typeof publicSetListQuerySchema>,
    ): Promise<PublicSetSummary[]> {
      const qb = versions.createQueryBuilder('v').where("v.status = 'approved'");
      if (query.q) {
        qb.andWhere('lower(v.name) LIKE lower(:term)', { term: likePattern(query.q) });
      }
      if (query.subject)
        qb.andWhere('lower(v.subject) = lower(:subject)', { subject: query.subject });
      const list = await qb.orderBy('v.reviewedAt', 'DESC').take(PUBLIC_LIST_LIMIT).getMany();
      const { ownerBySet, names } = await loadOwners(list);
      return list.map((v) => summary(v, ownerBySet.get(v.setId), names, actor));
    },

    async get(actor: UserPrincipal, versionId: string): Promise<PublicSetDetail> {
      const version = await loadApproved(versionId);
      const { ownerBySet, names } = await loadOwners([version]);
      return {
        ...summary(version, ownerBySet.get(version.setId), names, actor),
        items: await snapshotItems(version.snapshot),
      };
    },

    /**
     * Sao chép bộ public về ngân hàng của Host (BR-QB-05): bộ đề mới và câu hỏi mới thuộc người
     * sao chép; sửa bản gốc không ảnh hưởng bản sao.
     */
    async copy(actor: UserPrincipal, versionId: string): Promise<{ setId: string }> {
      const version = await loadApproved(versionId);
      return dataSource.transaction(async (manager) => {
        const set = await manager.save(
          manager.create(QuestionSetEntity, {
            ownerUserId: actor.userId,
            name: version.name,
            description: version.description,
            subject: version.subject,
            grade: version.grade,
            copiedFromVersionId: version.id,
          }),
        );
        let position = 0;
        for (const item of version.snapshot.items) {
          const { sourceQuestionId: _source, ...q } = item.question;
          const question = await manager.save(
            manager.create(QuestionEntity, {
              ownerUserId: actor.userId,
              answerType: q.answer.type,
              ...q,
              searchText: buildSearchText(q),
            }),
          );
          await manager.insert(QuestionSetItemEntity, {
            setId: set.id,
            questionId: question.id,
            round: item.round,
            position: position++,
          });
        }
        return { setId: set.id };
      });
    },

    // --- Kiểm duyệt (Manager/Super Admin, BR-QB-10) ---

    async queue(): Promise<ReviewQueueItem[]> {
      const list = await versions.find({
        where: { status: 'pending' },
        order: { submittedAt: 'ASC' },
        take: 200,
      });
      return queueItems(list);
    },

    /** Chi tiết phiên bản chờ duyệt kèm thay đổi so với phiên bản đang public. */
    async reviewDetail(versionId: string): Promise<ReviewDetail> {
      const version = await versions.findOneBy({ id: versionId });
      if (!version) throw new NotFoundError('Không tìm thấy phiên bản bộ câu hỏi.');
      const [queueItem] = await queueItems([version]);
      const approved =
        version.status === 'approved'
          ? null
          : await versions.findOneBy({ setId: version.setId, status: 'approved' });

      const current = version.snapshot.items.map((i) => i.question);
      const previous = approved?.snapshot.items.map((i) => i.question) ?? [];
      const previousById = new Map(previous.map((q) => [q.sourceQuestionId, q]));
      const currentIds = new Set(current.map((q) => q.sourceQuestionId));
      const mediaViews = await media.viewsFor([...current, ...previous].map((q) => q.mediaId));

      const changes: ReviewDetail['changes'] = [];
      for (const q of current) {
        const before = previousById.get(q.sourceQuestionId);
        if (!before) changes.push({ kind: 'added', question: toSnapshotView(q, mediaViews) });
        else if (snapshotChanged(before, q)) {
          changes.push({ kind: 'changed', question: toSnapshotView(q, mediaViews) });
        }
      }
      for (const q of previous) {
        if (!currentIds.has(q.sourceQuestionId)) {
          changes.push({ kind: 'removed', question: toSnapshotView(q, mediaViews) });
        }
      }

      return {
        ...queueItem!,
        description: version.description,
        subject: version.subject,
        grade: version.grade,
        status: version.status,
        approvedVersionNo: approved?.versionNo ?? null,
        mediaCount: current.filter((q) => q.mediaId).length,
        changes,
        items: version.snapshot.items.map((item) => ({
          round: item.round,
          question: toSnapshotView(item.question, mediaViews),
        })),
      };
    },

    /** Duyệt: phiên bản thành public, phiên bản public trước đó được thay thế (BR-QB-09). */
    async approve(actor: UserPrincipal, versionId: string): Promise<void> {
      await dataSource.transaction(async (manager) => {
        const version = await manager.findOne(QuestionSetVersionEntity, {
          where: { id: versionId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!version) throw new NotFoundError('Không tìm thấy phiên bản bộ câu hỏi.');
        if (version.status !== 'pending') {
          throw new ConflictError(
            'Phiên bản này không còn chờ duyệt.',
            QuestionErrorCode.InvalidReviewState,
          );
        }
        await manager.update(
          QuestionSetVersionEntity,
          { setId: version.setId, status: 'approved' },
          { status: 'superseded' },
        );
        await manager.update(
          QuestionSetVersionEntity,
          { id: version.id },
          { status: 'approved', reviewedBy: actor.userId, reviewedAt: now() },
        );
        await writeAuditLog(manager, {
          actorUserId: actor.userId,
          action: 'question_set.approve',
          targetType: 'question_set_version',
          targetId: version.id,
          details: { setId: version.setId, versionNo: version.versionNo, name: version.name },
        });
      });
    },

    /**
     * Gỡ bộ public vi phạm (15.2, 15.3): phiên bản đang public không còn hiển thị; kịch bản đã chọn
     * vẫn dùng được (BR-QB-07).
     */
    async takedown(
      manager: EntityManager,
      actor: UserPrincipal,
      versionId: string,
      reason: string,
    ): Promise<void> {
      const version = await manager.findOne(QuestionSetVersionEntity, {
        where: { id: versionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!version) throw new NotFoundError('Không tìm thấy phiên bản bộ câu hỏi.');
      if (version.status !== 'approved' && version.status !== 'pending') return;
      await manager.update(
        QuestionSetVersionEntity,
        { id: version.id },
        { status: 'withdrawn', reviewedBy: actor.userId, reviewedAt: now(), reviewReason: reason },
      );
      await writeAuditLog(manager, {
        actorUserId: actor.userId,
        action: 'question_set.takedown',
        targetType: 'question_set_version',
        targetId: version.id,
        details: { setId: version.setId, versionNo: version.versionNo, reason },
      });
    },

    /** Thông tin bộ public để gắn vào báo cáo vi phạm (tên, người sở hữu). */
    async reportTarget(versionId: string): Promise<{ label: string; ownerUserId: string } | null> {
      const row = await dataSource
        .createQueryBuilder(QuestionSetVersionEntity, 'v')
        .innerJoin(QuestionSetEntity, 's', 's.id = v.set_id')
        .select('v.name', 'name')
        .addSelect('v.version_no', 'versionNo')
        .addSelect('s.owner_user_id', 'ownerUserId')
        .where('v.id = :versionId', { versionId })
        .andWhere("v.status IN ('approved', 'superseded', 'withdrawn')")
        .getRawOne<{ name: string; versionNo: number; ownerUserId: string }>();
      return row ? { label: row.name, ownerUserId: row.ownerUserId } : null;
    },

    /** Từ chối kèm lý do (5.4 bước 2). */
    async reject(actor: UserPrincipal, versionId: string, reason: string): Promise<void> {
      await dataSource.transaction(async (manager) => {
        const version = await manager.findOne(QuestionSetVersionEntity, {
          where: { id: versionId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!version) throw new NotFoundError('Không tìm thấy phiên bản bộ câu hỏi.');
        if (version.status !== 'pending') {
          throw new ConflictError(
            'Phiên bản này không còn chờ duyệt.',
            QuestionErrorCode.InvalidReviewState,
          );
        }
        await manager.update(
          QuestionSetVersionEntity,
          { id: version.id },
          { status: 'rejected', reviewedBy: actor.userId, reviewedAt: now(), reviewReason: reason },
        );
        await writeAuditLog(manager, {
          actorUserId: actor.userId,
          action: 'question_set.reject',
          targetType: 'question_set_version',
          targetId: version.id,
          details: { setId: version.setId, versionNo: version.versionNo, reason },
        });
      });
    },
  };
}

export type PublicSetsService = ReturnType<typeof createPublicSetsService>;
