import type { HostCommand, MatchPlayerView, MatchView, RoomState } from '@olympia/shared';
import { type FormEvent, useState } from 'react';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { ChevronRightIcon, PauseIcon, PlayIcon } from '../../components/icons';
import { Modal } from '../../components/Modal';
import { SelectField, TextField } from '../../components/TextField';
import { CONTROL_MODE_LABELS, initials, SEAT_BG } from '../rooms/room-format';
import {
  AccelerationPanel,
  FinishOrder,
  FinishPanel,
  type HostPanelProps,
  ObstaclePanel,
  outlineButton,
  primaryButton,
  TiebreakPanel,
  WarmupPanel,
} from './host-rounds';
import {
  PHASE_LABELS,
  partLabel,
  roundTitle,
  seatStatus,
  useNow,
  useRemainingMs,
} from './match-format';
import { PauseBanner, Scoreboard } from './match-ui';

type Dialog =
  | { kind: 'end' }
  | { kind: 'void' }
  | { kind: 'adjust' }
  | { kind: 'eliminate'; player: MatchPlayerView }
  | null;

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
  const status = seatStatus(view, player.seat);
  if (status) {
    return {
      text: status.text,
      tone: status.active ? 'bg-accent-400 text-stage-900' : 'bg-stage-900 text-stage-200',
    };
  }
  return { text: 'Chờ lượt', tone: 'bg-stage-900 text-stage-200' };
}

/** Trạng thái hiển thị ở đầu màn Host. */
function statusChip(view: MatchView): { text: string; tone: string } {
  if (view.status === 'paused') return { text: 'Tạm dừng', tone: 'bg-amber-300' };
  if (view.awaitingHost) return { text: 'Chờ Host xác nhận', tone: 'bg-accent-400' };
  if (view.roundFinished) return { text: 'Hết vòng', tone: 'bg-stage-200' };
  if (view.timer?.purpose === 'break') return { text: 'Nghỉ giữa vòng', tone: 'bg-stage-200' };
  if (view.timer?.purpose === 'choose') return { text: 'Đang chọn', tone: 'bg-green-300' };
  const question = view.round.question;
  return question
    ? { text: PHASE_LABELS[question.phase], tone: 'bg-green-300' }
    : { text: 'Chờ câu hỏi', tone: 'bg-green-300' };
}

const NEXT_STEP_LABELS = {
  round: 'Vòng tiếp theo',
  tiebreak: 'Thi câu hỏi phụ (hòa điểm)',
  finish: 'Tổng kết, kết thúc trận',
} as const;

function RoundPanel(props: HostPanelProps<unknown>) {
  const round = props.view.round;
  switch (round.type) {
    case 'warmup':
      return <WarmupPanel {...props} round={round} />;
    case 'obstacle':
      return <ObstaclePanel {...props} round={round} />;
    case 'acceleration':
      return <AccelerationPanel {...props} round={round} />;
    case 'finish':
      return <FinishPanel {...props} round={round} />;
    case 'tiebreak':
      return <TiebreakPanel {...props} round={round} />;
  }
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
  const paused = view.status === 'paused';
  const chip = statusChip(view);
  const breakTimer = view.timer?.purpose === 'break';

  async function run(command: HostCommand): Promise<boolean> {
    setBusy(true);
    setError(null);
    const message = await onCommand(command);
    setBusy(false);
    if (message) setError(message);
    return message === null;
  }

  return (
    <>
      <header className="border-b border-[#1E3A75]">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-0.5">
            <p className="text-[13px] text-stage-200">
              {room.room.name} · {CONTROL_MODE_LABELS[view.mode]}
            </p>
            <h1 className="text-xl font-extrabold">
              {roundTitle(view)}{' '}
              <span className="font-medium text-stage-200">– {partLabel(view)}</span>
            </h1>
          </div>
          <span className="inline-flex h-8 items-center gap-2 rounded-full bg-stage-800 px-3 text-[13px] font-semibold">
            <span aria-hidden="true" className={`size-2 rounded-full ${chip.tone}`} />
            {chip.text}
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
          {view.awaitingHost && !paused && (
            <p
              role="status"
              className="rounded-xl border border-accent-400 bg-[#3A2A0A] px-4 py-3 text-sm font-semibold text-amber-200"
            >
              Chế độ tự động đang chờ Host xác nhận kết quả (trả lời ngắn không khớp, đáp án chướng
              ngại vật hoặc trả lời bằng lời).
            </p>
          )}
          {error && <Alert tone="error">{error}</Alert>}

          <RoundPanel
            view={view}
            round={view.round}
            busy={busy}
            paused={paused}
            remaining={remaining}
            run={run}
            onVoid={() => setDialog({ kind: 'void' })}
          />

          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <button
              type="button"
              onClick={() => setDialog({ kind: 'adjust' })}
              className={outlineButton}
            >
              Điều chỉnh điểm
            </button>
            {view.roundFinished && (
              <div className="flex flex-wrap items-center gap-3">
                {breakTimer && remaining !== null && (
                  <span className="text-sm text-stage-200">
                    Tự động chuyển sau {Math.ceil(remaining / 1000)} giây
                  </span>
                )}
                <button
                  type="button"
                  disabled={busy || paused}
                  onClick={() => void run({ type: 'next_round' })}
                  className={primaryButton}
                >
                  {NEXT_STEP_LABELS[view.nextStep]}
                  <ChevronRightIcon />
                </button>
              </div>
            )}
          </div>

          <section
            aria-label="Người chơi"
            className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3"
          >
            {view.players.map((p) => {
              const tag = playerTag(view, p, now, room.reconnectGraceSeconds);
              const active = tag.tone.startsWith('bg-accent');
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
          {view.round.type === 'finish' && <FinishOrder view={view} round={view.round} />}
          <Scoreboard players={view.players} />
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
          description={
            view.roundFinished && view.nextStep === 'finish'
              ? 'Trận đã hết vòng thi; kết quả được tổng kết theo điểm hiện tại.'
              : 'Trận chưa hết vòng thi. Kết quả được giữ theo điểm hiện tại; phòng quay về sảnh chờ.'
          }
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
          description={
            view.round.type === 'obstacle'
              ? 'Hàng hiện tại không tính điểm (điểm đã chấm được hoàn lại) và mảnh ảnh tương ứng được mở.'
              : `Câu hiện tại không tính điểm (điểm đã chấm được hoàn lại) và được thay bằng câu dự phòng${
                  'reserves' in view.round
                    ? view.round.reserves > 0
                      ? ` (còn ${view.round.reserves} câu)`
                      : ' – hiện không còn câu dự phòng'
                    : ' nếu còn'
                }.`
          }
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
