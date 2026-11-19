import {
  type HostCommand,
  type MatchPlayerView,
  type MatchView,
  type RoomState,
} from '@olympia/shared';
import { type FormEvent, useState } from 'react';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { ChevronRightIcon, PauseIcon, PlayIcon } from '../../components/icons';
import { Modal } from '../../components/Modal';
import { SelectField, TextField } from '../../components/TextField';
import { CONTROL_MODE_LABELS, initials, SEAT_BG } from '../rooms/room-format';
import {
  ANSWER_TYPE_LABELS,
  answerText,
  correctText,
  PHASE_LABELS,
  partLabel,
  playerName,
  pointsLabel,
  roundTitle,
  useNow,
  useRemainingMs,
} from './match-format';
import { OptionGrid, PauseBanner, QuestionMedia, Scoreboard, TimerRing } from './match-ui';

const outlineButton =
  'inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-stage-700 bg-transparent px-4 text-sm font-semibold text-white hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50';
const primaryButton =
  'inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-accent-400 px-[22px] text-[15px] font-extrabold text-stage-900 hover:bg-accent-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500';

type Dialog =
  | { kind: 'end' }
  | { kind: 'void' }
  | { kind: 'adjust' }
  | { kind: 'eliminate'; player: MatchPlayerView }
  | null;

function formatElapsed(ms: number): string {
  return `${(ms / 1000).toFixed(2).replace('.', ',')} giây`;
}

function suggestionLabel(value: 'correct' | 'wrong' | null): string {
  if (value === 'correct') return 'hệ thống chấm: Đúng';
  if (value === 'wrong') return 'hệ thống chấm: Sai';
  return 'cần Host chấm';
}

function playerTag(view: MatchView, player: MatchPlayerView, now: number, grace: number) {
  if (player.eliminated) return { text: 'Bị loại', tone: 'bg-stage-900 text-stage-200' };
  if (player.connection !== 'online') {
    const since = player.disconnectedAt ? Date.parse(player.disconnectedAt) : now;
    const left = Math.max(0, grace - Math.floor((now - since) / 1000));
    const mm = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    return {
      text:
        player.connection === 'offline'
          ? 'Chưa kết nối'
          : left > 0
            ? `Mất kết nối · ${mm}`
            : 'Mất kết nối · hết giờ chờ',
      tone: 'bg-orange-100 text-orange-800',
    };
  }
  const question = view.round.question;
  if (
    question &&
    question.answeringSeat === player.seat &&
    ['answering', 'judging'].includes(question.phase)
  ) {
    return { text: 'Đang trả lời', tone: 'bg-accent-400 text-stage-900' };
  }
  if (view.round.part === 'individual' && view.round.turnSeat === player.seat) {
    return { text: 'Đến lượt', tone: 'bg-accent-400 text-stage-900' };
  }
  return { text: 'Chờ lượt', tone: 'bg-stage-900 text-stage-200' };
}

