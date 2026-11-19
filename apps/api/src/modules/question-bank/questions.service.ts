import {
  normalizeAnswer,
  type QuestionFacets,
  type questionInputSchema,
  type QuestionList,
  type questionListQuerySchema,
  type QuestionView,
} from '@olympia/shared';
import { type DataSource, In, IsNull } from 'typeorm';
import type { z } from 'zod';
import type { UserPrincipal } from '../../shared/auth/principal';
import { NotFoundError } from '../../shared/errors/app-error';
import type { MediaService } from '../media/media.service';
import { buildSearchText, toQuestionView } from './question-mapper';
import { QuestionSetItemEntity } from './question-set-item.entity';
import { QuestionEntity } from './question.entity';

type QuestionInput = z.output<typeof questionInputSchema>;

/** Escape ký tự đặc biệt của LIKE. */
function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export interface QuestionsServiceDeps {
  dataSource: DataSource;
  media: MediaService;
}

/** Ngân hàng câu hỏi của Host (5.1, 5.2). Host chỉ thấy và sửa câu hỏi của mình. */
export function createQuestionsService({ dataSource, media }: QuestionsServiceDeps) {
  const repo = dataSource.getRepository(QuestionEntity);

  async function views(questions: QuestionEntity[]): Promise<QuestionView[]> {
    const mediaViews = await media.viewsFor(questions.map((q) => q.mediaId));
    return questions.map((q) => toQuestionView(q, mediaViews));
  }

  async function loadOwn(actor: UserPrincipal, id: string): Promise<QuestionEntity> {
    const question = await repo.findOneBy({ id, ownerUserId: actor.userId, deletedAt: IsNull() });
    if (!question) throw new NotFoundError('Không tìm thấy câu hỏi.');
    return question;
  }

  function fields(input: QuestionInput) {
    return {
      answerType: input.answer.type,
      content: input.content,
      answer: input.answer,
      explanation: input.explanation,
      mediaId: input.mediaId,
      subject: input.subject,
      topic: input.topic,
      grade: input.grade,
      difficulty: input.difficulty,
      rounds: input.rounds,
      defaultPoints: input.defaultPoints,
      defaultTimeSeconds: input.defaultTimeSeconds,
      tags: input.tags,
      searchText: buildSearchText(input),
    };
  }

  return {
    views,

    async list(
      actor: UserPrincipal,
      query: z.output<typeof questionListQuerySchema>,
    ): Promise<QuestionList> {
      const qb = repo
        .createQueryBuilder('q')
        .where('q.ownerUserId = :owner', { owner: actor.userId })
        .andWhere('q.deletedAt IS NULL');
      if (query.q) {
        qb.andWhere("q.searchText LIKE :term ESCAPE '\\'", {
          term: likePattern(normalizeAnswer(query.q, true)),
        });
      }
      if (query.subject)
        qb.andWhere('lower(q.subject) = lower(:subject)', { subject: query.subject });
      if (query.grade) qb.andWhere('q.grade = :grade', { grade: query.grade });
      if (query.difficulty)
        qb.andWhere('q.difficulty = :difficulty', { difficulty: query.difficulty });
      if (query.answerType)
        qb.andWhere('q.answerType = :answerType', { answerType: query.answerType });
      if (query.round) qb.andWhere(':round = ANY(q.rounds)', { round: query.round });
      if (query.tag) qb.andWhere(':tag = ANY(q.tags)', { tag: query.tag });
      if (query.media === 'none') qb.andWhere('q.mediaId IS NULL');
      else if (query.media) {
        qb.innerJoin('media_assets', 'm', 'm.id = q.media_id').andWhere('m.kind = :kind', {
          kind: query.media,
        });
      }
      const [items, total] = await qb
        .orderBy('q.createdAt', 'DESC')
        .addOrderBy('q.id', 'ASC')
        .skip((query.page - 1) * query.pageSize)
        .take(query.pageSize)
        .getManyAndCount();
      return { items: await views(items), page: query.page, pageSize: query.pageSize, total };
    },

    async facets(actor: UserPrincipal): Promise<QuestionFacets> {
      const owner = { owner: actor.userId };
      const subjects = await repo
        .createQueryBuilder('q')
        .select('DISTINCT q.subject', 'subject')
        .where('q.ownerUserId = :owner AND q.deletedAt IS NULL AND q.subject IS NOT NULL', owner)
        .orderBy('q.subject')
        .getRawMany<{ subject: string }>();
      const grades = await repo
        .createQueryBuilder('q')
        .select('DISTINCT q.grade', 'grade')
        .where('q.ownerUserId = :owner AND q.deletedAt IS NULL AND q.grade IS NOT NULL', owner)
        .orderBy('q.grade')
        .getRawMany<{ grade: number }>();
      const total = await repo.countBy({ ownerUserId: actor.userId, deletedAt: IsNull() });
      return {
        subjects: subjects.map((row) => row.subject).sort((a, b) => a.localeCompare(b, 'vi')),
        grades: grades.map((row) => Number(row.grade)),
        total,
      };
    },

    async get(actor: UserPrincipal, id: string): Promise<QuestionView> {
      const [view] = await views([await loadOwn(actor, id)]);
      return view!;
    },

    async create(actor: UserPrincipal, input: QuestionInput): Promise<QuestionView> {
      if (input.mediaId) await media.assertUsable(actor, input.mediaId, null);
      const saved = await repo.save(repo.create({ ownerUserId: actor.userId, ...fields(input) }));
      const [view] = await views([saved]);
      return view!;
    },

    /** Sửa câu hỏi; phiên bản bộ public đã gửi giữ bản snapshot cũ (BR-QB-04, BR-QB-09). */
    async update(actor: UserPrincipal, id: string, input: QuestionInput): Promise<QuestionView> {
      const question = await loadOwn(actor, id);
      if (input.mediaId) await media.assertUsable(actor, input.mediaId, question.mediaId);
      Object.assign(question, fields(input));
      const saved = await repo.save(question);
      const [view] = await views([saved]);
      return view!;
    },

    /**
     * Ẩn câu hỏi (xóa mềm, BR-QB-03) và gỡ khỏi các bộ đề đang soạn; snapshot bộ public và lịch
     * sử trận không bị ảnh hưởng.
     */
    async softDelete(actor: UserPrincipal, ids: string[]): Promise<number> {
      return dataSource.transaction(async (manager) => {
        const owned = await manager.findBy(QuestionEntity, {
          id: In(ids),
          ownerUserId: actor.userId,
          deletedAt: IsNull(),
        });
        if (owned.length === 0) return 0;
        const ownedIds = owned.map((q) => q.id);
        await manager.update(QuestionEntity, { id: In(ownedIds) }, { deletedAt: new Date() });
        await manager.delete(QuestionSetItemEntity, { questionId: In(ownedIds) });
        return ownedIds.length;
      });
    },
  };
}

export type QuestionsService = ReturnType<typeof createQuestionsService>;
