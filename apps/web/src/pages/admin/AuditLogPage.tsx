import { AUDIT_ACTION_LABELS, type AuditLogEntry } from '@olympia/shared';
import { useState } from 'react';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Card';
import { SelectField } from '../../components/TextField';
import { useAuditLogs } from '../../features/admin/admin-api';
import { formatDateTime } from '../../features/results/results-format';
import { errorMessage } from '../../lib/api-client';

const PAGE_SIZE = 50;

const CATEGORIES = [
  ['', 'Tất cả'],
  ['user', 'Tài khoản'],
  ['organization', 'Tổ chức'],
  ['question_set', 'Bộ câu hỏi public'],
  ['match', 'Kết quả trận'],
  ['room', 'Phòng thi'],
  ['report', 'Báo cáo vi phạm'],
  ['system', 'Cấu hình hệ thống'],
] as const;

/** Tóm tắt chi tiết (lý do, thay đổi) để hiển thị một dòng. */
function summarize(entry: AuditLogEntry): string {
  const d = entry.details;
  const parts: string[] = [];
  for (const key of ['name', 'roomName', 'target', 'hostName']) {
    const value = d[key];
    if (typeof value === 'string') parts.push(value);
  }
  for (const key of ['reason', 'note']) {
    const value = d[key];
    if (typeof value === 'string' && value) parts.push(`Lý do: ${value}`);
  }
  if (entry.action === 'user.update' || entry.action === 'system.settings_update') {
    parts.push(`Thay đổi: ${Object.keys(d).join(', ')}`);
  }
  return parts.join(' · ');
}

/** Nhật ký hoạt động quản trị `/quan-tri/nhat-ky` (mục 15.1, giữ 12 tháng theo BR-DATA-05). */
export function AuditLogPage() {
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const logs = useAuditLogs({ category, page, pageSize: PAGE_SIZE });
  const data = logs.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[28px] font-bold">Nhật ký quản trị</h1>
        <p className="mt-1 text-sm text-slate-600">
          Nhật ký được lưu 12 tháng rồi tự động xóa (chính sách dữ liệu DL-008).
        </p>
      </div>
      <SelectField
        label="Nhóm hành động"
        value={category}
        onChange={(e) => {
          setCategory(e.target.value);
          setPage(1);
        }}
        className="max-w-xs"
      >
        {CATEGORIES.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </SelectField>
      {logs.isError && <Alert tone="error">{errorMessage(logs.error)}</Alert>}
      {logs.isPending ? (
        <Spinner />
      ) : data && data.items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
          Chưa có hoạt động nào.
        </p>
      ) : (
        data && (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-slate-600">
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Thời gian
                  </th>
                  <th scope="col" className="px-2 py-3 font-semibold">
                    Người thực hiện
                  </th>
                  <th scope="col" className="px-2 py-3 font-semibold">
                    Hành động
                  </th>
                  <th scope="col" className="px-2 py-3 pr-4 font-semibold">
                    Chi tiết
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((entry) => (
                  <tr key={entry.id} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatDateTime(entry.createdAt)}
                    </td>
                    <td className="px-2 py-3">{entry.actorName ?? 'Hệ thống'}</td>
                    <td className="px-2 py-3 font-semibold">
                      {AUDIT_ACTION_LABELS[entry.action] ?? entry.action}
                    </td>
                    <td className="px-2 py-3 pr-4 text-slate-700">{summarize(entry)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
      {data && data.total > PAGE_SIZE && (
        <nav aria-label="Phân trang" className="flex items-center justify-end gap-2 text-sm">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Trang trước
          </Button>
          <span className="tabular-nums">
            {page}/{pages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Trang sau
          </Button>
        </nav>
      )}
    </div>
  );
}
