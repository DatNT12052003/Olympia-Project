import {
  type QuestionAnswer,
  type QuestionSource,
  type RoundKey,
  ScriptErrorCode,
  type SourceInfo,
} from '@olympia/shared';
import { type DataSource, In, IsNull } from 'typeorm';
import { BadRequestError, ConflictError } from '../../shared/errors/app-error';
import { QuestionSetItemEntity } from './question-set-item.entity';
import { QuestionSetVersionEntity } from './question-set-version.entity';
import { QuestionSetEntity } from './question-set.entity';
import { QuestionEntity } from './question.entity';

/** Câu hỏi lấy từ nguồn cho một vòng, đã sao chép nội dung (BR-QB-04). */
export interface SourceQuestion {
  sourceQuestionId: string;
  content: string;
  answer: QuestionAnswer;
  explanation: string | null;
  mediaId: string | null;
}

/** Phiên bản bộ public còn dùng được trong kịch bản, kể cả khi đã bị thay/gỡ (BR-QB-07). */
const USABLE_VERSION_STATUSES = ['approved', 'superseded', 'withdrawn'] as const;

/**
 * Nguồn câu hỏi cho kịch bản (mục 6): bộ đề của Host hoặc phiên bản bộ public (DL-033). Câu hỏi
 * của vòng là các câu được xếp vào vòng đó trong bộ đề, theo thứ tự.
 */
export function createQuestionSourcesService({ dataSource }: { dataSource: DataSource }) {
  async function loadSet(ownerUserId: string, setId: string) {
    return dataSource.getRepository(QuestionSetEntity).findOneBy({
      id: setId,
      ownerUserId,
      deletedAt: IsNull(),
    });
  }

  async function loadVersion(versionId: string) {
    return dataSource.getRepository(QuestionSetVersionEntity).findOneBy({
      id: versionId,
      status: In([...USABLE_VERSION_STATUSES]),
    });
  }

  async function setQuestions(setId: string, round: RoundKey): Promise<SourceQuestion[]> {
    const items = await dataSource
      .createQueryBuilder(QuestionSetItemEntity, 'i')
      .innerJoinAndMapOne(
        'i.question',
        QuestionEntity,
        'q',
        'q.id = i.question_id AND q.deleted_at IS NULL',
      )
      .where('i.setId = :setId AND i.round = :round', { setId, round })
      .orderBy('i.position', 'ASC')
      .getMany();
    return (items as (QuestionSetItemEntity & { question: QuestionEntity })[]).map(
      ({ question: q }) => ({
        sourceQuestionId: q.id,
        content: q.content,
        answer: q.answer,
        explanation: q.explanation,
        mediaId: q.mediaId,
      }),
    );
  }

  function versionQuestions(version: QuestionSetVersionEntity, round: RoundKey): SourceQuestion[] {
    return version.snapshot.items
      .filter((item) => item.round === round)
      .map(({ question: q }) => ({
        sourceQuestionId: q.sourceQuestionId,
        content: q.content,
        answer: q.answer,
        explanation: q.explanation,
        mediaId: q.mediaId,
      }));
  }

  return {
    /**
     * Kiểm tra nguồn khi lưu kịch bản: bộ đề phải thuộc Host; bộ public phải đang được duyệt
     * (chọn mới) hoặc là nguồn đã chọn trước đó (BR-QB-07).
     */
    async assertSelectable(
      ownerUserId: string,
      source: QuestionSource,
      previous: QuestionSource | null,
    ): Promise<void> {
      if (source.kind === 'set') {
        if (!(await loadSet(ownerUserId, source.setId))) {
          throw new BadRequestError('Không tìm thấy bộ đề.', ScriptErrorCode.SourceUnavailable);
        }
        return;
      }
      const unchanged = previous?.kind === 'public' && previous.versionId === source.versionId;
      const version = await loadVersion(source.versionId);
      if (!version || (!unchanged && version.status !== 'approved')) {
        throw new BadRequestError(
          'Bộ câu hỏi public không còn được chia sẻ.',
          ScriptErrorCode.SourceUnavailable,
        );
      }
    },

    /** Tên nguồn và số câu xếp cho vòng (để kiểm tra đủ câu, BR-SCRIPT-01). */
    async describe(
      ownerUserId: string,
      source: QuestionSource,
      round: RoundKey,
    ): Promise<SourceInfo> {
      if (source.kind === 'set') {
        const set = await loadSet(ownerUserId, source.setId);
        if (!set) return { kind: 'set', name: 'Bộ đề đã xóa', available: 0, unavailable: true };
        const available = await dataSource
          .createQueryBuilder(QuestionSetItemEntity, 'i')
          .innerJoin(QuestionEntity, 'q', 'q.id = i.question_id AND q.deleted_at IS NULL')
          .where('i.set_id = :setId AND i.round = :round', { setId: set.id, round })
          .getCount();
        return { kind: 'set', name: set.name, available, unavailable: false };
      }
      const version = await loadVersion(source.versionId);
      if (!version) {
        return { kind: 'public', name: 'Bộ public không còn', available: 0, unavailable: true };
      }
      return {
        kind: 'public',
        name: version.name,
        available: version.snapshot.items.filter((item) => item.round === round).length,
        unavailable: false,
      };
    },

    /** Câu hỏi của vòng, theo thứ tự trong bộ đề; nguồn không còn thì báo lỗi. */
    async load(
      ownerUserId: string,
      source: QuestionSource,
      round: RoundKey,
    ): Promise<SourceQuestion[]> {
      if (source.kind === 'set') {
        const set = await loadSet(ownerUserId, source.setId);
        if (!set) {
          throw new ConflictError(
            'Bộ đề của vòng thi đã bị xóa.',
            ScriptErrorCode.SourceUnavailable,
          );
        }
        return setQuestions(set.id, round);
      }
      const version = await loadVersion(source.versionId);
      if (!version) {
        throw new ConflictError(
          'Bộ câu hỏi public của vòng thi không còn.',
          ScriptErrorCode.SourceUnavailable,
        );
      }
      return versionQuestions(version, round);
    },
  };
}

export type QuestionSourcesService = ReturnType<typeof createQuestionSourcesService>;
