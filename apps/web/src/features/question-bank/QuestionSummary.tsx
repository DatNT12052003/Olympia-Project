import type { QuestionView, SnapshotQuestion } from '@olympia/shared';
import type { ReactNode } from 'react';
import { ANSWER_TYPE_LABELS, answerSummary, DIFFICULTY_LABELS, MEDIA_LABELS } from './qb-format';

/** Một câu hỏi dạng gọn: nội dung, loại, đáp án (chỉ Host/Manager thấy, BR-QB-08). */
export function QuestionSummary({
  question,
  index,
  actions,
  badge,
}: {
  question: QuestionView | SnapshotQuestion;
  index?: number;
  actions?: ReactNode;
  badge?: ReactNode;
}) {
  const meta = [
    ANSWER_TYPE_LABELS[question.answer.type],
    question.media ? MEDIA_LABELS[question.media.kind] : null,
    question.subject,
    question.grade ? `Lớp ${question.grade}` : null,
    question.difficulty ? DIFFICULTY_LABELS[question.difficulty] : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-wrap items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
      {index !== undefined && (
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[13px] font-bold text-slate-700">
          {index}
        </span>
      )}
      {question.media?.kind === 'image' && (
        <img src={question.media.url} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
      )}
      <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
        <div className="flex flex-wrap items-start gap-2">
          {badge}
          <span className="min-w-0 flex-1 text-sm font-medium leading-snug">
            {question.content}
          </span>
        </div>
        <span className="text-[13px] text-green-800">Đáp án: {answerSummary(question.answer)}</span>
        <span className="text-xs text-slate-600">{meta.join(' · ')}</span>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
