import type { MatchView, RoomState } from '@olympia/shared';
import { ReactionBar } from '../rooms/room-stage';
import {
  ANSWER_TYPE_LABELS,
  correctText,
  partLabel,
  playerName,
  pointsLabel,
  roundTitle,
  seconds,
  useRemainingMs,
} from './match-format';
import { OptionGrid, PauseBanner, QuestionMedia, Scoreboard } from './match-ui';

/** Màn khán giả trong trận (SpectatorMobile): xem câu hỏi, bảng điểm, gửi cảm xúc. */
export function SpectatorMatch({
  view,
  room,
  clockOffset,
  onSendReaction,
}: {
  view: MatchView;
  room: RoomState;
  clockOffset: number;
  onSendReaction: (emoji: string) => Promise<string | null>;
}) {
  const remaining = useRemainingMs(view.timer, clockOffset);
  const question = view.round.question;
  const revealed = question && ['revealed', 'skipped', 'voided'].includes(question.phase);
  const answering =
    question?.answeringSeat ?? (view.round.part === 'individual' ? view.round.turnSeat : null);

  return (
    <>
      <header className="border-b border-[#1E3A75]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-accent-400">{roundTitle(view)}</p>
            <p className="truncate text-[15px] font-bold">{room.room.name}</p>
          </div>
          <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-stage-800 px-3 text-xs font-semibold">
            Khán giả · {room.spectators.count}
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-3.5 px-4 py-4 sm:px-6 lg:flex-row lg:items-start lg:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-3.5">
          <PauseBanner view={view} />
          <section aria-label="Người đang trả lời" className="grid grid-cols-2 gap-2">
            <div className="flex h-24 items-end rounded-xl bg-[#1E3A75] p-2 text-xs font-semibold">
              Host · {room.host.displayName}
            </div>
            <div className="flex h-24 flex-col justify-between rounded-xl border-2 border-accent-400 bg-[#1E3A75] p-2 text-xs font-semibold">
              {answering !== null ? (
                <>
                  <span className="self-start rounded bg-accent-400 px-1.5 py-0.5 text-[10px] font-extrabold text-stage-900">
                    ĐANG TRẢ LỜI
                  </span>
                  {answering} · {playerName(view, answering)}
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
                  {view.timer && (
                    <span role="timer" className="text-lg font-extrabold tabular-nums text-white">
                      {remaining === null ? '--' : `${seconds(remaining)}s`}
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
          <section aria-label="Gửi cảm xúc" className="rounded-2xl bg-stage-800 p-4">
            <ReactionBar enabled={room.room.reactionsEnabled} onSend={onSendReaction} />
          </section>
        </aside>
      </main>
    </>
  );
}
