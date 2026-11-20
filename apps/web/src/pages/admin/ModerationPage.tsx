import { rejectVersionRequestSchema, type ReviewDetail } from '@olympia/shared';
import { useState } from 'react';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Badge, Spinner } from '../../components/Card';
import { CheckIcon } from '../../components/icons';
import { QuestionSummary } from '../../features/question-bank/QuestionSummary';
import {
  useReviewAction,
  useReviewDetail,
  useReviewQueue,
} from '../../features/question-bank/qb-api';
import { formatDate } from '../../features/question-bank/qb-format';
import { errorMessage } from '../../lib/api-client';

const CHANGE_BADGES = {
  added: { label: 'Thêm', tone: 'green' },
  changed: { label: 'Sửa', tone: 'amber' },
  removed: { label: 'Bỏ', tone: 'slate' },
} as const;

function ReviewPanel({
  detail,
  onReviewed,
}: {
  detail: ReviewDetail;
  onReviewed: (message: string) => void;
}) {
  const review = useReviewAction();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  function act(action: 'approve' | 'reject') {
    setError(null);
    if (action === 'reject') {
      const parsed = rejectVersionRequestSchema.safeParse({ reason });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? 'Nhập lý do từ chối.');
        return;
      }
    }
    // mutateAsync: sau khi duyệt, hàng đợi được tải lại và panel này có thể đã unmount, khi đó
    // callback truyền vào mutate() không được gọi. Thông báo nằm ở trang cha nên vẫn hiện.
    review
      .mutateAsync({ versionId: detail.versionId, action, reason })
      .then(() =>
        onReviewed(
          action === 'approve'
            ? `Đã duyệt “${detail.name}”. Bộ câu hỏi đã hiển thị với mọi Host.`
            : `Đã từ chối “${detail.name}”.`,
        ),
      )
      .catch((err: unknown) => setError(errorMessage(err)));
  }

  return (
    <section
      aria-labelledby="review-heading"
      className="flex min-w-0 flex-[999_1_520px] flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="review-heading" className="text-[22px] font-bold">
            {detail.name}
          </h2>
          <p className="mt-1.5 text-sm text-slate-600">
            {detail.ownerName} · {detail.questionCount} câu
            {detail.subject ? ` · ${detail.subject}` : ''}
            {detail.grade ? ` · Lớp ${detail.grade}` : ''} · gửi {formatDate(detail.submittedAt)}
          </p>
          {detail.description && (
            <p className="mt-2 text-sm text-slate-700">{detail.description}</p>
          )}
        </div>
        <Badge tone="brand">
          Phiên bản {detail.versionNo}
          {detail.approvedVersionNo ? ` · bản ${detail.approvedVersionNo} đang public` : ''}
        </Badge>
      </div>

      <dl className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
        <div className="rounded-xl bg-slate-50 p-3">
          <dt className="text-xs text-slate-600">
            {detail.approvedVersionNo
              ? `Câu thay đổi so với bản ${detail.approvedVersionNo}`
              : 'Số câu'}
          </dt>
          <dd className="mt-0.5 text-xl font-bold">
            {detail.approvedVersionNo ? detail.changes.length : detail.questionCount}
          </dd>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <dt className="text-xs text-slate-600">Có media</dt>
          <dd className="mt-0.5 text-xl font-bold">{detail.mediaCount}</dd>
        </div>
      </dl>

      <div className="flex flex-col gap-2.5">
        <h3 className="text-[15px] font-bold">
          {detail.approvedVersionNo ? 'Câu hỏi thay đổi' : 'Câu hỏi trong bộ'}
        </h3>
        {detail.approvedVersionNo && detail.changes.length === 0 && (
          <p className="text-sm text-slate-600">
            Nội dung câu hỏi không đổi (chỉ đổi thông tin bộ hoặc thứ tự).
          </p>
        )}
        {(detail.approvedVersionNo
          ? detail.changes
          : detail.items.map((i) => ({ kind: 'added' as const, question: i.question }))
        )
          .slice(0, showAll ? undefined : 10)
          .map((change, index) => (
            <QuestionSummary
              key={index}
              question={change.question}
              badge={
                detail.approvedVersionNo ? (
                  <Badge tone={CHANGE_BADGES[change.kind].tone}>
                    {CHANGE_BADGES[change.kind].label}
                  </Badge>
                ) : undefined
              }
            />
          ))}
        {(detail.approvedVersionNo ? detail.changes.length : detail.items.length) > 10 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="self-start text-sm font-semibold text-brand-600"
          >
            {showAll ? 'Thu gọn' : 'Xem tất cả'}
          </button>
        )}
      </div>

      <form
        noValidate
        onSubmit={(e) => e.preventDefault()}
        className="flex flex-col gap-2.5 border-t border-slate-100 pt-4"
      >
        <label htmlFor="mod-reason" className="text-sm font-semibold">
          Lý do (bắt buộc khi từ chối)
        </label>
        <textarea
          id="mod-reason"
          rows={2}
          maxLength={500}
          placeholder="Ví dụ: Câu 7 có đáp án sai."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="resize-y rounded-lg border border-slate-300 px-3.5 py-2.5 text-[15px]"
        />
        {error && (
          <p role="alert" className="text-[13px] text-orange-800">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2.5">
          <Button
            variant="secondary-warning"
            disabled={review.isPending}
            onClick={() => act('reject')}
          >
            Từ chối
          </Button>
          <Button loading={review.isPending} onClick={() => act('approve')}>
            <CheckIcon />
            Duyệt và công khai
          </Button>
        </div>
      </form>
    </section>
  );
}

