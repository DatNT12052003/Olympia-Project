import {
  type appendSetItemsRequestSchema,
  MAX_SET_ITEMS,
  QuestionErrorCode,
  type QuestionSetDetail,
  type questionSetInputSchema,
  type QuestionSetSummary,
  type randomFillRequestSchema,
  type replaceSetItemsRequestSchema,
  type RoundKey,
  type SetPublication,
} from '@olympia/shared';
import { type DataSource, type EntityManager, In, IsNull } from 'typeorm';
import type { z } from 'zod';
import type { UserPrincipal } from '../../shared/auth/principal';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors/app-error';
import { toStoredSnapshot } from './question-mapper';
import { QuestionSetItemEntity } from './question-set-item.entity';
import { QuestionSetVersionEntity } from './question-set-version.entity';
import { QuestionSetEntity } from './question-set.entity';
import { QuestionEntity } from './question.entity';
import type { QuestionsService } from './questions.service';

type SetInput = z.output<typeof questionSetInputSchema>;

function emptyPublication(): SetPublication {
  return { approved: null, pending: null, rejected: null };
}

/** Trạng thái chia sẻ public của từng bộ từ danh sách phiên bản (BR-QB-09). */
function publicationOf(versions: QuestionSetVersionEntity[]): SetPublication {
  const publication = emptyPublication();
  const latest = versions.reduce<QuestionSetVersionEntity | null>(
    (max, v) => (!max || v.versionNo > max.versionNo ? v : max),
    null,
  );
  for (const v of versions) {
    if (v.status === 'approved' && v.reviewedAt) {
      publication.approved = {
        versionId: v.id,
        versionNo: v.versionNo,
        reviewedAt: v.reviewedAt.toISOString(),
      };
    }
    if (v.status === 'pending') {
      publication.pending = {
        versionId: v.id,
        versionNo: v.versionNo,
        submittedAt: v.submittedAt.toISOString(),
      };
    }
  }
  // Chỉ báo bị từ chối khi đó là lần gửi gần nhất.
  if (latest?.status === 'rejected' && latest.reviewedAt) {
    publication.rejected = {
      versionId: latest.id,
      versionNo: latest.versionNo,
      reason: latest.reviewReason ?? '',
      reviewedAt: latest.reviewedAt.toISOString(),
    };
  }
  return publication;
}

export interface QuestionSetsServiceDeps {
  dataSource: DataSource;
  questions: QuestionsService;
  now?: () => Date;
}

