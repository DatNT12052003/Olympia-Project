import {
  REPORT_CATEGORY_LABELS,
  REPORT_RESOLUTION_LABELS,
  type ReportResolution,
  type ReportStatus,
  type ReportView,
} from '@olympia/shared';
import { useState } from 'react';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Badge, Spinner } from '../../components/Card';
import { useReports, useResolveReport } from '../../features/admin/admin-api';
import { formatDateTime } from '../../features/results/results-format';
import { errorMessage } from '../../lib/api-client';

const TARGET_LABELS = {
  question_set_version: 'Bộ câu hỏi public',
  room: 'Hành vi trong phòng',
} as const;

/** Mô tả cụ thể hậu quả của từng cách xử lý, theo đối tượng. */
function actionHint(report: ReportView, action: ReportResolution): string {
  switch (action) {
    case 'dismiss':
      return 'Đóng báo cáo, không thay đổi gì.';
    case 'remove_content':
      return report.targetType === 'room'
        ? 'Đóng phòng (kết thúc trận nếu đang thi).'
        : 'Gỡ bộ câu hỏi khỏi danh sách public.';
    case 'warn':
      return 'Gửi email cảnh báo và ghi vào hồ sơ người dùng.';
    case 'block_guest':
      return 'Cấm khách này vào lại phòng.';
    case 'lock_account':
      return 'Khóa tài khoản và đăng xuất mọi thiết bị.';
  }
}

