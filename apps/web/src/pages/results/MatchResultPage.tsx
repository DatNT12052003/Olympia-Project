import {
  describeCorrectAnswer,
  MATCH_OUTCOME_LABELS,
  type MatchResult,
  type ResultPlayer,
  voidMatchRequestSchema,
} from '@olympia/shared';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Badge, Spinner } from '../../components/Card';
import { ChevronLeftIcon } from '../../components/icons';
import { Modal } from '../../components/Modal';
import { useAuth } from '../../features/auth/use-auth';
import { SeatSquare } from '../../features/match/match-ui';
import { initials, SEAT_BG } from '../../features/rooms/room-format';
import {
  useMatchResult,
  useSetAnswersPublic,
  useVoidMatch,
} from '../../features/results/results-api';
import {
  formatAverage,
  formatDateTime,
  OUTCOME_TONES,
  resultHeadline,
  ROUND_SHORT_TITLES,
} from '../../features/results/results-format';
import { ApiError, errorMessage } from '../../lib/api-client';

/** Vương miện trên người vô địch (màn MatchResult). */
function Crown() {
  return (
    <svg width="40" height="32" viewBox="0 0 40 32" aria-hidden="true">
      <path d="M4 28L2 8l10 8 8-14 8 14 10-8-2 20z" fill="currentColor" />
    </svg>
  );
}