/** Bộ đề (5.3) và chia sẻ public phía chủ sở hữu (5.4). */
export function createQuestionSetsService({
  dataSource,
  questions,
  now = () => new Date(),
}: QuestionSetsServiceDeps) {
  async function loadOwn(
    manager: EntityManager,
    actor: UserPrincipal,
    setId: string,
    lock = false,
  ): Promise<QuestionSetEntity> {
    const set = await manager.findOne(QuestionSetEntity, {
      where: { id: setId, ownerUserId: actor.userId, deletedAt: IsNull() },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!set) throw new NotFoundError('Không tìm thấy bộ đề.');
    return set;
  }

  /** Câu hỏi (còn hiệu lực) của bộ đề theo thứ tự. */
  async function itemsOf(manager: EntityManager, setId: string) {
    return manager
      .createQueryBuilder(QuestionSetItemEntity, 'i')
      .innerJoinAndMapOne(
        'i.question',
        QuestionEntity,
        'q',
        'q.id = i.question_id AND q.deleted_at IS NULL',
      )
      .where('i.setId = :setId', { setId })
      .orderBy('i.position', 'ASC')
      .getMany() as Promise<(QuestionSetItemEntity & { question: QuestionEntity })[]>;
  }

  async function summaries(sets: QuestionSetEntity[]): Promise<QuestionSetSummary[]> {
    if (sets.length === 0) return [];
    const ids = sets.map((s) => s.id);
    const counts = await dataSource
      .createQueryBuilder(QuestionSetItemEntity, 'i')
      .innerJoin(QuestionEntity, 'q', 'q.id = i.question_id AND q.deleted_at IS NULL')
      .select('i.set_id', 'setId')
      .addSelect("coalesce(i.round, 'none')", 'round')
      .addSelect('count(*)::int', 'count')
      .where('i.set_id IN (:...ids)', { ids })
      .groupBy('i.set_id')
      .addGroupBy('i.round')
      .getRawMany<{ setId: string; round: string; count: number }>();
    const versions = await dataSource.getRepository(QuestionSetVersionEntity).find({
      where: { setId: In(ids) },
      select: {
        id: true,
        setId: true,
        versionNo: true,
        status: true,
        submittedAt: true,
        reviewedAt: true,
        reviewReason: true,
      },
    });
    return sets.map((set) => {
      const roundCounts: Record<string, number> = {};
      for (const row of counts.filter((c) => c.setId === set.id))
        roundCounts[row.round] = row.count;
      return {
        id: set.id,
        name: set.name,
        description: set.description,
        subject: set.subject,
        grade: set.grade,
        questionCount: Object.values(roundCounts).reduce((sum, n) => sum + n, 0),
        roundCounts,
        publication: publicationOf(versions.filter((v) => v.setId === set.id)),
        updatedAt: set.updatedAt.toISOString(),
      };
    });
  }

  async function detail(actor: UserPrincipal, setId: string): Promise<QuestionSetDetail> {
    const set = await loadOwn(dataSource.manager, actor, setId);
    const [summary] = await summaries([set]);
    const items = await itemsOf(dataSource.manager, set.id);
    const views = await questions.views(items.map((item) => item.question));
    return {
      ...summary!,
      items: items.map((item, i) => ({ round: item.round, question: views[i]! })),
    };
  }

  /** Thêm câu hỏi của chính Host vào cuối bộ đề (bỏ câu đã có). */
  async function append(
    manager: EntityManager,
    actor: UserPrincipal,
    set: QuestionSetEntity,
    questionIds: string[],
    round: RoundKey | null,
  ): Promise<number> {
    const existing = await manager.findBy(QuestionSetItemEntity, { setId: set.id });
    const present = new Set(existing.map((item) => item.questionId));
    const wanted = [...new Set(questionIds)].filter((id) => !present.has(id));
    if (wanted.length === 0) return 0;
    const owned = await manager.findBy(QuestionEntity, {
      id: In(wanted),
      ownerUserId: actor.userId,
      deletedAt: IsNull(),
    });
    if (owned.length !== wanted.length) {
      throw new BadRequestError('Chỉ thêm được câu hỏi trong ngân hàng của bạn.');
    }
    if (existing.length + wanted.length > MAX_SET_ITEMS) {
      throw new ConflictError(`Bộ đề tối đa ${MAX_SET_ITEMS} câu hỏi.`);
    }
    let position = existing.reduce((max, item) => Math.max(max, item.position), -1);
    await manager.insert(
      QuestionSetItemEntity,
      wanted.map((questionId) => ({ setId: set.id, questionId, round, position: (position += 1) })),
    );
    await manager.update(QuestionSetEntity, { id: set.id }, { updatedAt: now() });
    return wanted.length;
  }

  return {
    detail,

    async list(actor: UserPrincipal): Promise<QuestionSetSummary[]> {
      const sets = await dataSource.getRepository(QuestionSetEntity).find({
        where: { ownerUserId: actor.userId, deletedAt: IsNull() },
        order: { updatedAt: 'DESC' },
        take: 200,
      });
      return summaries(sets);
    },

    async create(actor: UserPrincipal, input: SetInput): Promise<QuestionSetDetail> {
      const repo = dataSource.getRepository(QuestionSetEntity);
      const set = await repo.save(repo.create({ ownerUserId: actor.userId, ...input }));
      return detail(actor, set.id);
    },

    async update(actor: UserPrincipal, setId: string, input: SetInput): Promise<QuestionSetDetail> {
      const set = await loadOwn(dataSource.manager, actor, setId);
      await dataSource.getRepository(QuestionSetEntity).save(Object.assign(set, input));
      return detail(actor, setId);
    },

    /** Xóa bộ đề (mềm); phiên bản public/chờ duyệt bị gỡ, kịch bản đã tham chiếu vẫn dùng được (BR-QB-07). */
    async remove(actor: UserPrincipal, setId: string): Promise<void> {
      await dataSource.transaction(async (manager) => {
        const set = await loadOwn(manager, actor, setId, true);
        await manager.update(QuestionSetEntity, { id: set.id }, { deletedAt: now() });
        await manager.update(
          QuestionSetVersionEntity,
          { setId: set.id, status: In(['approved', 'pending']) },
          { status: 'withdrawn' },
        );
      });
    },

    /** Thay toàn bộ danh sách câu hỏi theo thứ tự và vòng (kéo thả, đổi vòng, bỏ câu). */
    async replaceItems(
      actor: UserPrincipal,
      setId: string,
      input: z.output<typeof replaceSetItemsRequestSchema>,
    ): Promise<QuestionSetDetail> {
      await dataSource.transaction(async (manager) => {
        const set = await loadOwn(manager, actor, setId, true);
        const ids = input.items.map((item) => item.questionId);
        if (ids.length > 0) {
          const owned = await manager.countBy(QuestionEntity, {
            id: In(ids),
            ownerUserId: actor.userId,
            deletedAt: IsNull(),
          });
          if (owned !== ids.length) {
            throw new BadRequestError('Chỉ thêm được câu hỏi trong ngân hàng của bạn.');
          }
        }
        await manager.delete(QuestionSetItemEntity, { setId: set.id });
        if (ids.length > 0) {
          await manager.insert(
            QuestionSetItemEntity,
            input.items.map((item, position) => ({ setId: set.id, ...item, position })),
          );
        }
        await manager.update(QuestionSetEntity, { id: set.id }, { updatedAt: now() });
      });
      return detail(actor, setId);
    },

    async appendItems(
      actor: UserPrincipal,
      setId: string,
      input: z.output<typeof appendSetItemsRequestSchema>,
    ): Promise<{ added: number; set: QuestionSetDetail }> {
      const added = await dataSource.transaction(async (manager) => {
        const set = await loadOwn(manager, actor, setId, true);
        return append(manager, actor, set, input.questionIds, input.round);
      });
      return { added, set: await detail(actor, setId) };
    },

    /** Thêm câu ngẫu nhiên theo tiêu chí môn/lớp/độ khó/vòng (5.3). */
    async randomFill(
      actor: UserPrincipal,
      setId: string,
      input: z.output<typeof randomFillRequestSchema>,
    ): Promise<{ added: number; set: QuestionSetDetail }> {
      const added = await dataSource.transaction(async (manager) => {
        const set = await loadOwn(manager, actor, setId, true);
        const qb = manager
          .createQueryBuilder(QuestionEntity, 'q')
          .select('q.id', 'id')
          .where('q.ownerUserId = :owner AND q.deletedAt IS NULL', { owner: actor.userId })
          .andWhere(
            'NOT EXISTS (SELECT 1 FROM question_set_items i WHERE i.set_id = :setId AND i.question_id = q.id)',
            { setId: set.id },
          );
        if (input.round && input.matchRound)
          qb.andWhere(':round = ANY(q.rounds)', { round: input.round });
        if (input.subject)
          qb.andWhere('lower(q.subject) = lower(:subject)', { subject: input.subject });
        if (input.grade) qb.andWhere('q.grade = :grade', { grade: input.grade });
        if (input.difficulty)
          qb.andWhere('q.difficulty = :difficulty', { difficulty: input.difficulty });
        const picked = await qb.orderBy('random()').limit(input.count).getRawMany<{ id: string }>();
        return append(
          manager,
          actor,
          set,
          picked.map((row) => row.id),
          input.round,
        );
      });
      return { added, set: await detail(actor, setId) };
    },

    /**
     * Gửi duyệt chia sẻ public (5.4): tạo phiên bản snapshot chờ duyệt. Bản chờ duyệt cũ (nếu có)
     * được thay thế; bản đang public vẫn hiển thị tới khi bản mới được duyệt (BR-QB-09).
     */
    async publish(actor: UserPrincipal, setId: string): Promise<QuestionSetDetail> {
      await dataSource.transaction(async (manager) => {
        const set = await loadOwn(manager, actor, setId, true);
        const items = await itemsOf(manager, set.id);
        if (items.length === 0) {
          throw new ConflictError('Bộ đề chưa có câu hỏi nào.', QuestionErrorCode.EmptySet);
        }
        await manager.update(
          QuestionSetVersionEntity,
          { setId: set.id, status: 'pending' },
          { status: 'superseded' },
        );
        const last = await manager
          .createQueryBuilder(QuestionSetVersionEntity, 'v')
          .select('coalesce(max(v.version_no), 0)', 'max')
          .where('v.set_id = :setId', { setId: set.id })
          .getRawOne<{ max: number }>();
        await manager.insert(QuestionSetVersionEntity, {
          setId: set.id,
          versionNo: Number(last?.max ?? 0) + 1,
          status: 'pending',
          name: set.name,
          description: set.description,
          subject: set.subject,
          grade: set.grade,
          questionCount: items.length,
          snapshot: {
            items: items.map((item) => ({
              round: item.round,
              question: toStoredSnapshot(item.question),
            })),
          },
          submittedBy: actor.userId,
          submittedAt: now(),
        });
      });
      return detail(actor, setId);
    },

    /** Gỡ khỏi public và hủy bản chờ duyệt; kịch bản đang tham chiếu vẫn dùng được (BR-QB-07). */
    async unpublish(actor: UserPrincipal, setId: string): Promise<QuestionSetDetail> {
      await dataSource.transaction(async (manager) => {
        const set = await loadOwn(manager, actor, setId, true);
        await manager.update(
          QuestionSetVersionEntity,
          { setId: set.id, status: In(['approved', 'pending']) },
          { status: 'withdrawn' },
        );
      });
      return detail(actor, setId);
    },
  };
}

export type QuestionSetsService = ReturnType<typeof createQuestionSetsService>;
