import type {
  AnswerType,
  Difficulty,
  MediaKind,
  QuestionAnswer,
  RoundKey,
  SetPublication,
} from '@olympia/shared';

export const ROUND_LABELS: Record<RoundKey, string> = {
  warmup: 'Khởi động',
  obstacle: 'Vượt CNV',
  acceleration: 'Tăng tốc',
  finish: 'Về đích',
};

export const ANSWER_TYPE_LABELS: Record<AnswerType, string> = {
  mcq: 'Trắc nghiệm',
  true_false: 'Đúng/Sai',
  short_answer: 'Trả lời ngắn',
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Dễ',
  medium: 'Trung bình',
  hard: 'Khó',
};

export const MEDIA_LABELS: Record<MediaKind, string> = {
  image: 'Hình ảnh',
  video: 'Video',
  audio: 'Âm thanh',
};

export const OPTION_KEYS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

/** Đáp án đúng dạng chữ để hiển thị gọn. */
export function answerSummary(answer: QuestionAnswer): string {
  switch (answer.type) {
    case 'mcq':
      return `${OPTION_KEYS[answer.correctIndex] ?? '?'}. ${answer.options[answer.correctIndex] ?? ''}`;
    case 'true_false':
      return answer.correct ? 'Đúng' : 'Sai';
    case 'short_answer':
      return [answer.answer, ...answer.acceptedAnswers].join(' / ');
  }
}

/** Nhãn trạng thái chia sẻ public của bộ đề. */
export function publicationLabel(publication: SetPublication): {
  text: string;
  tone: 'green' | 'brand' | 'orange' | 'slate';
} {
  if (publication.pending && publication.approved) {
    return {
      text: `Public bản ${publication.approved.versionNo} · bản ${publication.pending.versionNo} chờ duyệt`,
      tone: 'brand',
    };
  }
  if (publication.pending) return { text: 'Chờ duyệt', tone: 'brand' };
  if (publication.approved) return { text: 'Public', tone: 'green' };
  if (publication.rejected) return { text: 'Bị từ chối', tone: 'orange' };
  return { text: 'Riêng tư', tone: 'slate' };
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('vi-VN');
}
