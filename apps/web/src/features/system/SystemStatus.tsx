import type { DependencyStatus } from '@olympia/shared';
import { ApiError } from '../../lib/api-client';
import { useSystemHealth } from './use-system-health';

const DEPENDENCY_LABELS: Record<string, string> = {
  database: 'Cơ sở dữ liệu',
  redis: 'Bộ nhớ đệm (Redis)',
};

function StatusDot({ status }: { status: DependencyStatus | 'unknown' }) {
  const color =
    status === 'up' ? 'bg-emerald-500' : status === 'down' ? 'bg-red-500' : 'bg-slate-400';
  return (
    <span aria-hidden="true" className={`inline-block size-2.5 shrink-0 rounded-full ${color}`} />
  );
}

export function SystemStatus() {
  const { data, error, isPending, isError, refetch, isFetching } = useSystemHealth();

  return (
    <section
      aria-labelledby="system-status-heading"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <h2 id="system-status-heading" className="text-base font-semibold text-slate-900">
        Trạng thái hệ thống
      </h2>

      <div role="status" aria-live="polite" className="mt-3">
        {isPending ? (
          <p className="flex items-center gap-2 text-sm text-slate-600">
            <StatusDot status="unknown" />
            Đang kiểm tra hệ thống…
          </p>
        ) : isError ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-sm text-red-700">
              <StatusDot status="down" />
              {error instanceof ApiError && error.status === 0
                ? 'Không kết nối được máy chủ.'
                : 'Không lấy được trạng thái hệ thống.'}
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isFetching ? 'Đang thử lại…' : 'Thử lại'}
            </button>
          </div>
        ) : (
          <>
            <p
              className={`flex items-center gap-2 text-sm font-medium ${
                data.status === 'ok' ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              <StatusDot status={data.status === 'ok' ? 'up' : 'down'} />
              {data.status === 'ok'
                ? 'Hệ thống hoạt động bình thường.'
                : 'Hệ thống đang gặp sự cố.'}
            </p>
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {Object.entries(data.checks).map(([name, status]) => (
                <li key={name} className="flex items-center justify-between gap-4 py-2">
                  <span className="text-slate-700">{DEPENDENCY_LABELS[name] ?? name}</span>
                  <span className="flex items-center gap-2 text-slate-600">
                    <StatusDot status={status} />
                    {status === 'up' ? 'Hoạt động' : 'Gián đoạn'}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
