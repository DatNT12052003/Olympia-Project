import type { DataSource } from 'typeorm';
import type { LimiterFactory } from '../../infrastructure/rate-limit/rate-limiter';
import type { ObjectStorage } from '../../infrastructure/storage/object-storage';
import { createMediaService } from '../media/media.service';
import { createPublicSetsService } from './public-sets.service';
import { createQuestionSetsService } from './question-sets.service';
import { createQuestionsService } from './questions.service';

export interface QuestionBankModuleDeps {
  dataSource: DataSource;
  storage: ObjectStorage;
  limiters: LimiterFactory;
  now?: () => Date;
}

/** Ghép Question Bank: media, câu hỏi, bộ đề, bộ public và kiểm duyệt (P2, đặc tả mục 5). */
export function createQuestionBankModule({
  dataSource,
  storage,
  limiters,
  now,
}: QuestionBankModuleDeps) {
  const clock = now ? { now } : {};
  const mediaService = createMediaService({ dataSource, storage, limiters, ...clock });
  const questionsService = createQuestionsService({ dataSource, media: mediaService });
  const questionSetsService = createQuestionSetsService({
    dataSource,
    questions: questionsService,
    ...clock,
  });
  const publicSetsService = createPublicSetsService({ dataSource, media: mediaService, ...clock });
  return { mediaService, questionsService, questionSetsService, publicSetsService };
}

export type QuestionBankModule = ReturnType<typeof createQuestionBankModule>;
