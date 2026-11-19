import {
  HISTORY_PERIODS,
  type HistoryScope,
  MATCH_OUTCOME_LABELS,
  type MatchOutcome,
  matchOutcomeSchema,
  SystemPermission,
} from '@olympia/shared';
import { useDeferredValue, useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Badge, Spinner } from '../../components/Card';
import { SelectField, TextField } from '../../components/TextField';
import { userHasPermission, useAuth } from '../../features/auth/use-auth';
import { useMatchHistory, useMyStats } from '../../features/results/results-api';
import {
  formatDateTime,
  formatDuration,
  formatPercent,
  OUTCOME_TONES,
} from '../../features/results/results-format';
import { errorMessage } from '../../lib/api-client';

const PAGE_SIZE = 20;

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[14px] border border-slate-200 bg-white p-4">
      <span className="text-[13px] text-slate-600">{label}</span>
      <p className="mt-1 text-[26px] font-extrabold tabular-nums">{value}</p>
    </div>
  );
}

function StatsCards({ scope }: { scope: HistoryScope }) {
  const stats = useMyStats();
  if (!stats.data) return null;
  const { host, player } = stats.data;
  if (scope === 'hosted' && host) {
    return (
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        <StatCard label="Trận đã tổ chức" value={host.matches} />
        <StatCard label="Người chơi tham gia" value={host.players} />
        <StatCard label="Tỷ lệ trả lời đúng" value={formatPercent(host.correct, host.answered)} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        <StatCard label="Trận đã thi" value={player.matches} />
        <StatCard label="Trận thắng" value={player.wins} />
        <StatCard
          label="Tỷ lệ trả lời đúng"
          value={formatPercent(player.correct, player.answered)}
        />
      </div>
      {player.bySubject.length > 0 && (
        <section
          aria-labelledby="subject-h"
          className="rounded-2xl border border-slate-200 bg-white p-4"
        >
          <h2 id="subject-h" className="text-[15px] font-bold">
            Tỷ lệ đúng theo môn, chủ đề
          </h2>
          <ul className="mt-2 flex list-none flex-col gap-2 p-0 text-sm">
            {player.bySubject.map((group, index) => (
              <li key={index} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="min-w-0 flex-1">
                  {group.subject ?? 'Chưa phân môn'}
                  {group.topic ? ` · ${group.topic}` : ''}
                </span>
                <span
                  aria-hidden="true"
                  className="h-2 w-28 overflow-hidden rounded-full bg-slate-100"
                >
                  <span
                    className="block h-full rounded-full bg-brand-600"
                    style={{ width: `${(group.correct / Math.max(1, group.total)) * 100}%` }}
                  />
                </span>
                <span className="w-24 text-right font-semibold tabular-nums">
                  {group.correct}/{group.total} · {formatPercent(group.correct, group.total)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Lịch sử trận `/lich-su` (mục 14, màn MatchHistory). */
export function MatchHistoryPage() {
  const { user } = useAuth();
  const canHost = userHasPermission(user, SystemPermission.CreateRooms);
  const [scope, setScope] = useState<HistoryScope>(canHost ? 'hosted' : 'played');
  const [search, setSearch] = useState('');
  const [days, setDays] = useState('30');
  const [status, setStatus] = useState<MatchOutcome | ''>('');
  const [page, setPage] = useState(1);
  const q = useDeferredValue(search.trim());

  const history = useMatchHistory({
    scope,
    q,
    ...(days ? { days: Number(days) } : {}),
    ...(status ? { status } : {}),
    page,
    pageSize: PAGE_SIZE,
  });
  const data = history.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[28px] font-bold">Lịch sử trận</h1>

      {canHost && (
        <div role="tablist" aria-label="Loại lịch sử" className="flex gap-2">
          {(
            [
              ['hosted', 'Trận đã tổ chức'],
              ['played', 'Trận đã tham gia'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={scope === value}
              onClick={() => {
                setScope(value);
                setPage(1);
              }}
              className={`h-11 rounded-lg px-4 text-sm font-semibold ${
                scope === value
                  ? 'bg-brand-600 text-white'
                  : 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <StatsCards scope={scope} />

      <div className="flex flex-wrap items-end gap-2.5">
        <TextField
          label="Tìm theo phòng hoặc người chơi"
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="min-w-0 flex-[1_1_260px]"
        />
        <SelectField
          label="Thời gian"
          value={days}
          onChange={(e) => {
            setDays(e.target.value);
            setPage(1);
          }}
        >
          {HISTORY_PERIODS.map((d) => (
            <option key={d} value={d}>
              {d === 365 ? '12 tháng qua' : `${d} ngày qua`}
            </option>
          ))}
          <option value="">Mọi thời gian</option>
        </SelectField>
        <SelectField
          label="Trạng thái"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as MatchOutcome | '');
            setPage(1);
          }}
        >
          <option value="">Tất cả</option>
          {matchOutcomeSchema.options.map((o) => (
            <option key={o} value={o}>
              {MATCH_OUTCOME_LABELS[o]}
            </option>
          ))}
        </SelectField>
      </div>

      {history.isError && <Alert tone="error">{errorMessage(history.error)}</Alert>}
      {history.isPending ? (
        <Spinner label="Đang tải lịch sử trận…" />
      ) : data && data.items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
          {scope === 'hosted'
            ? 'Chưa có trận nào đã tổ chức trong khoảng thời gian này.'
            : 'Bạn chưa tham gia trận nào trong khoảng thời gian này.'}
        </div>
      ) : (
        data && (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-slate-600">
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Thời gian
                  </th>
                  <th scope="col" className="px-2 py-3 font-semibold">
                    Phòng
                  </th>
                  <th scope="col" className="px-2 py-3 font-semibold">
                    Người chơi
                  </th>
                  <th scope="col" className="px-2 py-3 font-semibold">
                    Thắng
                  </th>
                  <th scope="col" className="px-2 py-3 font-semibold">
                    Thời lượng
                  </th>
                  <th scope="col" className="px-2 py-3 font-semibold">
                    Trạng thái
                  </th>
                  <th scope="col" className="py-3 pr-4 pl-2">
                    <span className="sr-only">Thao tác</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((m) => (
                  <tr key={m.matchId} className="border-t border-slate-100">
                    <td className="px-4 py-3.5 whitespace-nowrap">{formatDateTime(m.endedAt)}</td>
                    <td className="px-2 py-3.5 font-semibold">{m.roomName}</td>
                    <td className="px-2 py-3.5 text-slate-700">
                      {m.players.map((p) => p.displayName).join(', ')}
                    </td>
                    <td className="px-2 py-3.5">
                      {m.winners.length === 0
                        ? '—'
                        : m.winners.map((w) => `${w.displayName} · ${w.score ?? 0}`).join(', ')}
                    </td>
                    <td className="px-2 py-3.5 whitespace-nowrap">
                      {formatDuration(m.durationSeconds)}
                    </td>
                    <td className="px-2 py-3.5">
                      <Badge tone={OUTCOME_TONES[m.outcome]}>
                        {MATCH_OUTCOME_LABELS[m.outcome]}
                      </Badge>
                    </td>
                    <td className="py-3.5 pr-4 pl-2">
                      <Link to={`/tran/${m.matchId}`} className="font-semibold whitespace-nowrap">
                        Xem kết quả
                      </Link>
                    </td>
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