export function HostMatch({
  view,
  room,
  clockOffset,
  onCommand,
}: {
  view: MatchView;
  room: RoomState;
  clockOffset: number;
  onCommand: (command: HostCommand) => Promise<string | null>;
}) {
  const remaining = useRemainingMs(view.timer, clockOffset);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const now = useNow();
  const round = view.round;
  const question = round.question;
  const paused = view.status === 'paused';
  const finalPhase = !question || ['revealed', 'skipped', 'voided'].includes(question.phase);
  const answerer = question?.answeringSeat ?? null;
  const answerEntry = question?.answers.find((a) => a.seat === answerer);

  async function run(command: HostCommand): Promise<boolean> {
    setBusy(true);
    setError(null);
    const message = await onCommand(command);
    setBusy(false);
    if (message) setError(message);
    return message === null;
  }

  let primary: { label: string; command: HostCommand } | null = null;
  if (view.roundFinished) {
    primary =
      view.roundIndex + 1 < view.rounds.length
        ? { label: 'Vòng tiếp theo', command: { type: 'next_round' } }
        : null;
  } else if (finalPhase) {
    primary = { label: 'Câu tiếp theo', command: { type: 'next_question' } };
  } else if (question.phase === 'showing') {
    primary = {
      label: round.part === 'shared' ? 'Mở chuông' : 'Bắt đầu tính giờ',
      command: { type: 'start_timer' },
    };
  }

  return (
    <>
      <header className="border-b border-[#1E3A75]">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-0.5">
            <p className="text-[13px] text-stage-200">
              {room.room.name} · {CONTROL_MODE_LABELS[room.room.controlMode]}
            </p>
            <h1 className="text-xl font-extrabold">
              {roundTitle(view)}{' '}
              <span className="font-medium text-stage-200">– {partLabel(view)}</span>
            </h1>
          </div>
          <span className="inline-flex h-8 items-center gap-2 rounded-full bg-stage-800 px-3 text-[13px] font-semibold">
            <span
              aria-hidden="true"
              className={`size-2 rounded-full ${paused ? 'bg-amber-300' : 'bg-green-300'}`}
            />
            {paused ? 'Tạm dừng' : question ? PHASE_LABELS[question.phase] : 'Chờ câu hỏi'}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void run({ type: paused ? 'resume' : 'pause' })}
              className={outlineButton}
            >
              {paused ? <PlayIcon size={16} /> : <PauseIcon size={16} />}
              {paused ? 'Tiếp tục' : 'Tạm dừng'}
            </button>
            <button
              type="button"
              onClick={() => setDialog({ kind: 'end' })}
              className="h-11 rounded-lg bg-[#3B1D24] px-4 text-sm font-semibold text-red-300 hover:bg-[#4a2430]"
            >
              Kết thúc trận
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-wrap items-start gap-5 px-4 py-5 sm:px-6">
        <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-4">
          <PauseBanner view={view} />
          {error && <Alert tone="error">{error}</Alert>}

          <section
            aria-labelledby="host-question"
            className="flex flex-col gap-[18px] rounded-[18px] bg-stage-800 p-5 sm:p-6"
          >
            {question ? (
              <>
                <div className="flex flex-wrap items-start gap-6">
                  <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-2.5">
                    <span className="text-[13px] font-semibold text-stage-200">
                      Câu {round.questionNo} · {ANSWER_TYPE_LABELS[question.answerType]} ·{' '}
                      {pointsLabel(question)}
                    </span>
                    <h2
                      id="host-question"
                      className="text-[22px] font-bold leading-snug sm:text-[26px]"
                    >
                      {question.content}
                    </h2>
                  </div>
                  <TimerRing remainingMs={remaining} />
                </div>
                <QuestionMedia question={question} />
                {question.answerType === 'short_answer' ? (
                  <p className="rounded-xl border-2 border-green-500 bg-[#0F3B2A] px-4 py-3.5 text-base">
                    <span className="text-xs font-bold text-green-300">
                      Đáp án · chỉ Host thấy:{' '}
                    </span>
                    {correctText(question)}
                  </p>
                ) : (
                  <OptionGrid question={question} showCorrectLabel="Đáp án · chỉ Host thấy" />
                )}
                {question.explanation && (
                  <p className="text-sm text-stage-200">Giải thích: {question.explanation}</p>
                )}
              </>
            ) : (
              <p id="host-question" className="py-6 text-center text-stage-200">
                {view.roundFinished
                  ? 'Vòng thi đã hết câu hỏi. Bạn có thể kết thúc trận.'
                  : 'Bấm “Câu tiếp theo” để hiển thị câu hỏi đầu tiên.'}
              </p>
            )}
          </section>

          {question && question.phase === 'buzzing' && (
            <section className="rounded-[18px] bg-stage-800 px-5 py-4 text-[15px]">
              <p className="font-semibold text-green-300">
                Chuông đang mở – chờ người chơi giành quyền.
              </p>
              {round.buzz && round.buzz.attemptedSeats.length > 0 && (
                <p className="mt-1 text-sm text-stage-200">
                  Đã trả lời sai:{' '}
                  {round.buzz.attemptedSeats.map((s) => playerName(view, s)).join(', ')}
                </p>
              )}
            </section>
          )}

          {question &&
            answerer !== null &&
            (question.phase === 'answering' || question.phase === 'judging') && (
              <section
                aria-labelledby="judge-heading"
                className="flex flex-wrap items-center gap-4 rounded-[18px] bg-stage-800 px-5 py-[18px]"
              >
                <div className="min-w-0 flex-[1_1_280px]">
                  <h2 id="judge-heading" className="text-[13px] font-semibold text-stage-200">
                    Câu trả lời của {playerName(view, answerer)}
                  </h2>
                  <p className="mt-1 text-lg font-bold">
                    {round.answerMode === 'verbal'
                      ? 'Trả lời bằng lời'
                      : (answerText(question, answerer) ??
                        (question.phase === 'answering'
                          ? 'Đang chờ trả lời…'
                          : 'Không trả lời'))}{' '}
                    {answerEntry?.elapsedMs != null && (
                      <span className="text-sm font-medium text-stage-200">
                        · sau {formatElapsed(answerEntry.elapsedMs)} ·{' '}
                        {suggestionLabel(answerEntry.suggested)}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    disabled={busy || paused}
                    onClick={() => void run({ type: 'judge', seat: answerer, correct: true })}
                    className="inline-flex h-12 items-center gap-2 rounded-xl bg-green-700 px-5 text-[15px] font-bold text-white hover:bg-green-800 disabled:opacity-50"
                  >
                    ✓ Xác nhận Đúng
                  </button>
                  <button
                    type="button"
                    disabled={busy || paused}
                    onClick={() => void run({ type: 'judge', seat: answerer, correct: false })}
                    className="inline-flex h-12 items-center gap-2 rounded-xl bg-orange-700 px-5 text-[15px] font-bold text-white hover:bg-orange-800 disabled:opacity-50"
                  >
                    ✕ Sai
                  </button>
                </div>
              </section>
            )}

          <div className="flex flex-wrap justify-between gap-2.5">
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                disabled={busy || paused || finalPhase}
                onClick={() => void run({ type: 'skip_question' })}
                className={outlineButton}
              >
                Bỏ qua câu
              </button>
              <button
                type="button"
                disabled={busy || paused || !question}
                onClick={() => setDialog({ kind: 'void' })}
                className={outlineButton}
              >
                Hủy câu (câu lỗi)
              </button>
              <button
                type="button"
                onClick={() => setDialog({ kind: 'adjust' })}
                className={outlineButton}
              >
                Điều chỉnh điểm
              </button>
            </div>
            {primary ? (
              <button
                type="button"
                disabled={busy || paused}
                onClick={() => void run(primary.command)}
                className={primaryButton}
              >
                {primary.label}
                <ChevronRightIcon />
              </button>
            ) : (
              view.roundFinished && (
                <button
                  type="button"
                  onClick={() => setDialog({ kind: 'end' })}
                  className={primaryButton}
                >
                  Kết thúc trận
                </button>
              )
            )}
          </div>

          <section
            aria-label="Người chơi"
            className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3"
          >
            {view.players.map((p) => {
              const tag = playerTag(view, p, now, room.reconnectGraceSeconds);
              const active = tag.text === 'Đang trả lời' || tag.text === 'Đến lượt';
              return (
                <article
                  key={p.seat}
                  className={`overflow-hidden rounded-[14px] border-2 bg-stage-800 ${
                    active
                      ? 'border-accent-400'
                      : p.connection !== 'online'
                        ? 'border-orange-400'
                        : 'border-stage-700'
                  }`}
                >
                  <div
                    className={`relative flex h-[110px] items-center justify-center bg-[#1E3A75] ${
                      p.connection !== 'online' || p.eliminated ? 'opacity-45' : ''
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex size-12 items-center justify-center rounded-full font-extrabold text-stage-900 ${SEAT_BG[p.seat] ?? ''}`}
                    >
                      {initials(p.displayName)}
                    </span>
                    <span
                      className={`absolute left-2 top-2 rounded-md px-2 py-0.5 text-[11px] font-bold ${tag.tone}`}
                    >
                      {tag.text}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <span
                      className={`flex size-6 items-center justify-center rounded-md text-[13px] font-extrabold text-stage-900 ${SEAT_BG[p.seat] ?? ''}`}
                    >
                      {p.seat}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {p.displayName}
                    </span>
                    <span className="text-xl font-extrabold tabular-nums text-accent-400">
                      {p.score}
                    </span>
                  </div>
                  {p.connection !== 'online' && !p.eliminated && (
                    <div className="px-3 pb-3">
                      <button
                        type="button"
                        onClick={() => setDialog({ kind: 'eliminate', player: p })}
                        className="h-9 w-full rounded-lg border border-stage-700 text-[13px] font-semibold text-orange-200 hover:bg-white/5"
                      >
                        Loại khỏi trận
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        </div>

        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <Scoreboard players={view.players} />

          {round.history.length > 0 && (
            <section
              aria-labelledby="history-heading"
              className="flex flex-col gap-2.5 rounded-[18px] bg-stage-800 p-[18px]"
            >
              <h2 id="history-heading" className="text-base font-bold">
                Câu đã chấm
              </h2>
              <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto text-[13px]">
                {round.history.map((item) => (
                  <li key={`${item.ref}-${item.seat}`} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 text-stage-200">
                      <b className="text-white">{item.label}</b> · {playerName(view, item.seat)}:{' '}
                      {item.result === 'correct'
                        ? 'Đúng'
                        : item.result === 'wrong'
                          ? 'Sai'
                          : 'Bỏ qua'}
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run({
                          type: 'regrade',
                          questionRef: item.ref,
                          seat: item.seat,
                          correct: item.result !== 'correct',
                        })
                      }
                      className="h-8 shrink-0 rounded-md border border-stage-700 px-2 text-xs font-semibold hover:bg-white/5"
                    >
                      Chấm lại: {item.result === 'correct' ? 'Sai' : 'Đúng'}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section
            aria-labelledby="log-heading"
            className="flex flex-col gap-2.5 rounded-[18px] bg-stage-800 p-[18px]"
          >
            <h2 id="log-heading" className="text-base font-bold">
              Nhật ký
            </h2>
            <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto text-[13px] text-stage-200">
              {view.log.map((entry, index) => (
                <li key={`${entry.at}-${index}`}>
                  <b className="text-white">
                    {new Date(entry.at).toLocaleTimeString('vi-VN', { hour12: false })}
                  </b>{' '}
                  · {entry.text}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </main>

      {dialog?.kind === 'end' && (
        <Modal
          title="Kết thúc trận?"
          description="Kết quả được giữ theo điểm hiện tại; phòng quay về sảnh chờ để tổ chức trận tiếp theo."
          onClose={() => setDialog(null)}
        >
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" onClick={() => setDialog(null)}>
              Hủy
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() => void run({ type: 'end_match' }).then(() => setDialog(null))}
            >
              Kết thúc trận
            </Button>
          </div>
        </Modal>
      )}
      {dialog?.kind === 'void' && (
        <Modal
          title="Hủy câu hỏi lỗi?"
          description={`Câu hiện tại không tính điểm (điểm đã chấm được hoàn lại) và được thay bằng câu dự phòng${
            round.reserves > 0 ? ` (còn ${round.reserves} câu)` : ' – hiện không còn câu dự phòng'
          }.`}
          onClose={() => setDialog(null)}
        >
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" onClick={() => setDialog(null)}>
              Không hủy
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() => void run({ type: 'void_question' }).then(() => setDialog(null))}
            >
              Hủy câu
            </Button>
          </div>
        </Modal>
      )}
      {dialog?.kind === 'eliminate' && (
        <Modal
          title={`Loại ${dialog.player.displayName} khỏi trận?`}
          description="Người chơi giữ điểm hiện tại trong kết quả nhưng không thi tiếp (BR-RC-04)."
          onClose={() => setDialog(null)}
        >
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" onClick={() => setDialog(null)}>
              Tiếp tục chờ
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() =>
                void run({ type: 'eliminate_player', seat: dialog.player.seat }).then(() =>
                  setDialog(null),
                )
              }
            >
              Loại khỏi trận
            </Button>
          </div>
        </Modal>
      )}
      {dialog?.kind === 'adjust' && (
        <AdjustScoreDialog
          players={view.players}
          onClose={() => setDialog(null)}
          onSubmit={(seat, delta, reason) =>
            run({ type: 'adjust_score', seat, delta, reason }).then((ok) => {
              if (ok) setDialog(null);
              return ok;
            })
          }
        />
      )}
    </>
  );
}

function AdjustScoreDialog({
  players,
  onClose,
  onSubmit,
}: {
  players: MatchPlayerView[];
  onClose: () => void;
  onSubmit: (seat: number, delta: number, reason: string) => Promise<boolean>;
}) {
  const [seat, setSeat] = useState(String(players[0]?.seat ?? 1));
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ delta?: string; reason?: string }>({});
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = Number.parseInt(delta, 10);
    const next: typeof errors = {};
    if (!Number.isInteger(value) || value === 0) next.delta = 'Nhập số điểm khác 0 (âm để trừ).';
    if (reason.trim().length < 3) next.reason = 'Lý do tối thiểu 3 ký tự.';
    setErrors(next);
    if (next.delta || next.reason) return;
    setPending(true);
    await onSubmit(Number(seat), value, reason.trim());
    setPending(false);
  }

  return (
    <Modal
      title="Điều chỉnh điểm"
      description="Mọi điều chỉnh được ghi nhật ký kèm lý do."
      onClose={onClose}
    >
      <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <SelectField
          label="Người chơi"
          value={seat}
          onChange={(event) => setSeat(event.target.value)}
        >
          {players.map((p) => (
            <option key={p.seat} value={p.seat}>
              {p.seat} · {p.displayName} ({p.score} điểm)
            </option>
          ))}
        </SelectField>
        <TextField
          label="Số điểm (+ cộng, − trừ)"
          type="number"
          inputMode="numeric"
          value={delta}
          onChange={(event) => setDelta(event.target.value)}
          error={errors.delta}
        />
        <TextField
          label="Lý do"
          value={reason}
          maxLength={200}
          onChange={(event) => setReason(event.target.value)}
          error={errors.reason}
        />
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" loading={pending}>
            Lưu điều chỉnh
          </Button>
        </div>
      </form>
    </Modal>
  );
}
