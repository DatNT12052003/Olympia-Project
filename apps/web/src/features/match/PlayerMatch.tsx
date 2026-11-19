import {
  type Ack,
  describeAnswer,
  type MatchQuestionView,
  type MatchView,
  OPTION_LETTERS,
  type PlayerAnswer,
  type RoomState,
} from '@olympia/shared';
import { type FormEvent, useEffect, useState } from 'react';
import { BellIcon } from '../../components/icons';
import { initials, SEAT_BG, SEAT_BORDER } from '../rooms/room-format';
import {
  ANSWER_TYPE_LABELS,
  correctText,
  partLabel,
  playerName,
  pointsLabel,
  roundTitle,
  useRemainingMs,
} from './match-format';
import {
  OptionGrid,
  PauseBanner,
  QuestionMedia,
  SeatSquare,
  TimerBar,
  TimerRing,
} from './match-ui';

interface PlayerActions {
  sendAnswer: (questionRef: string, answer: PlayerAnswer) => Promise<Ack<{ elapsedMs: number }>>;
  buzz: (questionRef: string) => Promise<Ack<{ won: boolean }>>;
}

/** Ô chọn đáp án (60px, chạm dễ trên điện thoại) và gửi đáp án; phím 1–6 chọn, Enter gửi. */
function AnswerForm({
  question,
  onSubmit,
}: {
  question: MatchQuestionView;
  onSubmit: (answer: PlayerAnswer) => Promise<string | null>;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choices =
    question.answerType === 'mcq'
      ? (question.options ?? [])
      : question.answerType === 'true_false'
        ? ['Đúng', 'Sai']
        : [];

  function answerOf(): PlayerAnswer | null {
    if (question.answerType === 'short_answer') {
      return text.trim() ? { type: 'short_answer', text: text.trim() } : null;
    }
    if (selected === null) return null;
    return question.answerType === 'mcq'
      ? { type: 'mcq', index: selected }
      : { type: 'true_false', value: selected === 0 };
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const answer = answerOf();
    if (!answer || pending) return;
    setPending(true);
    setError(await onSubmit(answer));
    setPending(false);
  }

  useEffect(() => {
    if (question.answerType === 'short_answer') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
        return;
      const index = Number.parseInt(event.key, 10) - 1;
      if (index >= 0 && index < choices.length) setSelected(index);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [question.answerType, choices.length]);

  const label =
    selected === null
      ? ''
      : question.answerType === 'mcq'
        ? ` ${OPTION_LETTERS[selected]}`
        : ` “${choices[selected]}”`;

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-2.5">
      {question.answerType === 'short_answer' ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-stage-200">Câu trả lời của bạn</span>
          <input
            value={text}
            maxLength={200}
            onChange={(event) => setText(event.target.value)}
            autoComplete="off"
            className="h-14 rounded-[14px] border-2 border-stage-700 bg-stage-800 px-4 text-lg text-white focus:border-accent-400"
          />
        </label>
      ) : (
        <fieldset className="flex flex-col gap-2.5 sm:grid sm:grid-cols-2">
          <legend className="sr-only">Chọn đáp án</legend>
          {choices.map((choice, index) => {
            const active = selected === index;
            return (
              <button
                key={choice + String(index)}
                type="button"
                aria-pressed={active}
                onClick={() => setSelected(index)}
                className={`flex min-h-[60px] items-center gap-3.5 rounded-[14px] px-4 text-left text-lg ${
                  active
                    ? 'border-[3px] border-accent-400 bg-[#2A3F7A] font-bold'
                    : 'border-2 border-stage-700 bg-stage-800 font-semibold hover:border-stage-200'
                }`}
              >
                {question.answerType === 'mcq' && (
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-lg font-extrabold ${
                      active ? 'bg-accent-400 text-stage-900' : 'bg-stage-900 text-accent-400'
                    }`}
                  >
                    {OPTION_LETTERS[index]}
                  </span>
                )}
                <span className="min-w-0 flex-1">{choice}</span>
                {active ? (
                  <span className="text-[13px] text-amber-200">Đã chọn</span>
                ) : (
                  <kbd className="hidden rounded border border-stage-700 px-1.5 text-xs text-stage-200 lg:inline">
                    {index + 1}
                  </kbd>
                )}
              </button>
            );
          })}
        </fieldset>
      )}
      <p role="alert" className="min-h-5 text-sm text-orange-300">
        {error}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="hidden text-[13px] text-stage-200 lg:block">
          {question.answerType === 'short_answer'
            ? 'Nhấn Enter để gửi.'
            : `Phím tắt: 1–${choices.length} để chọn, Enter để gửi.`}
        </p>
        <button
          type="submit"
          disabled={!answerOf() || pending}
          className="h-14 w-full rounded-[14px] bg-accent-400 px-6 text-lg font-extrabold text-stage-900 hover:bg-accent-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 lg:w-auto"
        >
          {pending ? 'Đang gửi…' : `Gửi đáp án${label}`}
        </button>
      </div>
    </form>
  );
}

/** Nút bấm chuông (màn PlayerBuzz); phím Space trên máy tính. */
function BuzzButton({ onBuzz }: { onBuzz: () => Promise<string | null> }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function press() {
    if (pending) return;
    setPending(true);
    setMessage(await onBuzz());
    setPending(false);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement)
        return;
      event.preventDefault();
      void press();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="flex flex-col items-center gap-[18px] py-4 lg:flex-row lg:gap-8">
      <button
        type="button"
        onClick={() => void press()}
        disabled={pending}
        className="flex size-[230px] flex-col items-center justify-center gap-2 rounded-full border-[10px] border-amber-300 bg-accent-400 text-[26px] font-extrabold text-stage-900 shadow-[0_0_0_10px_rgba(245,184,46,0.18)] hover:bg-accent-500 active:scale-95 disabled:opacity-80"
      >
        <BellIcon size={56} />
        BẤM CHUÔNG
      </button>
      <div className="flex max-w-[300px] flex-col items-center gap-2 text-center lg:items-start lg:text-left">
        <p className="inline-flex items-center gap-2 text-[15px] font-semibold text-green-300">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-green-300" />
          Chuông đã mở
        </p>
        <p className="text-sm leading-normal text-stage-200">
          <span className="hidden lg:inline">
            Nhấn <kbd className="rounded border border-stage-700 px-1">Space</kbd> hoặc bấm
            nút.{' '}
          </span>
          Người bấm đầu tiên (theo thời điểm server nhận) được quyền trả lời.
        </p>
        <p role="status" className="min-h-5 text-sm font-semibold text-orange-300">
          {message}
        </p>
      </div>
    </div>
  );
}

/** Phần tương tác của Player theo trạng thái câu hỏi. */
function PlayerInteraction({ view, actions }: { view: MatchView; actions: PlayerActions }) {
  const question = view.round.question;
  const mySeat = view.mySeat;
  const me = view.players.find((p) => p.seat === mySeat);
  if (!question || mySeat === null || !me) {
    return (
      <p className="py-6 text-center text-stage-200">
        {view.roundFinished
          ? 'Vòng thi đã kết thúc. Chờ Host tổng kết.'
          : 'Chờ Host hiển thị câu hỏi…'}
      </p>
    );
  }
  if (me.eliminated) return <p className="text-center text-stage-200">Bạn đã bị loại khỏi trận.</p>;

  const myAnswer = question.answers.find((a) => a.seat === mySeat);
  const revealed = ['revealed', 'skipped', 'voided'].includes(question.phase);

  if (revealed) {
    const result = myAnswer?.state;
    return (
      <div className="flex flex-col gap-2 rounded-[14px] bg-stage-800 p-4">
        {result === 'correct' && (
          <p className="text-lg font-extrabold text-green-300">
            Chính xác! +{question.points.correct}
          </p>
        )}
        {result === 'wrong' && (
          <p className="text-lg font-extrabold text-orange-300">
            Chưa đúng
            {question.points.wrong > 0 && question.answeringSeat !== null
              ? ` −${question.points.wrong}`
              : ''}
          </p>
        )}
        {correctText(question) && (
          <p className="text-[15px]">
            Đáp án: <b>{correctText(question)}</b>
          </p>
        )}
        {question.explanation && <p className="text-sm text-stage-200">{question.explanation}</p>}
      </div>
    );
  }

  const isMine = question.answeringSeat === mySeat;
  if (question.phase === 'buzzing') {
    if (view.round.buzz?.attemptedSeats.includes(mySeat)) {
      return (
        <p className="text-center text-stage-200">Bạn đã trả lời câu này. Chờ người chơi khác…</p>
      );
    }
    return (
      <BuzzButton
        onBuzz={async () => {
          const result = await actions.buzz(question.ref);
          if (!result.ok) return result.error.message;
          return result.data.won ? null : 'Người khác đã giành quyền trước.';
        }}
      />
    );
  }

  if (!isMine) {
    const owner = view.round.part === 'individual' ? view.round.turnSeat : question.answeringSeat;
    return (
      <p className="text-center text-[15px] text-stage-200">
        {owner === null
          ? 'Chờ Host bắt đầu…'
          : owner === mySeat
            ? 'Chờ Host bắt đầu tính giờ…'
            : `${playerName(view, owner)} đang trả lời.`}
      </p>
    );
  }

  if (view.round.answerMode === 'verbal') {
    return (
      <p className="rounded-[14px] bg-stage-800 p-4 text-center text-[15px] font-semibold">
        Lượt của bạn – hãy trả lời bằng lời, Host sẽ chấm.
      </p>
    );
  }
  if (question.phase === 'showing') {
    return <p className="text-center text-stage-200">Chờ Host bắt đầu tính giờ…</p>;
  }
  if (myAnswer?.answer) {
    return (
      <p className="rounded-[14px] bg-stage-800 p-4 text-center text-[15px]">
        Đã gửi: <b>{describeAnswer(myAnswer.answer, question.options)}</b> · chờ Host chấm
      </p>
    );
  }
  if (question.phase === 'judging') {
    return <p className="text-center text-stage-200">Hết giờ. Chờ Host chấm…</p>;
  }
  return (
    <AnswerForm
      key={question.ref}
      question={question}
      onSubmit={async (answer) => {
        const result = await actions.sendAnswer(question.ref, answer);
        return result.ok ? null : result.error.message;
      }}
    />
  );
}

/** Màn người chơi trong trận (PlayerAnswer, PlayerBuzz, PlayerDesktopAnswer/Buzz). */
export function PlayerMatch({
  view,
  room,
  clockOffset,
  actions,
}: {
  view: MatchView;
  room: RoomState;
  clockOffset: number;
  actions: PlayerActions;
}) {
  const remaining = useRemainingMs(view.timer, clockOffset);
  const me = view.players.find((p) => p.seat === view.mySeat);
  const question = view.round.question;

  return (
    <>
      <header className="border-b border-[#1E3A75]">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs text-stage-200 lg:text-[13px]">
              <span className="hidden lg:inline">{room.room.name} · </span>
              {roundTitle(view)}
            </p>
            <p className="mt-0.5 text-[15px] font-bold leading-snug lg:text-xl lg:font-extrabold">
              {partLabel(view, view.mySeat)}
            </p>
          </div>
          {me && (
            <div className="flex shrink-0 items-center gap-2 rounded-xl bg-stage-800 py-1.5 pl-1.5 pr-3">
              <SeatSquare seat={me.seat} className="size-7 rounded-lg text-sm" />
              <span className="hidden text-sm text-stage-200 lg:inline">Điểm của bạn</span>
              <span className="text-xl font-extrabold tabular-nums text-accent-400">
                {me.score}
              </span>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-3.5 px-4 py-4 sm:px-6 lg:flex-row lg:items-start lg:gap-6 lg:py-6">
        <section
          aria-label="Người tham gia"
          className="grid grid-cols-[2fr_repeat(3,minmax(0,1fr))] gap-1.5 lg:w-72 lg:shrink-0 lg:grid-cols-1 lg:gap-3"
        >
          <div className="flex h-[84px] items-end rounded-[10px] bg-[#1E3A75] p-1.5 text-[11px] font-semibold lg:h-40 lg:items-center lg:justify-center lg:text-sm">
            Host · {room.host.displayName}
          </div>
          {view.players
            .filter((p) => p.seat !== view.mySeat)
            .map((p) => (
              <div
                key={p.seat}
                className={`relative flex h-[84px] flex-col items-center justify-center gap-1 rounded-[10px] border-2 bg-[#1E3A75] p-1 text-[10px] lg:h-auto lg:flex-row lg:justify-start lg:gap-2.5 lg:p-2.5 lg:text-sm ${SEAT_BORDER[p.seat] ?? ''} ${
                  p.connection !== 'online' || p.eliminated ? 'opacity-45' : ''
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`hidden size-9 items-center justify-center rounded-full font-extrabold text-stage-900 lg:flex ${SEAT_BG[p.seat] ?? ''}`}
                >
                  {initials(p.displayName)}
                </span>
                <span className="min-w-0 truncate">
                  <b>{p.seat}</b>
                  <span className="hidden lg:inline"> · {p.displayName}</span> · {p.score}
                </span>
              </div>
            ))}
        </section>

        <div className="flex min-w-0 flex-1 flex-col gap-3.5">
          <PauseBanner view={view} />
          {view.timer && (
            <div className="lg:hidden">
              <TimerBar remainingMs={remaining} durationMs={view.timer.durationMs} />
            </div>
          )}
          <section
            aria-labelledby="player-question"
            className="flex flex-col gap-3 rounded-2xl bg-stage-800 p-[18px] lg:p-6"
          >
            {question ? (
              <>
                <div className="flex items-start gap-6">
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <span className="text-xs font-semibold text-stage-200 lg:text-[13px]">
                      {ANSWER_TYPE_LABELS[question.answerType]} · {pointsLabel(question)}
                    </span>
                    <h1
                      id="player-question"
                      className="text-[21px] font-bold leading-snug lg:text-[26px]"
                    >
                      {question.content}
                    </h1>
                  </div>
                  {view.timer && (
                    <div className="hidden lg:block">
                      <TimerRing remainingMs={remaining} size="md" />
                    </div>
                  )}
                </div>
                <QuestionMedia question={question} />
                {question.answeringSeat !== view.mySeat &&
                  question.phase !== 'buzzing' &&
                  question.answerType !== 'short_answer' && <OptionGrid question={question} />}
              </>
            ) : (
              <h1 id="player-question" className="text-center text-lg font-bold">
                {view.roundFinished ? 'Đã hết câu hỏi' : 'Chuẩn bị câu hỏi…'}
              </h1>
            )}
          </section>
          <PlayerInteraction view={view} actions={actions} />
        </div>
      </main>
    </>
  );
}
