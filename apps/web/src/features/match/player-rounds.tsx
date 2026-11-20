import {
  type AccelerationView,
  type Ack,
  describeAnswer,
  type FinishView,
  type MatchQuestionView,
  type MatchView,
  type ObstacleView,
  type PlayerAnswer,
  type PlayerChoice,
  type TiebreakView,
  type WarmupView,
} from '@olympia/shared';
import { type FormEvent, useState } from 'react';
import { BellIcon } from '../../components/icons';
import { PackChips, PackPicker } from './finish-ui';
import {
  ANSWER_TYPE_LABELS,
  correctText,
  formatElapsed,
  playerName,
  pointsLabel,
  seconds,
} from './match-format';
import { OptionGrid, QuestionMedia, SeatSquare, TimerRing } from './match-ui';
import { ObstacleBoard, ObstacleImage } from './obstacle-ui';
import { AnswerForm, BuzzButton } from './player-controls';

/** Nội dung màn Player theo từng loại vòng (PlayerAnswer/Buzz, Acceleration, FinishPick, …). */

export interface PlayerActions {
  sendAnswer: (questionRef: string, answer: PlayerAnswer) => Promise<Ack<{ elapsedMs: number }>>;
  buzz: (questionRef: string) => Promise<Ack<{ won: boolean }>>;
  choose: (choice: PlayerChoice) => Promise<string | null>;
}

interface RoundProps<R> {
  view: MatchView;
  round: R;
  actions: PlayerActions;
  remaining: number | null;
}

const FINAL = ['revealed', 'skipped', 'voided'];
const note = 'text-center text-[15px] text-stage-200';

/** Câu hỏi đang thi (nội dung, media, phương án để xem). */
export function PlayerQuestion({
  view,
  question,
  remaining,
  label,
  showOptions,
  emptyText,
}: {
  view: MatchView;
  question: MatchQuestionView | null;
  remaining: number | null;
  label?: string;
  showOptions: boolean;
  emptyText: string;
}) {
  return (
    <section
      aria-labelledby="player-question"
      className="flex flex-col gap-3 rounded-2xl bg-stage-800 p-[18px] lg:p-6"
    >
      {question ? (
        <>
          <div className="flex items-start gap-6">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <span className="text-xs font-semibold text-stage-200 lg:text-[13px]">
                {label ? `${label} · ` : ''}
                {ANSWER_TYPE_LABELS[question.answerType]} · {pointsLabel(question)}
              </span>
              <h1
                id="player-question"
                className="text-[21px] font-bold leading-snug lg:text-[26px]"
              >
                {question.content}
              </h1>
            </div>
            {view.timer && ['answer', 'buzz'].includes(view.timer.purpose) && (
              <div className="hidden lg:block">
                <TimerRing remainingMs={remaining} size="md" />
              </div>
            )}
          </div>
          <QuestionMedia question={question} />
          {showOptions && question.answerType !== 'short_answer' && (
            <OptionGrid question={question} />
          )}
        </>
      ) : (
        <h1 id="player-question" className="text-center text-lg font-bold">
          {emptyText}
        </h1>
      )}
    </section>
  );
}

