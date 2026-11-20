import {
  type MatchPlayerView,
  type MatchQuestionView,
  type MatchView,
  OPTION_LETTERS,
} from '@olympia/shared';
import { Link } from 'react-router';
import { Modal } from '../../components/Modal';
import { SEAT_BG } from '../rooms/room-format';
import { seconds } from './match-format';

/** Đồng hồ tròn (màn HostControl, Player desktop). */
export function TimerRing({
  remainingMs,
  size = 'lg',
}: {
  remainingMs: number | null;
  size?: 'lg' | 'md';
}) {
  const value = seconds(remainingMs);
  const box = size === 'lg' ? 'size-[104px] border-[7px]' : 'size-20 border-[6px]';
  return (
    <div
      role="timer"
      aria-label={remainingMs === null ? 'Chưa tính giờ' : `Còn ${value} giây`}
      className={`flex shrink-0 flex-col items-center justify-center rounded-full ${box} ${
        remainingMs === null ? 'border-stage-700' : 'border-accent-400'
      }`}
    >
      <span
        className={`font-extrabold leading-none tabular-nums ${size === 'lg' ? 'text-[40px]' : 'text-[30px]'}`}
      >
        {remainingMs === null ? '--' : String(value).padStart(2, '0')}
      </span>
      <span className="text-[11px] text-stage-200">giây</span>
    </div>
  );
}

/** Thanh đếm ngược (màn Player mobile). */
export function TimerBar({
  remainingMs,
  durationMs,
}: {
  remainingMs: number | null;
  durationMs: number;
}) {
  const value = seconds(remainingMs);
  const ratio = remainingMs === null || durationMs <= 0 ? 0 : Math.min(1, remainingMs / durationMs);
  return (
    <div
      role="timer"
      aria-label={remainingMs === null ? 'Chưa tính giờ' : `Còn ${value} giây`}
      className="flex items-center gap-2.5"
    >
      <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-stage-800">
        <span
          className="block h-full bg-accent-400 transition-[width] duration-200"
          style={{ width: `${ratio * 100}%` }}
        />
      </span>
      <span className="w-10 text-right text-[22px] font-extrabold tabular-nums">
        {remainingMs === null ? '--' : `${value}s`}
      </span>
    </div>
  );
}