function ReportDetail({ report, onDone }: { report: ReportView; onDone: (msg: string) => void }) {
  const resolve = useResolveReport();
  const [action, setAction] = useState<ReportResolution | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const subject = report.subject;

  return (
    <section
      aria-labelledby="rd-h"
      className="flex min-w-0 flex-[999_1_520px] flex-col gap-4.5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
    >
      <div>
        <Badge tone="amber">{TARGET_LABELS[report.targetType]}</Badge>
        <h2 id="rd-h" className="mt-2.5 text-[22px] font-bold">
          {REPORT_CATEGORY_LABELS[report.category]}
        </h2>
        <p className="mt-1.5 text-sm text-slate-600">
          Báo cáo bởi {report.reporterName ?? 'người dùng đã xóa'} ·{' '}
          {report.targetType === 'room' ? 'phòng' : 'bộ'} “{report.targetLabel}” ·{' '}
          {formatDateTime(report.createdAt)}
        </p>
      </div>
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <div className="rounded-xl bg-slate-50 p-3">
          <dt className="text-xs text-slate-600">Đối tượng</dt>
          <dd className="mt-0.5 font-semibold">
            {subject
              ? `${subject.kind === 'guest' ? 'Khách' : 'Tài khoản'} “${subject.name}”${
                  subject.accountStatus === 'locked' ? ' (đã khóa)' : ''
                }`
              : 'Không xác định'}
          </dd>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <dt className="text-xs text-slate-600">Báo cáo trước đó</dt>
          <dd className="mt-0.5 font-semibold">
            {subject && subject.priorReports > 0 ? `${subject.priorReports} báo cáo` : 'Không có'}
            {subject?.warningCount ? ` · đã cảnh báo ${subject.warningCount} lần` : ''}
          </dd>
        </div>
      </dl>
      <blockquote className="m-0 rounded-xl border border-slate-200 p-3.5 text-sm leading-relaxed whitespace-pre-line text-slate-700">
        “{report.description}”
      </blockquote>

      {report.status === 'resolved' ? (
        <Alert tone="success" title={`Đã xử lý: ${REPORT_RESOLUTION_LABELS[report.resolution!]}`}>
          {report.resolvedByName ?? 'Quản trị viên'}
          {report.resolvedAt ? ` · ${formatDateTime(report.resolvedAt)}` : ''}
          {report.resolutionNote ? ` · ${report.resolutionNote}` : ''}
        </Alert>
      ) : (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!action) {
              setError('Chọn cách xử lý.');
              return;
            }
            setError(null);
            resolve
              .mutateAsync({ reportId: report.id, action, note })
              .then(() => onDone(`Đã xử lý báo cáo: ${REPORT_RESOLUTION_LABELS[action]}.`))
              .catch((err: unknown) => setError(errorMessage(err)));
          }}
          className="flex flex-col gap-2.5 border-t border-slate-100 pt-4"
        >
          <fieldset className="m-0 flex flex-wrap gap-2.5 border-0 p-0">
            <legend className="mb-2 text-sm font-semibold">Cách xử lý</legend>
            {report.actions.map((a) => (
              <label
                key={a}
                title={actionHint(report, a)}
                className={`flex h-11 items-center gap-2 rounded-lg px-3.5 text-sm ${
                  action === a
                    ? 'border-2 border-brand-600 bg-brand-50 font-semibold'
                    : 'border border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="report-action"
                  value={a}
                  checked={action === a}
                  onChange={() => setAction(a)}
                  className="accent-brand-600"
                />
                {REPORT_RESOLUTION_LABELS[a]}
              </label>
            ))}
          </fieldset>
          {action && <p className="text-[13px] text-slate-600">{actionHint(report, action)}</p>}
          <label htmlFor="rp-note" className="text-sm font-semibold">
            Ghi chú xử lý
          </label>
          <textarea
            id="rp-note"
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ví dụ: Đã xác minh qua nhật ký phòng."
            className="resize-y rounded-lg border border-slate-300 px-3.5 py-2.5 text-[15px]"
          />
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex justify-end">
            <Button type="submit" loading={resolve.isPending}>
              Xác nhận xử lý
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

/** Báo cáo vi phạm `/quan-tri/bao-cao` (mục 15.3, màn Reports). */
export function ReportsPage() {
  const [status, setStatus] = useState<ReportStatus>('open');
  const reports = useReports(status);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const items = reports.data?.items ?? [];
  const selected = items.find((r) => r.id === selectedId) ?? items[0] ?? null;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[28px] font-bold">Báo cáo vi phạm</h1>
      {message && (
        <Alert tone="success" title={message}>
          Báo cáo đã chuyển sang mục đã xử lý.
        </Alert>
      )}
      <div className="flex flex-wrap items-start gap-5">
        <section aria-labelledby="rq-h" className="flex min-w-0 flex-[1_1_320px] flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 id="rq-h" className="text-[15px] font-bold text-slate-700">
              {status === 'open' ? `Chưa xử lý (${reports.data?.openCount ?? 0})` : 'Đã xử lý'}
            </h2>
            <button
              type="button"
              onClick={() => {
                setStatus(status === 'open' ? 'resolved' : 'open');
                setSelectedId(null);
              }}
              className="text-sm font-semibold text-brand-600"
            >
              {status === 'open' ? 'Xem đã xử lý' : 'Xem chưa xử lý'}
            </button>
          </div>
          {reports.isPending && <Spinner />}
          {reports.isError && <Alert tone="error">{errorMessage(reports.error)}</Alert>}
          {!reports.isPending && items.length === 0 && (
            <p className="rounded-[14px] border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
              {status === 'open' ? 'Không có báo cáo nào chờ xử lý.' : 'Chưa có báo cáo đã xử lý.'}
            </p>
          )}
          {items.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-current={selected?.id === r.id ? 'true' : undefined}
              onClick={() => {
                setSelectedId(r.id);
                setMessage(null);
              }}
              className={`flex flex-col gap-1 rounded-[14px] bg-white p-3.5 text-left ${
                selected?.id === r.id ? 'border-2 border-brand-600' : 'border border-slate-200'
              }`}
            >
              <span className="flex justify-between gap-2">
                <span className="text-[15px] font-bold">{REPORT_CATEGORY_LABELS[r.category]}</span>
                {r.status === 'open' ? (
                  <Badge tone="amber">Mới</Badge>
                ) : (
                  <Badge tone="slate">{REPORT_RESOLUTION_LABELS[r.resolution!]}</Badge>
                )}
              </span>
              <span className="text-[13px] text-slate-600">
                {TARGET_LABELS[r.targetType]} · {r.targetLabel} · {formatDateTime(r.createdAt)}
              </span>
            </button>
          ))}
        </section>
        {selected && (
          <ReportDetail
            key={selected.id}
            report={selected}
            onDone={(msg) => {
              setMessage(msg);
              setSelectedId(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