/** Duyệt bộ câu hỏi public (màn Moderation, BR-QB-10). */
export function ModerationPage() {
  const queue = useReviewQueue();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const items = queue.data ?? [];
  const current = items.find((i) => i.versionId === selectedId) ?? items[0];
  const detail = useReviewDetail(current?.versionId);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[28px] font-bold leading-tight">Duyệt bộ câu hỏi public</h1>
      {notice && <Alert tone="success">{notice}</Alert>}
      {queue.isPending && <Spinner />}
      {queue.isError && <Alert tone="error">{errorMessage(queue.error)}</Alert>}
      {queue.isSuccess && items.length === 0 && (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
          Không có bộ câu hỏi nào đang chờ duyệt.
        </p>
      )}
      {items.length > 0 && (
        <div className="flex flex-wrap items-start gap-5">
          <section
            aria-labelledby="queue-heading"
            className="flex min-w-0 flex-[1_1_320px] flex-col gap-2.5"
          >
            <h2 id="queue-heading" className="text-[15px] font-bold text-slate-700">
              Chờ duyệt ({items.length})
            </h2>
            {items.map((item) => {
              const active = item.versionId === current?.versionId;
              return (
                <button
                  key={item.versionId}
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => {
                    setSelectedId(item.versionId);
                    setNotice(null);
                  }}
                  className={`flex flex-col gap-1 rounded-2xl bg-white p-3.5 text-left ${
                    active
                      ? 'border-2 border-brand-600'
                      : 'border border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <span className="flex justify-between gap-2">
                    <span className="text-[15px] font-bold">{item.name}</span>
                    <Badge tone={item.kind === 'update' ? 'brand' : 'green'}>
                      {item.kind === 'update' ? 'Cập nhật' : 'Mới'}
                    </Badge>
                  </span>
                  <span className="text-[13px] text-slate-600">
                    {item.ownerName} · {item.questionCount} câu · {formatDate(item.submittedAt)}
                  </span>
                </button>
              );
            })}
          </section>
          {detail.isPending && <Spinner />}
          {detail.isError && <Alert tone="error">{errorMessage(detail.error)}</Alert>}
          {detail.data && (
            <ReviewPanel
              key={detail.data.versionId}
              detail={detail.data}
              onReviewed={(message) => {
                setNotice(message);
                setSelectedId(null);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