/** Ô màu ghế kèm số (không dùng màu làm tín hiệu duy nhất). */
export function SeatSquare({
  seat,
  className = 'size-6 text-[13px]',
}: {
  seat: number;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-md font-extrabold text-stage-900 ${SEAT_BG[seat] ?? 'bg-stage-700'} ${className}`}
    >
      {seat}
    </span>
  );
}

/** Ảnh/video của câu hỏi (URL tạm thời do server cấp). */
export function QuestionMedia({ question }: { question: MatchQuestionView }) {
  const media = question.media;
  if (!media) return null;
  if (media.kind === 'image') {
    return (
      <img
        src={media.url}
        alt="Hình ảnh của câu hỏi"
        className="max-h-72 w-full rounded-xl bg-stage-900 object-contain"
      />
    );
  }
  if (media.kind === 'video') {
    return (
      <video src={media.url} controls playsInline className="max-h-72 w-full rounded-xl bg-black">
        <track kind="captions" />
      </video>
    );
  }
  return <audio src={media.url} controls className="w-full" />;
}

/** Phương án trắc nghiệm chỉ để xem (Host, khán giả); tô đáp án đúng khi có. */
export function OptionGrid({
  question,
  showCorrectLabel,
}: {
  question: MatchQuestionView;
  showCorrectLabel?: string;
}) {
  const options =
    question.answerType === 'mcq'
      ? (question.options ?? [])
      : question.answerType === 'true_false'
        ? ['Đúng', 'Sai']
        : null;
  if (!options) return null;
  const correct = question.correctAnswer;
  const correctIndex =
    correct?.type === 'mcq'
      ? correct.correctIndex
      : correct?.type === 'true_false'
        ? correct.correct
          ? 0
          : 1
        : -1;
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {options.map((option, index) => {
        const isCorrect = index === correctIndex;
        return (
          <div
            key={option + String(index)}
            className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3.5 text-base ${
              isCorrect ? 'border-2 border-green-500 bg-[#0F3B2A]' : 'bg-stage-900'
            }`}
          >
            <span>
              {question.answerType === 'mcq' && (
                <b className="mr-2.5 text-accent-400">{OPTION_LETTERS[index]}</b>
              )}
              {option}
            </span>
            {isCorrect && showCorrectLabel && (
              <span className="text-xs font-bold text-green-300">✓ {showCorrectLabel}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Bảng điểm xếp hạng (9.2). */
export function Scoreboard({
  players,
  highlightSeat,
  title = 'Bảng điểm',
}: {
  players: MatchPlayerView[];
  highlightSeat?: number | null;
  title?: string;
}) {
  const ranked = [...players].sort((a, b) => b.score - a.score || a.seat - b.seat);
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-2.5 rounded-[18px] bg-stage-800 p-[18px]"
    >
      <h2 className="text-base font-bold">{title}</h2>
      <ol className="flex flex-col gap-2">
        {ranked.map((p, index) => (
          <li
            key={p.seat}
            className={`flex items-center gap-2.5 text-[15px] ${p.eliminated ? 'opacity-60' : ''}`}
          >
            <span className="w-[18px] text-stage-200">{index + 1}</span>
            <span
              aria-hidden="true"
              className={`size-2.5 rounded-[3px] ${SEAT_BG[p.seat] ?? ''}`}
            />
            <span className="min-w-0 flex-1 truncate">
              {p.displayName}
              {p.seat === highlightSeat && ' (bạn)'}
              {p.connection === 'disconnected' && (
                <span className="text-orange-300"> · mất kết nối</span>
              )}
              {p.eliminated && <span className="text-stage-200"> · bị loại</span>}
            </span>
            <b className="tabular-nums">{p.score}</b>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Thông báo trận tạm dừng. */
export function PauseBanner({ view }: { view: MatchView }) {
  if (!view.pause) return null;
  const text =
    view.pause.reason === 'host_disconnected'
      ? 'Host mất kết nối, trận tạm dừng. Trận tiếp tục khi Host quay lại.'
      : view.pause.reason === 'player_disconnected'
        ? 'Người chơi đến lượt mất kết nối, trận tạm dừng.'
        : 'Host đã tạm dừng trận.';
  return (
    <p
      role="status"
      className="rounded-xl border border-amber-300/60 bg-amber-400/15 px-4 py-3 text-sm font-semibold text-amber-200"
    >
      {text}
    </p>
  );
}

/** Kết quả khi trận kết thúc; tổng kết đầy đủ ở trang `/tran/:matchId` (9.4). */
export function MatchResultDialog({ view, onClose }: { view: MatchView; onClose: () => void }) {
  const ranked = [...view.players].sort((a, b) => b.score - a.score || a.seat - b.seat);
  const top = ranked[0]?.score ?? 0;
  const winners = ranked.filter((p) => p.score === top);
  return (
    <Modal
      title={view.endReason === 'abnormal' ? 'Trận kết thúc bất thường' : 'Trận đấu kết thúc'}
      description={
        view.endReason === 'abnormal'
          ? 'Host mất kết nối quá lâu; kết quả được giữ tại thời điểm dừng.'
          : winners.length > 1
            ? `Đồng hạng nhất: ${winners.map((w) => w.displayName).join(', ')}.`
            : `Người chiến thắng: ${winners[0]?.displayName ?? ''}.`
      }
      onClose={onClose}
    >
      <ol className="flex flex-col gap-2 text-slate-900">
        {ranked.map((p, index) => (
          <li
            key={p.seat}
            className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5"
          >
            <span className="w-5 font-bold text-slate-500">{index + 1}</span>
            <SeatSquare seat={p.seat} />
            <span className="min-w-0 flex-1 truncate font-semibold">{p.displayName}</span>
            <b className="tabular-nums">{p.score}</b>
          </li>
        ))}
      </ol>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Link
          to={`/tran/${view.matchId}?phong=${view.roomId}`}
          className="inline-flex h-11 items-center rounded-lg border border-slate-300 bg-white px-5 font-semibold text-slate-900 no-underline hover:bg-slate-50 hover:no-underline"
        >
          Xem tổng kết
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="h-11 rounded-lg bg-brand-600 px-5 font-semibold text-white hover:bg-brand-700"
        >
          Về sảnh chờ
        </button>
      </div>
    </Modal>
  );
}
