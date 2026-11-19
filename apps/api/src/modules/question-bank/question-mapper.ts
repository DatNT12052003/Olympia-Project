import {
  type MediaView,
  normalizeAnswer,
  type QuestionAnswer,
  type QuestionView,
  type SnapshotQuestion,
} from '@olympia/shared';
import type { SetSnapshot } from './question-set-version.entity';
import type { QuestionEntity } from './question.entity';

type StoredSnapshotQuestion = SetSnapshot['items'][number]['question'];

/** Chữ của đáp án, dùng cho tìm kiếm. */
function answerText(answer: QuestionAnswer): string {
  switch (answer.type) {
    case 'mcq':
      return answer.options.join(' ');
    case 'true_false':
      return '';
    case 'short_answer':
      return [answer.answer, ...answer.acceptedAnswers].join(' ');
  }
}

/** Chuỗi tìm kiếm: nội dung, đáp án, thẻ, chủ đề – chữ thường, bỏ dấu. */
export function buildSearchText(question: {
  content: string;
  answer: QuestionAnswer;
  tags: string[];
  topic: string | null;
}): string {
  return normalizeAnswer(
    [question.content, answerText(question.answer), question.topic ?? '', ...question.tags].join(
      ' ',
    ),
    true,
  );
}

export function toQuestionView(
  question: QuestionEntity,
  media: Map<string, MediaView>,
): QuestionView {
  return {
    id: question.id,
    content: question.content,
    answer: question.answer,
    explanation: question.explanation,
    media: question.mediaId ? (media.get(question.mediaId) ?? null) : null,
    subject: question.subject,
    topic: question.topic,
    grade: question.grade,
    difficulty: question.difficulty,
    rounds: question.rounds,
    defaultPoints: question.defaultPoints,
    defaultTimeSeconds: question.defaultTimeSeconds,
    tags: question.tags,
    createdAt: question.createdAt.toISOString(),
    updatedAt: question.updatedAt.toISOString(),
  };
}

/** Bản sao nội dung câu hỏi lưu trong phiên bản bộ public (BR-QB-04). */
export function toStoredSnapshot(question: QuestionEntity): StoredSnapshotQuestion {
  return {
    sourceQuestionId: question.id,
    content: question.content,
    answer: question.answer,
    explanation: question.explanation,
    mediaId: question.mediaId,
    subject: question.subject,
    topic: question.topic,
    grade: question.grade,
    difficulty: question.difficulty,
    rounds: question.rounds,
    defaultPoints: question.defaultPoints,
    defaultTimeSeconds: question.defaultTimeSeconds,
    tags: question.tags,
  };
}

export function toSnapshotView(
  stored: StoredSnapshotQuestion,
  media: Map<string, MediaView>,
): SnapshotQuestion {
  const { mediaId, ...rest } = stored;
  return { ...rest, media: mediaId ? (media.get(mediaId) ?? null) : null };
}

/** Hai bản snapshot của cùng câu hỏi có khác nội dung không (so sánh phiên bản để kiểm duyệt). */
export function snapshotChanged(a: StoredSnapshotQuestion, b: StoredSnapshotQuestion): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}