/** Bục vinh quang: hạng 2 – hạng 1 – hạng 3. */
function Podium({ players, voided }: { players: ResultPlayer[]; voided: boolean }) {
  const top = players.slice(0, 3);
  const order = [top[1], top[0], top[2]].filter((p): p is ResultPlayer => Boolean(p));
  return (
    <ol
      aria-label="Thứ hạng"
      className="m-0 flex list-none flex-wrap items-end justify-center gap-3 p-0 sm:gap-4"
    >
      {order.map((p) => {
        const champion = p.winner && !voided;
        return (
          <li
            key={p.seat}
            className={`flex flex-col items-center gap-2.5 ${champion ? 'w-44 sm:w-56' : 'w-36 sm:w-48'}`}
          >
            {champion && (
              <span className="text-accent-400">
                <Crown />
              </span>
            )}
            <span
              aria-hidden="true"
              className={`flex items-center justify-center rounded-full font-extrabold text-stage-900 ${SEAT_BG[p.seat] ?? 'bg-stage-700'} ${
                champion
                  ? 'size-[76px] border-4 border-accent-400 text-[26px]'
                  : 'size-16 text-[22px]'
              }`}
            >
              {initials(p.displayName)}
            </span>
            <span className={`text-center font-bold ${champion ? 'text-lg font-extrabold' : ''}`}>
              {p.displayName}
            </span>
            <div
              className={`flex w-full flex-col items-center justify-center gap-0.5 rounded-t-[14px] ${
                champion
                  ? 'h-[170px] border-2 border-b-0 border-accent-400 bg-stage-800'
                  : `${p.rank === 2 ? 'h-[120px]' : 'h-[90px]'} bg-stage-800`
              }`}
            >
              <span
                className={`text-sm ${champion ? 'font-bold text-amber-300' : 'text-stage-200'}`}
              >
                {champion
                  ? p.wonTiebreak
                    ? 'Vô địch · câu hỏi phụ'
                    : 'Vô địch'
                  : `Hạng ${p.rank}`}
              </span>
              <span
                className={`font-extrabold text-accent-400 tabular-nums ${champion ? 'text-[40px]' : 'text-[30px]'}`}
              >
                {p.score}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ScoreTable({ result }: { result: MatchResult }) {
  return (
    <section
      aria-labelledby="tbl-h"
      className="flex flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-5"
    >
      <h2 id="tbl-h" className="text-lg font-bold">
        Điểm và thống kê
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-600">
              <th scope="col" className="px-2 py-2.5 font-semibold">
                Hạng
              </th>
              <th scope="col" className="px-2 py-2.5 font-semibold">
                Người chơi
              </th>
              {result.rounds.map((round, index) => (
                <th key={index} scope="col" className="px-2 py-2.5 text-right font-semibold">
                  {ROUND_SHORT_TITLES[round.type]}
                </th>
              ))}
              <th scope="col" className="px-2 py-2.5 text-right font-bold text-slate-900">
                Tổng
              </th>
              <th scope="col" className="py-2.5 pr-2 pl-6 font-semibold">
                Đúng / Sai / Bỏ qua
              </th>
              <th scope="col" className="px-2 py-2.5 text-right font-semibold">
                TG trả lời TB
              </th>
              <th scope="col" className="px-2 py-2.5 text-right font-semibold">
                Giành quyền
              </th>
            </tr>
          </thead>
          <tbody>
            {result.players.map((p) => (
              <tr key={p.seat} className="border-b border-slate-100">
                <td className="px-2 py-3 font-bold">{p.rank}</td>
                <td className="px-2 py-3">
                  <span className="inline-flex items-center gap-2 font-semibold">
                    <SeatSquare seat={p.seat} className="size-[22px] text-xs" />
                    {p.displayName}
                    {p.eliminated && <Badge tone="slate">Bị loại</Badge>}
                  </span>
                </td>
                {result.rounds.map((_, index) => (
                  <td key={index} className="px-2 py-3 text-right tabular-nums">
                    {p.roundScores[index] ?? 0}
                  </td>
                ))}
                <td className="px-2 py-3 text-right font-extrabold tabular-nums">{p.score}</td>
                <td className="py-3 pr-2 pl-6 tabular-nums">
                  {p.stats.correct} / {p.stats.wrong} / {p.stats.skipped}
                </td>
                <td className="px-2 py-3 text-right tabular-nums">
                  {formatAverage(p.stats.avgAnswerMs)}
                </td>
                <td className="px-2 py-3 text-right tabular-nums">{p.stats.buzzWins}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[13px] text-slate-600">
        Thời gian trả lời trung bình tính trên các câu trả lời bằng thiết bị; câu không trả lời được
        tính là bỏ qua.
      </p>
    </section>
  );
}

const RESULT_TEXT = {
  correct: { label: 'Đúng', className: 'text-green-700' },
  wrong: { label: 'Sai', className: 'text-orange-700' },
  skipped: { label: 'Bỏ qua', className: 'text-slate-500' },
} as const;

function AnswerList({ result }: { result: MatchResult }) {
  const questions = result.questions ?? [];
  if (questions.length === 0) {
    return <p className="text-sm text-slate-600">Trận đấu chưa dùng câu hỏi nào.</p>;
  }
  const names = new Map(result.players.map((p) => [p.seat, p.displayName]));
  return (
    <ol className="m-0 flex list-none flex-col gap-3 p-0">
      {questions.map((q, index) => (
        <li key={q.ref} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-semibold text-slate-500">
            Câu {index + 1} ·{' '}
            {result.rounds[q.roundIndex]
              ? ROUND_SHORT_TITLES[result.rounds[q.roundIndex]!.type]
              : ''}
          </p>
          <p className="font-semibold whitespace-pre-line">{q.content}</p>
          {q.media?.kind === 'image' && (
            <img
              src={q.media.url}
              alt="Hình ảnh của câu hỏi"
              className="max-h-48 self-start rounded-lg"
            />
          )}
          <p className="text-sm">
            <span className="text-slate-600">Đáp án: </span>
            <b className="text-green-800">{describeCorrectAnswer(q.answer)}</b>
          </p>
          {q.explanation && (
            <p className="rounded-lg bg-slate-50 p-3 text-sm whitespace-pre-line text-slate-700">
              {q.explanation}
            </p>
          )}
          {q.outcomes.length > 0 && (
            <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[13px]">
              {q.outcomes.map((o) => (
                <li key={o.seat} className="inline-flex items-center gap-1.5">
                  <SeatSquare seat={o.seat} className="size-5 text-[11px]" />
                  {names.get(o.seat)}:{' '}
                  <b className={RESULT_TEXT[o.result].className}>{RESULT_TEXT[o.result].label}</b>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}

function VoidDialog({ matchId, onClose }: { matchId: string; onClose: () => void }) {
  const voidMatch = useVoidMatch(matchId);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      title="Hủy kết quả trận?"
      description="Kết quả bị hủy không tính vào thống kê và không thể khôi phục (BR-HIST-01)."
      onClose={onClose}
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = voidMatchRequestSchema.safeParse({ reason });
          if (!parsed.success) {
            setError(parsed.error.issues[0]?.message ?? 'Cần nhập lý do.');
            return;
          }
          voidMatch.mutate(parsed.data.reason, {
            onSuccess: onClose,
            onError: (err) => setError(errorMessage(err)),
          });
        }}
        className="flex flex-col gap-3"
      >
        <label htmlFor="void-reason" className="text-sm font-semibold text-slate-900">
          Lý do hủy
        </label>
        <textarea
          id="void-reason"
          rows={3}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-invalid={error ? true : undefined}
          className="rounded-lg border border-slate-300 px-3.5 py-2.5 text-[15px] text-slate-900"
        />
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Để sau
          </Button>
          <Button type="submit" variant="danger" loading={voidMatch.isPending}>
            Hủy kết quả
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ResultView({
  result,
  backTo,
}: {
  result: MatchResult;
  backTo: { to: string; label: string };
}) {
  const [showAnswers, setShowAnswers] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const setPublic = useSetAnswersPublic(result.matchId);
  const viewer = result.viewer;
  const hard = result.hardQuestions;

  return (
    <div className="min-h-dvh bg-canvas text-slate-900">
      <section aria-labelledby="res-h" className="bg-stage-900 text-white">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 pt-6 sm:px-6 sm:pt-7">
          <Link
            to={backTo.to}
            className="inline-flex items-center gap-1 self-start text-sm text-stage-200 hover:text-white"
          >
            <ChevronLeftIcon size={16} />
            {backTo.label}
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div>
              <p className="text-[13px] text-stage-200">
                {result.roomName} · Kết thúc {formatDateTime(result.endedAt)} ·{' '}
                {result.rounds.length} vòng
              </p>
              <h1 id="res-h" className="mt-1 text-[26px] font-extrabold sm:text-[32px]">
                {resultHeadline(result)}
              </h1>
              {result.outcome !== 'completed' && (
                <p className="mt-2">
                  <Badge tone={OUTCOME_TONES[result.outcome]}>
                    {MATCH_OUTCOME_LABELS[result.outcome]}
                  </Badge>
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2.5">
              {result.questions && (
                <button
                  type="button"
                  aria-expanded={showAnswers}
                  aria-controls="answers"
                  onClick={() => setShowAnswers((v) => !v)}
                  className="h-11 rounded-lg border border-stage-700 px-4 text-sm font-semibold text-white hover:bg-white/5"
                >
                  {showAnswers ? 'Ẩn đáp án' : 'Xem đáp án và giải thích'}
                </button>
              )}
              {viewer.role === 'host' && (
                <Link
                  to={`/phong/${result.roomId}`}
                  className="inline-flex h-11 items-center rounded-lg bg-accent-400 px-[18px] text-sm font-extrabold text-stage-900 no-underline hover:bg-accent-500 hover:no-underline"
                >
                  Tổ chức trận mới
                </Link>
              )}
            </div>
          </div>
          <Podium players={result.players} voided={result.outcome === 'voided'} />
        </div>
      </section>

      <main className="mx-auto box-border flex max-w-[1200px] flex-col gap-5 px-4 pt-7 pb-12 sm:px-6">
        {result.voided && (
          <Alert tone="warning" title="Kết quả đã bị Super Admin hủy">
            Lý do: {result.voided.reason} · {formatDateTime(result.voided.at)}
          </Alert>
        )}

        {(viewer.canToggleAnswers || viewer.canVoid) && (
          <section
            aria-label="Quản lý kết quả"
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4"
          >
            {viewer.canToggleAnswers ? (
              <label className="flex min-h-11 items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={result.answersPublic}
                  disabled={setPublic.isPending}
                  onChange={(e) => setPublic.mutate(e.target.checked)}
                  className="size-5 accent-brand-600"
                />
                Cho Player và khán giả xem đáp án, giải thích
              </label>
            ) : (
              <span />
            )}
            {viewer.canVoid && (
              <Button variant="secondary-warning" size="sm" onClick={() => setVoiding(true)}>
                Hủy kết quả trận
              </Button>
            )}
            {setPublic.isError && <Alert tone="error">{errorMessage(setPublic.error)}</Alert>}
          </section>
        )}

        <ScoreTable result={result} />

        {hard.length > 0 && (
          <section
            aria-labelledby="hard-h"
            className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5"
          >
            <h2 id="hard-h" className="text-lg font-bold">
              Câu hỏi nhiều người sai
            </h2>
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-sm">
              {hard.map((q) => (
                <li key={q.ref} className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                  <span>{q.content}</span>
                  <span className="font-semibold text-orange-800">
                    {q.wrong}/{q.total} người sai
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {showAnswers && result.questions && (
          <section
            id="answers"
            aria-labelledby="ans-h"
            className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5"
          >
            <h2 id="ans-h" className="text-lg font-bold">
              Đáp án và giải thích
            </h2>
            <AnswerList result={result} />
          </section>
        )}
        {!result.questions && (
          <p className="text-sm text-slate-600">Host chưa công bố đáp án của trận này.</p>
        )}
      </main>
      {voiding && <VoidDialog matchId={result.matchId} onClose={() => setVoiding(false)} />}
    </div>
  );
}

/** Tổng kết trận `/tran/:matchId` (mục 9.4, màn MatchResult). `?phong=` cho khách xem. */
export function MatchResultPage() {
  const { matchId = '' } = useParams();
  const [params] = useSearchParams();
  const roomId = params.get('phong');
  const { status } = useAuth();
  const result = useMatchResult(matchId, roomId);
  const backTo =
    status === 'authenticated'
      ? { to: '/lich-su', label: 'Lịch sử trận' }
      : { to: roomId ? `/phong/${roomId}` : '/', label: roomId ? 'Về phòng thi' : 'Trang chủ' };

  if (result.isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas">
        <Spinner label="Đang tải kết quả trận…" />
      </div>
    );
  }
  if (result.isError) {
    const notFound = result.error instanceof ApiError && result.error.status === 404;
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas px-4 text-center text-slate-900">
        <h1 className="text-2xl font-bold">
          {notFound ? 'Không tìm thấy kết quả trận' : 'Không tải được kết quả'}
        </h1>
        <p className="max-w-md text-slate-600">
          {notFound
            ? 'Trận chưa kết thúc hoặc bạn không tham gia trận này.'
            : errorMessage(result.error)}
        </p>
        <Link to={backTo.to}>{backTo.label}</Link>
      </div>
    );
  }
  return <ResultView result={result.data} backTo={backTo} />;
}
