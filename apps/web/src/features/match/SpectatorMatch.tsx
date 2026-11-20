import type { MatchView, RoomState } from '@olympia/shared';
import { AvStatusNote, AvTile, SpeakerToggle } from '../av/av-ui';
import { initials, SEAT_BG } from '../rooms/room-format';
import { ReactionBar } from '../rooms/room-stage';
import {
  ANSWER_TYPE_LABELS,
  correctText,
  formatElapsed,
  partLabel,
  playerName,
  pointsLabel,
  roundTitle,
  seatStatus,
  seconds,
  useRemainingMs,
} from './match-format';
import { OptionGrid, PauseBanner, QuestionMedia, Scoreboard } from './match-ui';
import { ObstacleBoard, ObstacleImage } from './obstacle-ui';

/** Thẻ người chơi kèm trạng thái trong vòng (ObstacleSpectator). */
function PlayerCards({ view }: { view: MatchView }) {
  return (
    <section
      aria-label="Người chơi"
      className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3"
    >
      {view.players.map((p) => {
        const status = seatStatus(view, p.seat);
        const out = status?.text === 'Bị loại khỏi vòng' || p.eliminated;
        return (
          <div
            key={p.seat}
            className={`flex items-center gap-3 rounded-[14px] border-2 bg-stage-800 p-2.5 ${
              status?.active ? 'border-accent-400' : 'border-stage-700'
            } ${out ? 'opacity-50' : ''}`}
          >
            <span
              aria-hidden="true"
              className={`flex size-12 shrink-0 items-center justify-center rounded-[10px] font-extrabold text-stage-900 ${SEAT_BG[p.seat] ?? ''}`}
            >
              {initials(p.displayName)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-[15px] font-bold">
                {p.seat}. {p.displayName}
              </span>
              <span className="text-xs font-semibold text-stage-200">
                {p.eliminated ? 'Bị loại khỏi trận' : (status?.text ?? 'Chờ lượt')}
              </span>
            </span>
            <span className="text-[22px] font-extrabold tabular-nums text-accent-400">
              {p.score}
            </span>
          </div>
        );
      })}
    </section>
  );
}

/** Màn khán giả trong trận (SpectatorMobile, ObstacleSpectator): xem, bảng điểm, gửi cảm xúc. */
export function SpectatorMatch({
  view,
  room,
  clockOffset,
  onSendReaction,
}: {
  view: MatchView;
  room: RoomState;
  clockOffset: number;
  /** Bỏ trống khi Super Admin/Manager giám sát (BR-ROLE-04): không gửi được cảm xúc. */
  onSendReaction?: (emoji: string) => Promise<string | null>;
}) {
  const remaining = useRemainingMs(view.timer, clockOffset);
  const round = view.round;
  const question = round.question;
  const revealed = question && ['revealed', 'skipped', 'voided'].includes(question.phase);
  const active = view.players.find((p) => seatStatus(view, p.seat)?.active);
  const activeMember = active ? room.players.find((m) => m.seat === active.seat) : undefined;
  const countdown =
    view.timer && ['answer', 'buzz'].includes(view.timer.purpose) ? remaining : null;

  const header = (
    <header className="border-b border-[#1E3A75]">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="text-xs text-stage-200">
            {room.room.name} ·{' '}
            {onSendReaction ? 'Bạn đang xem với vai trò khán giả' : 'Bạn đang giám sát phòng'}
          </p>
          <p className="truncate text-[15px] font-bold lg:text-xl lg:font-extrabold">
            {roundTitle(view)}{' '}
            <span className="font-medium text-stage-200">– {partLabel(view)}</span>
          </p>
        </div>
        <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-stage-800 px-3 text-xs font-semibold">
          {room.spectators.count} người đang xem
        </span>
      </div>
    </header>
  );

  if (round.type === 'obstacle') {
    return (
      <>
        {header}
        <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-[18px] px-4 py-5 sm:px-6">
          <PauseBanner view={view} />
          <div className="flex flex-wrap items-stretch gap-5">
            <div className="flex min-w-0 flex-[999_1_620px] flex-col gap-4">
              <ObstacleBoard
                round={round}
                remainingSeconds={countdown !== null ? seconds(countdown) : null}
              />
              {question && round.phase === 'row' && (
                <p className="rounded-2xl bg-stage-800 p-4 text-[17px] font-bold leading-snug">
                  {question.content}
                </p>
              )}
            </div>
            <div className="min-w-0 flex-[1_1_340px]">
              <ObstacleImage round={round} />
            </div>
          </div>
          <PlayerCards view={view} />
          <section
            aria-label={onSendReaction ? 'Gửi cảm xúc' : 'Âm thanh'}
            className="self-center rounded-2xl bg-stage-800 p-3"
          >
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              {onSendReaction && (
                <ReactionBar enabled={room.room.reactionsEnabled} onSend={onSendReaction} />
              )}
              <SpeakerToggle />
            </div>
            <AvStatusNote />
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      {header}
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-3.5 px-4 py-4 sm:px-6 lg:flex-row lg:items-start lg:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-3.5">
          <PauseBanner view={view} />
          <section aria-label="Người đang trả lời" className="grid grid-cols-2 gap-2">
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-[#1E3A75] text-xs font-semibold">
              <AvTile target={{ role: 'host' }} fallback={null} />
              <span className="absolute bottom-1.5 left-1.5 rounded bg-stage-900/80 px-1.5 py-0.5">
                Host · {room.host.displayName}
              </span>
            </div>
            <div className="relative flex aspect-[4/3] flex-col justify-between overflow-hidden rounded-xl border-2 border-accent-400 bg-[#1E3A75] p-2 text-xs font-semibold">
              {active ? (
                <>
                  {activeMember && (
                    <AvTile target={{ participantId: activeMember.id }} fallback={null} />
                  )}
                  <span className="relative self-start rounded bg-accent-400 px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-stage-900">
                    {seatStatus(view, active.seat)?.text}
                  </span>
                  <span className="relative self-start rounded bg-stage-900/80 px-1.5 py-0.5">
                    {active.seat} · {playerName(view, active.seat)}
                  </span>
                </>
              ) : (
                <span className="text-stage-200">{partLabel(view)}</span>
              )}
            </div>
          </section>

          <section
            aria-labelledby="spectator-question"
            className="flex flex-col gap-3 rounded-2xl bg-stage-800 p-4"
          >
            {question ? (
              <>
                <div className="flex items-center justify-between gap-2 text-xs font-semibold text-stage-200">
                  <span>
                    {ANSWER_TYPE_LABELS[question.answerType]} · {pointsLabel(question)}
                  </span>
                  {countdown !== null && (
                    <span role="timer" className="text-lg font-extrabold tabular-nums text-white">
                      {`${seconds(countdown)}s`}
                    </span>
                  )}
                </div>
                <h1 id="spectator-question" className="text-lg font-bold leading-snug">
                  {question.content}
                </h1>
                <QuestionMedia question={question} />
                <OptionGrid question={question} />
                {revealed && question.answerType === 'short_answer' && correctText(question) && (
                  <p className="text-[15px]">
                    Đáp án: <b>{correctText(question)}</b>
                  </p>
                )}
                {revealed && round.type === 'acceleration' && (
                  <ul className="flex flex-col gap-1 text-sm">
                    {question.answers
                      .filter((a) => a.elapsedMs !== null)
                      .sort((a, b) => (a.elapsedMs ?? 0) - (b.elapsedMs ?? 0))
                      .map((a) => (
                        <li key={a.seat} className="flex justify-between gap-2">
                          <span>
                            {playerName(view, a.seat)} · {formatElapsed(a.elapsedMs ?? 0)}
                          </span>
                          <b
                            className={a.state === 'correct' ? 'text-green-300' : 'text-orange-300'}
                          >
                            {a.state === 'correct' ? `+${a.points ?? 0}` : '✕'}
                          </b>
                        </li>
                      ))}
                  </ul>
                )}
                {!revealed && (
                  <p className="text-[13px] text-stage-200">
                    Câu trả lời của người chơi hiện sau khi công bố.
                  </p>
                )}
              </>
            ) : (
              <h1 id="spectator-question" className="text-center font-bold">
                {view.roundFinished ? 'Vòng thi đã hết câu hỏi' : 'Chờ câu hỏi tiếp theo…'}
              </h1>
            )}
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-3.5 lg:w-80 lg:shrink-0">
          <Scoreboard players={view.players} />
          <section
            aria-label={onSendReaction ? 'Gửi cảm xúc' : 'Âm thanh'}
            className="rounded-2xl bg-stage-800 p-4"
          >
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              {onSendReaction && (
                <ReactionBar enabled={room.room.reactionsEnabled} onSend={onSendReaction} />
              )}
              <SpeakerToggle />
            </div>
            <AvStatusNote />
          </section>
        </aside>
      </main>
    </>
  );
}