/** Kết quả câu của mình sau khi công bố. */
function RevealedResult({
  question,
  mySeat,
  wrongPenalty,
}: {
  question: MatchQuestionView;
  mySeat: number;
  wrongPenalty?: boolean;
}) {
  const mine = question.answers.find((a) => a.seat === mySeat);
  const points = mine?.points;
  return (
    <div className="flex flex-col gap-2 rounded-[14px] bg-stage-800 p-4">
      {mine?.state === 'correct' && (
        <p className="text-lg font-extrabold text-green-300">
          Chính xác!{' '}
          {points != null ? (points > 0 ? `+${points}` : '') : `+${question.points.correct}`}
        </p>
      )}
      {mine?.state === 'wrong' && (
        <p className="text-lg font-extrabold text-orange-300">
          Chưa đúng
          {points
            ? ` ${points}`
            : wrongPenalty && question.points.wrong > 0
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

async function answerOrError(
  actions: PlayerActions,
  ref: string,
  answer: PlayerAnswer,
): Promise<string | null> {
  const result = await actions.sendAnswer(ref, answer);
  return result.ok ? null : result.error.message;
}

async function buzzOrError(actions: PlayerActions, ref: string): Promise<string | null> {
  const result = await actions.buzz(ref);
  if (!result.ok) return result.error.message;
  return result.data.won ? null : 'Người khác đã giành quyền trước.';
}

// --- Khởi động ---

export function WarmupPlayer({ view, round, actions, remaining }: RoundProps<WarmupView>) {
  const question = round.question;
  const mySeat = view.mySeat;
  const me = view.players.find((p) => p.seat === mySeat);

  let interaction;
  if (!question || mySeat === null || !me) {
    interaction = (
      <p className="py-6 text-center text-stage-200">
        {view.roundFinished ? 'Vòng thi đã kết thúc. Chờ Host.' : 'Chờ Host hiển thị câu hỏi…'}
      </p>
    );
  } else if (me.eliminated) {
    interaction = <p className={note}>Bạn đã bị loại khỏi trận.</p>;
  } else if (FINAL.includes(question.phase)) {
    interaction = (
      <RevealedResult question={question} mySeat={mySeat} wrongPenalty={round.part === 'shared'} />
    );
  } else if (question.phase === 'buzzing') {
    interaction = round.buzz?.attemptedSeats.includes(mySeat) ? (
      <p className={note}>Bạn đã trả lời câu này. Chờ người chơi khác…</p>
    ) : (
      <BuzzButton onBuzz={() => buzzOrError(actions, question.ref)} />
    );
  } else if (question.answeringSeat !== mySeat) {
    const owner = round.part === 'individual' ? round.turnSeat : question.answeringSeat;
    interaction = (
      <p className={note}>
        {owner === null
          ? 'Chờ Host bắt đầu…'
          : owner === mySeat
            ? 'Chờ Host bắt đầu tính giờ…'
            : `${playerName(view, owner)} đang trả lời.`}
      </p>
    );
  } else {
    interaction = (
      <MyTurn
        question={question}
        mySeat={mySeat}
        verbal={round.answerMode === 'verbal'}
        actions={actions}
      />
    );
  }

  return (
    <>
      <PlayerQuestion
        view={view}
        question={question}
        remaining={remaining}
        showOptions={
          !!question && question.answeringSeat !== mySeat && question.phase !== 'buzzing'
        }
        emptyText={view.roundFinished ? 'Đã hết câu hỏi' : 'Chuẩn bị câu hỏi…'}
      />
      {interaction}
    </>
  );
}

/** Lượt trả lời của mình (một người trả lời). */
function MyTurn({
  question,
  mySeat,
  verbal,
  actions,
}: {
  question: MatchQuestionView;
  mySeat: number;
  verbal: boolean;
  actions: PlayerActions;
}) {
  const mine = question.answers.find((a) => a.seat === mySeat);
  if (verbal) {
    return (
      <p className="rounded-[14px] bg-stage-800 p-4 text-center text-[15px] font-semibold">
        Lượt của bạn – hãy trả lời bằng lời, Host sẽ chấm.
      </p>
    );
  }
  if (question.phase === 'showing') return <p className={note}>Chờ Host bắt đầu tính giờ…</p>;
  if (mine?.answer) {
    return (
      <p className="rounded-[14px] bg-stage-800 p-4 text-center text-[15px]">
        Đã gửi: <b>{describeAnswer(mine.answer, question.options)}</b> · chờ Host chấm
      </p>
    );
  }
  if (question.phase === 'judging') return <p className={note}>Hết giờ. Chờ Host chấm…</p>;
  return (
    <AnswerForm
      key={question.ref}
      question={question}
      onSubmit={(answer) => answerOrError(actions, question.ref, answer)}
    />
  );
}

// --- Câu hỏi phụ ---

export function TiebreakPlayer({ view, round, actions, remaining }: RoundProps<TiebreakView>) {
  const question = round.question;
  const mySeat = view.mySeat;
  const inTie = mySeat !== null && round.seats.includes(mySeat);
  let interaction;
  if (round.winnerSeat !== null) {
    interaction = (
      <p className="rounded-[14px] bg-stage-800 p-4 text-center text-lg font-extrabold text-green-300">
        {round.winnerSeat === mySeat
          ? 'Bạn thắng câu hỏi phụ!'
          : `${playerName(view, round.winnerSeat)} thắng câu hỏi phụ.`}
      </p>
    );
  } else if (!inTie) {
    interaction = (
      <p className={note}>
        Câu hỏi phụ dành cho người hòa điểm dẫn đầu:{' '}
        {round.seats.map((s) => playerName(view, s)).join(', ')}.
      </p>
    );
  } else if (!question || mySeat === null) {
    interaction = <p className={note}>Chờ Host hiển thị câu hỏi phụ…</p>;
  } else if (FINAL.includes(question.phase)) {
    interaction = <RevealedResult question={question} mySeat={mySeat} />;
  } else if (question.phase === 'buzzing') {
    interaction = round.buzz?.attemptedSeats.includes(mySeat) ? (
      <p className={note}>Bạn đã trả lời câu này.</p>
    ) : (
      <BuzzButton onBuzz={() => buzzOrError(actions, question.ref)} />
    );
  } else if (question.answeringSeat === mySeat) {
    interaction = <MyTurn question={question} mySeat={mySeat} verbal={false} actions={actions} />;
  } else {
    interaction = (
      <p className={note}>
        {question.answeringSeat !== null
          ? `${playerName(view, question.answeringSeat)} đang trả lời.`
          : 'Chờ Host mở chuông…'}
      </p>
    );
  }
  return (
    <>
      <PlayerQuestion
        view={view}
        question={question}
        remaining={remaining}
        label="Câu hỏi phụ"
        showOptions={!!question && question.answeringSeat !== mySeat}
        emptyText="Hòa điểm – chuẩn bị câu hỏi phụ…"
      />
      {interaction}
    </>
  );
}

// --- Tăng tốc ---

/** Tiến độ gửi đáp án của các người chơi. */
function AnswerProgress({ view, question }: { view: MatchView; question: MatchQuestionView }) {
  return (
    <section
      aria-label="Tiến độ người chơi"
      className="grid grid-cols-[repeat(auto-fit,minmax(70px,1fr))] gap-1.5 text-center text-[11px] lg:text-[13px]"
    >
      {question.answers.map((entry) => (
        <div
          key={entry.seat}
          className={`rounded-[10px] bg-stage-800 px-1 py-2 ${
            entry.seat === view.mySeat ? 'border-2 border-accent-400' : ''
          }`}
        >
          <b className="block text-[13px]">
            {entry.seat}
            {entry.seat === view.mySeat ? ' · Bạn' : ''}
          </b>
          {entry.state === 'none' ? 'Chưa gửi' : 'Đã gửi'}
        </div>
      ))}
    </section>
  );
}

/** Kết quả từng người chơi kèm thời gian trả lời (BR-R3-03). */
function ResultList({ view, question }: { view: MatchView; question: MatchQuestionView }) {
  const rows = [...question.answers].sort(
    (a, b) => (a.elapsedMs ?? Number.MAX_SAFE_INTEGER) - (b.elapsedMs ?? Number.MAX_SAFE_INTEGER),
  );
  return (
    <section
      aria-label="Kết quả câu hỏi"
      className="flex flex-col gap-2 rounded-2xl bg-stage-800 p-4"
    >
      <p className="text-[15px]">
        Đáp án: <b>{correctText(question)}</b>
      </p>
      <ul className="flex flex-col gap-1.5 text-sm">
        {rows.map((entry) => (
          <li key={entry.seat} className="flex items-center gap-2">
            <SeatSquare seat={entry.seat} />
            <span className="min-w-0 flex-1 truncate">
              {playerName(view, entry.seat)}:{' '}
              <b>
                {entry.answer ? describeAnswer(entry.answer, question.options) : 'Không trả lời'}
              </b>
            </span>
            <span className="tabular-nums text-stage-200">
              {entry.elapsedMs !== null ? formatElapsed(entry.elapsedMs) : '—'}
            </span>
            <span
              className={`w-14 text-right font-bold ${
                entry.state === 'correct' ? 'text-green-300' : 'text-orange-300'
              }`}
            >
              {entry.state === 'correct' ? `+${entry.points ?? 0}` : '✕'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AccelerationPlayer({
  view,
  round,
  actions,
  remaining,
}: RoundProps<AccelerationView>) {
  const question = round.question;
  const mySeat = view.mySeat;
  const mine = question?.answers.find((a) => a.seat === mySeat);
  let interaction = null;
  if (question && mySeat !== null) {
    if (FINAL.includes(question.phase)) {
      interaction = <ResultList view={view} question={question} />;
    } else if (question.phase === 'showing') {
      interaction = <p className={note}>Chờ Host bắt đầu tính giờ…</p>;
    } else if (question.phase === 'answering' && (!mine?.answer || round.allowResubmit)) {
      interaction = (
        <>
          {mine?.answer && (
            <p className="text-center text-[15px]">
              Đã gửi: <b>{describeAnswer(mine.answer, question.options)}</b>
              {mine.elapsedMs !== null && ` · ${formatElapsed(mine.elapsedMs)}`} · có thể gửi lại
            </p>
          )}
          <AnswerForm
            key={question.ref}
            question={question}
            onSubmit={(answer) => answerOrError(actions, question.ref, answer)}
          />
          <p className="text-[13px] text-stage-200">
            {round.allowResubmit
              ? 'Gửi lại sẽ ghi đè đáp án trước; thời gian tính theo lần gửi cuối.'
              : 'Chỉ gửi được 1 lần.'}{' '}
            Ai trả lời đúng sớm hơn (theo giờ server) được điểm cao hơn.
          </p>
        </>
      );
    } else if (mine?.answer) {
      interaction = (
        <p className="rounded-[14px] bg-stage-800 p-4 text-center text-[15px]">
          Đã gửi: <b>{describeAnswer(mine.answer, question.options)}</b>
          {mine.elapsedMs !== null && ` · ${formatElapsed(mine.elapsedMs)}`} · chờ công bố
        </p>
      );
    } else {
      interaction = <p className={note}>Hết giờ. Chờ công bố kết quả…</p>;
    }
  }
  return (
    <>
      <PlayerQuestion
        view={view}
        question={question}
        remaining={remaining}
        label={round.questionNo > 0 ? `Câu ${round.questionNo}/${round.questionTotal}` : undefined}
        showOptions={false}
        emptyText={view.roundFinished ? 'Đã hết câu hỏi' : 'Chuẩn bị câu hỏi…'}
      />
      {interaction}
      {question && question.phase === 'answering' && (
        <AnswerProgress view={view} question={question} />
      )}
    </>
  );
}

// --- Vượt chướng ngại vật ---

function KeywordGuess({ round, actions }: { round: ObstacleView; actions: PlayerActions }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim() || pending) return;
    setPending(true);
    setError(
      await answerOrError(actions, round.keyword.ref, { type: 'short_answer', text: text.trim() }),
    );
    setPending(false);
  }

  return (
    <section
      aria-labelledby="keyword-heading"
      className="flex flex-col gap-3 rounded-[18px] border-2 border-accent-400 bg-[#3A2A0A] p-5"
    >
      <h2 id="keyword-heading" className="text-base font-bold text-amber-300">
        Bạn đã đoán ra chướng ngại vật?
      </h2>
      {open ? (
        <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-2.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-amber-100">
              Từ khóa ({round.keyword.letters} ký tự)
            </span>
            <input
              value={text}
              maxLength={200}
              autoComplete="off"
              onChange={(event) => setText(event.target.value)}
              className="h-14 rounded-xl border-2 border-stage-700 bg-stage-900 px-4 text-xl font-extrabold uppercase tracking-[0.15em] text-white focus:border-accent-400"
            />
          </label>
          <button
            type="submit"
            disabled={!text.trim() || pending}
            className="h-14 rounded-[14px] bg-accent-400 text-lg font-extrabold text-stage-900 hover:bg-accent-500 disabled:opacity-60"
          >
            {pending ? 'Đang gửi…' : 'Gửi từ khóa'}
          </button>
          <p role="alert" className="min-h-5 text-sm text-orange-300">
            {error}
          </p>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-16 items-center justify-center gap-2.5 rounded-[14px] bg-accent-400 text-lg font-extrabold text-stage-900 hover:bg-accent-500"
        >
          <BellIcon size={24} />
          Bấm chuông trả lời CNV
        </button>
      )}
      <p className="text-[13px] leading-normal text-amber-100">
        Đúng: +{round.keyword.points} điểm. Sai: bạn bị loại khỏi phần còn lại của vòng.
      </p>
    </section>
  );
}

export function ObstaclePlayer({ view, round, actions, remaining }: RoundProps<ObstacleView>) {
  const mySeat = view.mySeat;
  const question = round.question;
  const out = mySeat !== null && round.outSeats.includes(mySeat);
  const myGuess = round.guesses.find((g) => g.seat === mySeat);
  const mine = question?.answers.find((a) => a.seat === mySeat);
  const row = round.rows.find((r) => r.index === round.currentRow);
  const rowName = row?.kind === 'center' ? 'Ô trung tâm' : `Hàng ${round.currentRow ?? ''}`;
  const [chooseError, setChooseError] = useState<string | null>(null);

  return (
    <>
      <ObstacleBoard
        round={round}
        remainingSeconds={question?.phase === 'answering' ? seconds(remaining) : null}
      />

      {round.phase === 'choosing' && round.turnSeat === mySeat && !out && (
        <section className="flex flex-col gap-3 rounded-[18px] border-2 border-accent-400 bg-stage-800 p-5">
          <h2 className="text-base font-bold">Đến lượt bạn chọn hàng</h2>
          <div className="flex flex-wrap gap-2.5">
            {round.rows
              .filter((r) => r.kind === 'row' && r.status === 'closed')
              .map((r) => (
                <button
                  key={r.index}
                  type="button"
                  onClick={() =>
                    void actions
                      .choose({ type: 'row', row: r.index })
                      .then((message) => setChooseError(message))
                  }
                  className="h-12 rounded-xl bg-accent-400 px-5 text-[15px] font-extrabold text-stage-900 hover:bg-accent-500"
                >
                  Hàng {r.index} · {r.letters} chữ
                </button>
              ))}
          </div>
          <p role="alert" className="min-h-5 text-sm text-orange-300">
            {chooseError}
          </p>
        </section>
      )}

      {question && round.phase === 'row' && (
        <section
          aria-labelledby="row-question"
          className="flex flex-col gap-3.5 rounded-[18px] border-2 border-accent-400 bg-stage-800 p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-[1_1_320px]">
              <span className="text-[13px] font-semibold text-amber-200">
                {rowName} · {row?.letters ?? 0} chữ cái · +{question.points.correct} điểm nếu đúng
              </span>
              <h3 id="row-question" className="mt-1 text-[22px] font-bold leading-snug">
                {question.content}
              </h3>
            </div>
            <TimerRing remainingMs={remaining} size="md" />
          </div>
          <QuestionMedia question={question} />
          {out ? (
            <p className={note}>Bạn đã bị loại khỏi phần còn lại của vòng.</p>
          ) : question.phase === 'answering' ? (
            <>
              {mine?.answer && (
                <p className="text-[15px]">
                  Đã ghi: <b>{describeAnswer(mine.answer, null)}</b>
                </p>
              )}
              <AnswerForm
                key={question.ref}
                question={question}
                submitText="Ghi đáp án"
                fieldLabel={`Đáp án ${rowName.toLowerCase()}`}
                onSubmit={(answer) => answerOrError(actions, question.ref, answer)}
              />
              <p className="text-[13px] text-stage-200">
                Có thể sửa đến khi hết giờ. Đáp án cuối cùng được tính.
              </p>
            </>
          ) : question.phase === 'showing' ? (
            <p className={note}>Chờ Host bắt đầu tính giờ…</p>
          ) : (
            <p className={note}>
              {mine?.answer
                ? `Đã ghi: ${describeAnswer(mine.answer, null)} · chờ công bố`
                : 'Hết giờ. Chờ công bố kết quả…'}
            </p>
          )}
        </section>
      )}

      {question && FINAL.includes(question.phase) && mySeat !== null && !round.keyword.revealed && (
        <p className="rounded-[14px] bg-stage-800 p-4 text-[15px]">
          {mine?.state === 'correct'
            ? `Chính xác! +${question.points.correct}`
            : mine?.answer
              ? 'Chưa đúng.'
              : 'Bạn không ghi đáp án.'}{' '}
          Đáp án {rowName.toLowerCase()}: <b>{correctText(question) ?? row?.answer}</b>
        </p>
      )}

      {!round.keyword.revealed && !out && mySeat !== null && !myGuess && (
        <KeywordGuess round={round} actions={actions} />
      )}
      {myGuess && (
        <p className="rounded-[14px] bg-stage-800 p-4 text-center text-[15px]">
          Bạn đã đoán “{myGuess.text}” ·{' '}
          {myGuess.state === 'pending'
            ? 'chờ Host xác nhận'
            : myGuess.state === 'correct'
              ? `Đúng! +${myGuess.points}`
              : myGuess.state === 'wrong'
                ? 'Sai – bạn bị loại khỏi vòng'
                : 'không được chấm (vòng đã kết thúc)'}
        </p>
      )}
      <ObstacleImage round={round} />
    </>
  );
}

// --- Về đích ---

export function FinishPlayer({ view, round, actions, remaining }: RoundProps<FinishView>) {
  const mySeat = view.mySeat;
  const question = round.question;
  const myTurn = round.turnSeat === mySeat;
  const steal = round.steal;
  const me = view.players.find((p) => p.seat === mySeat);

  if (round.phase === 'picking') {
    return myTurn ? (
      <section className="flex flex-col gap-3 rounded-2xl bg-stage-800 p-[18px] lg:p-6">
        <h1 className="text-2xl font-extrabold">Chọn gói câu hỏi</h1>
        <PackPicker
          round={round}
          submitLabel={(levels) => `Xác nhận gói ${levels.join(' · ')}`}
          onSubmit={(levels, star) => actions.choose({ type: 'pack', levels, star })}
        />
      </section>
    ) : (
      <p className="rounded-2xl bg-stage-800 p-6 text-center text-[15px] text-stage-200">
        {playerName(view, round.turnSeat)} đang chọn gói câu hỏi…
      </p>
    );
  }

  let interaction = null;
  if (question && mySeat !== null && !me?.eliminated) {
    const answerer = question.answeringSeat;
    const answering = question.phase === 'answering' || question.phase === 'judging';
    if (FINAL.includes(question.phase)) {
      interaction = <RevealedResult question={question} mySeat={mySeat} />;
    } else if (question.phase === 'buzzing' && steal && !myTurn) {
      interaction = steal.attemptedSeats.includes(mySeat) ? (
        <p className={note}>Bạn đã giành quyền câu này.</p>
      ) : (
        <BuzzButton
          label="GIÀNH QUYỀN"
          hint={`Đúng: nhận ${steal.points} điểm. Sai: bị trừ ${steal.penalty} điểm.`}
          onBuzz={() => buzzOrError(actions, question.ref)}
        />
      );
    } else if (answering && answerer === mySeat) {
      interaction = (
        <MyTurn
          question={question}
          mySeat={mySeat}
          verbal={round.answerMode === 'verbal'}
          actions={actions}
        />
      );
    } else if (question.phase === 'showing') {
      interaction = <p className={note}>{myTurn ? 'Chờ Host bắt đầu tính giờ…' : 'Chờ Host…'}</p>;
    } else if (question.phase === 'buzzing') {
      interaction = <p className={note}>Các người chơi khác đang giành quyền…</p>;
    } else if (answerer !== null) {
      interaction = <p className={note}>{playerName(view, answerer)} đang trả lời.</p>;
    }
  }

  return (
    <>
      {round.pack && (
        <PackChips
          pack={round.pack}
          title={myTurn ? 'Gói của bạn' : `Gói của ${playerName(view, round.turnSeat)}`}
        />
      )}
      {myTurn && round.starEnabled && round.pack && question?.phase === 'revealed' && (
        <StarSwitch round={round} actions={actions} />
      )}
      <PlayerQuestion
        view={view}
        question={question}
        remaining={remaining}
        label={
          round.questionNo > 0 ? `Câu ${round.questionNo}/${round.questionsPerPlayer}` : undefined
        }
        showOptions={!!question && question.answeringSeat !== mySeat}
        emptyText={round.phase === 'done' ? 'Đã hết lượt thi' : 'Chuẩn bị câu hỏi…'}
      />
      {interaction}
    </>
  );
}

/** Đổi câu dùng Ngôi sao hy vọng trước khi câu đó hiển thị. */
function StarSwitch({ round, actions }: { round: FinishView; actions: PlayerActions }) {
  const pack = round.pack ?? [];
  const used = pack.some((item) => item.star && item.state !== 'pending');
  const pending = pack
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => item.state === 'pending');
  const [error, setError] = useState<string | null>(null);
  if (used || pending.length === 0) return null;
  return (
    <section className="flex flex-wrap items-center gap-2.5 rounded-2xl bg-stage-800 p-4 text-sm">
      <span className="font-semibold">Ngôi sao hy vọng cho câu:</span>
      {pending.map(({ item, i }) => (
        <button
          key={i}
          type="button"
          aria-pressed={item.star}
          onClick={() =>
            void actions
              .choose({ type: 'star', star: item.star ? null : i })
              .then((message) => setError(message))
          }
          className={`h-9 rounded-full px-3 font-semibold ${
            item.star ? 'bg-accent-400 text-stage-900' : 'border border-stage-700 text-stage-200'
          }`}
        >
          Câu {i + 1} · {item.points}
        </button>
      ))}
      {error && <span className="text-orange-300">{error}</span>}
    </section>
  );
}
