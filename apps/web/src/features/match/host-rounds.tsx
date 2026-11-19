import {
  type AccelerationView,
  describeAnswer,
  type FinishView,
  type HostCommand,
  type MatchQuestionView,
  type MatchView,
  type ObstacleView,
  type SeatAnswerView,
  type TiebreakView,
  type WarmupView,
} from '@olympia/shared';
import { useState } from 'react';
import { ChevronRightIcon } from '../../components/icons';
import { PackChips, PackPicker } from './finish-ui';
import {
  ANSWER_TYPE_LABELS,
  answerText,
  correctText,
  formatElapsed,
  playerName,
  pointsLabel,
} from './match-format';
import { OptionGrid, QuestionMedia, SeatSquare, TimerRing } from './match-ui';

/** Panel điều khiển của Host theo từng loại vòng (HostControl, HostControlObstacle/…/Finish). */

export const outlineButton =
  'inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-stage-700 bg-transparent px-4 text-sm font-semibold text-white hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50';
export const primaryButton =
  'inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-accent-400 px-[22px] text-[15px] font-extrabold text-stage-900 hover:bg-accent-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500';
const correctButton =
  'inline-flex h-12 items-center gap-2 rounded-xl bg-green-700 px-5 text-[15px] font-bold text-white hover:bg-green-800 disabled:opacity-50';
const wrongButton =
  'inline-flex h-12 items-center gap-2 rounded-xl bg-orange-700 px-5 text-[15px] font-bold text-white hover:bg-orange-800 disabled:opacity-50';
const card = 'flex flex-col gap-3 rounded-[18px] bg-stage-800 p-5';

const FINAL = ['revealed', 'skipped', 'voided'];

export interface HostPanelProps<R> {
  view: MatchView;
  round: R;
  busy: boolean;
  paused: boolean;
  remaining: number | null;
  run: (command: HostCommand) => Promise<boolean>;
  onVoid: () => void;
}

function suggestionLabel(value: 'correct' | 'wrong' | null): string {
  if (value === 'correct') return 'hệ thống chấm: Đúng';
  if (value === 'wrong') return 'hệ thống chấm: Sai';
  return 'cần Host chấm';
}

/** Câu hỏi và đáp án (chỉ Host thấy) kèm đồng hồ. */
export function HostQuestionCard({
  question,
  label,
  remaining,
}: {
  question: MatchQuestionView;
  label: string;
  remaining: number | null;
}) {
  return (
    <section
      aria-labelledby="host-question"
      className="flex flex-col gap-[18px] rounded-[18px] bg-stage-800 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-2.5">
          <span className="text-[13px] font-semibold text-stage-200">
            {label} · {ANSWER_TYPE_LABELS[question.answerType]} · {pointsLabel(question)}
          </span>
          <h2 id="host-question" className="text-[22px] font-bold leading-snug sm:text-[26px]">
            {question.content}
          </h2>
        </div>
        <TimerRing remainingMs={remaining} />
      </div>
      <QuestionMedia question={question} />
      {question.answerType === 'short_answer' ? (
        <p className="rounded-xl border-2 border-green-500 bg-[#0F3B2A] px-4 py-3.5 text-base">
          <span className="text-xs font-bold text-green-300">Đáp án · chỉ Host thấy: </span>
          {correctText(question)}
        </p>
      ) : (
        <OptionGrid question={question} showCorrectLabel="Đáp án · chỉ Host thấy" />
      )}
      {question.explanation && (
        <p className="text-sm text-stage-200">Giải thích: {question.explanation}</p>
      )}
    </section>
  );
}

/** Chấm người đang trả lời (một người có quyền trả lời). */
function JudgeBar({
  view,
  question,
  seat,
  verbal,
  busy,
  paused,
  run,
  title,
  note,
}: {
  view: MatchView;
  question: MatchQuestionView;
  seat: number;
  verbal: boolean;
  busy: boolean;
  paused: boolean;
  run: (command: HostCommand) => Promise<boolean>;
  title?: string;
  note?: string;
}) {
  const entry = question.answers.find((a) => a.seat === seat);
  return (
    <section
      aria-labelledby="judge-heading"
      className="flex flex-wrap items-center gap-4 rounded-[18px] bg-stage-800 px-5 py-[18px]"
    >
      <div className="min-w-0 flex-[1_1_280px]">
        <h2 id="judge-heading" className="text-[13px] font-semibold text-stage-200">
          {title ?? `Câu trả lời của ${playerName(view, seat)}`}
        </h2>
        <p className="mt-1 text-lg font-bold">
          {verbal
            ? 'Trả lời bằng lời'
            : (answerText(question, seat) ??
              (question.phase === 'answering' ? 'Đang chờ trả lời…' : 'Không trả lời'))}{' '}
          {entry?.elapsedMs != null && (
            <span className="text-sm font-medium text-stage-200">
              · sau {(entry.elapsedMs / 1000).toFixed(2).replace('.', ',')} giây ·{' '}
              {suggestionLabel(entry.suggested)}
            </span>
          )}
        </p>
        {note && <p className="mt-1 text-sm text-amber-200">{note}</p>}
      </div>
      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          disabled={busy || paused}
          onClick={() => void run({ type: 'judge', seat, correct: true })}
          className={correctButton}
        >
          ✓ Xác nhận Đúng
        </button>
        <button
          type="button"
          disabled={busy || paused}
          onClick={() => void run({ type: 'judge', seat, correct: false })}
          className={wrongButton}
        >
          ✕ Sai
        </button>
      </div>
    </section>
  );
}

function PrimaryButton({
  label,
  command,
  busy,
  paused,
  run,
}: {
  label: string;
  command: HostCommand;
  busy: boolean;
  paused: boolean;
  run: (command: HostCommand) => Promise<boolean>;
}) {
  return (
    <button
      type="button"
      disabled={busy || paused}
      onClick={() => void run(command)}
      className={primaryButton}
    >
      {label}
      <ChevronRightIcon />
    </button>
  );
}

function ActionRow({ left, right }: { left: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-2.5">
      <div className="flex flex-wrap gap-2.5">{left}</div>
      {right}
    </div>
  );
}

function BuzzInfo({ view, attempted }: { view: MatchView; attempted: number[] }) {
  return (
    <section className="rounded-[18px] bg-stage-800 px-5 py-4 text-[15px]">
      <p className="font-semibold text-green-300">Chuông đang mở – chờ người chơi giành quyền.</p>
      {attempted.length > 0 && (
        <p className="mt-1 text-sm text-stage-200">
          Đã trả lời: {attempted.map((s) => playerName(view, s)).join(', ')}
        </p>
      )}
    </section>
  );
}

// --- Khởi động (và câu hỏi phụ: cùng dạng chuông) ---

export function WarmupPanel({
  view,
  round,
  busy,
  paused,
  remaining,
  run,
  onVoid,
}: HostPanelProps<WarmupView>) {
  const question = round.question;
  const finalPhase = !question || FINAL.includes(question.phase);
  const answerer = question?.answeringSeat ?? null;

  let primary: { label: string; command: HostCommand } | null = null;
  if (!view.roundFinished) {
    if (finalPhase) primary = { label: 'Câu tiếp theo', command: { type: 'next_question' } };
    else if (question.phase === 'showing') {
      primary = {
        label: round.part === 'shared' ? 'Mở chuông' : 'Bắt đầu tính giờ',
        command: { type: 'start_timer' },
      };
    }
  }

  return (
    <>
      {question ? (
        <HostQuestionCard
          question={question}
          label={`Câu ${round.questionNo}`}
          remaining={remaining}
        />
      ) : (
        <p className={`${card} py-6 text-center text-stage-200`}>
          {view.roundFinished
            ? 'Vòng thi đã hết câu hỏi.'
            : 'Bấm “Câu tiếp theo” để hiển thị câu hỏi đầu tiên.'}
        </p>
      )}
      {question?.phase === 'buzzing' && (
        <BuzzInfo view={view} attempted={round.buzz?.attemptedSeats ?? []} />
      )}
      {question && answerer !== null && ['answering', 'judging'].includes(question.phase) && (
        <JudgeBar
          view={view}
          question={question}
          seat={answerer}
          verbal={round.answerMode === 'verbal'}
          busy={busy}
          paused={paused}
          run={run}
        />
      )}
      <ActionRow
        left={
          <>
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
              onClick={onVoid}
              className={outlineButton}
            >
              Hủy câu (câu lỗi)
            </button>
          </>
        }
        right={primary && <PrimaryButton {...primary} busy={busy} paused={paused} run={run} />}
      />
      {round.history.length > 0 && (
        <section aria-labelledby="history-heading" className={card}>
          <h2 id="history-heading" className="text-base font-bold">
            Câu đã chấm
          </h2>
          <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto text-[13px]">
            {round.history.map((item) => (
              <li key={`${item.ref}-${item.seat}`} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 text-stage-200">
                  <b className="text-white">{item.label}</b> · {playerName(view, item.seat)}:{' '}
                  {item.result === 'correct' ? 'Đúng' : item.result === 'wrong' ? 'Sai' : 'Bỏ qua'}
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
    </>
  );
}

export function TiebreakPanel({
  view,
  round,
  busy,
  paused,
  remaining,
  run,
}: HostPanelProps<TiebreakView>) {
  const question = round.question;
  const finalPhase = !question || FINAL.includes(question.phase);
  const answerer = question?.answeringSeat ?? null;
  return (
    <>
      <p className={`${card} text-[15px]`}>
        Hòa điểm dẫn đầu: <b>{round.seats.map((s) => playerName(view, s)).join(', ')}</b>. Người trả
        lời đúng đầu tiên thắng; câu hỏi phụ không tính điểm.
      </p>
      {question && (
        <HostQuestionCard
          question={question}
          label={`Câu hỏi phụ ${round.questionNo}`}
          remaining={remaining}
        />
      )}
      {question?.phase === 'buzzing' && (
        <BuzzInfo view={view} attempted={round.buzz?.attemptedSeats ?? []} />
      )}
      {question && answerer !== null && ['answering', 'judging'].includes(question.phase) && (
        <JudgeBar
          view={view}
          question={question}
          seat={answerer}
          verbal={false}
          busy={busy}
          paused={paused}
          run={run}
        />
      )}
      {!view.roundFinished && (
        <ActionRow
          left={
            <button
              type="button"
              disabled={busy || paused || finalPhase}
              onClick={() => void run({ type: 'skip_question' })}
              className={outlineButton}
            >
              Bỏ qua câu
            </button>
          }
          right={
            finalPhase ? (
              <PrimaryButton
                label="Câu hỏi phụ tiếp theo"
                command={{ type: 'next_question' }}
                busy={busy}
                paused={paused}
                run={run}
              />
            ) : question.phase === 'showing' ? (
              <PrimaryButton
                label="Mở chuông"
                command={{ type: 'start_timer' }}
                busy={busy}
                paused={paused}
                run={run}
              />
            ) : null
          }
        />
      )}
    </>
  );
}

// --- Câu cùng trả lời: bảng câu trả lời theo ghế, Host chấm rồi công bố ---

function VerdictButtons({
  entry,
  phase,
  busy,
  paused,
  run,
  questionRef,
}: {
  entry: SeatAnswerView;
  phase: string;
  busy: boolean;
  paused: boolean;
  run: (command: HostCommand) => Promise<boolean>;
  questionRef: string;
}) {
  if (!entry.answer) return null;
  if (phase === 'revealed') {
    const correct = entry.state === 'correct';
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          void run({ type: 'regrade', questionRef, seat: entry.seat, correct: !correct })
        }
        className="h-8 rounded-md border border-stage-700 px-2 text-xs font-semibold hover:bg-white/5"
      >
        Chấm lại: {correct ? 'Sai' : 'Đúng'}
      </button>
    );
  }
  if (phase !== 'judging') return null;
  const current = entry.verdict ?? entry.suggested;
  return (
    <span className="inline-flex gap-1.5">
      {([true, false] as const).map((value) => {
        const active = current === (value ? 'correct' : 'wrong');
        return (
          <button
            key={String(value)}
            type="button"
            aria-pressed={active}
            disabled={busy || paused}
            onClick={() => void run({ type: 'judge', seat: entry.seat, correct: value })}
            className={`h-8 rounded-md px-2.5 text-xs font-bold ${
              active
                ? value
                  ? 'bg-green-700 text-white'
                  : 'bg-orange-700 text-white'
                : 'border border-stage-700 text-stage-200 hover:bg-white/5'
            }`}
          >
            {value ? 'Đúng' : 'Sai'}
          </button>
        );
      })}
    </span>
  );
}

function resultText(entry: SeatAnswerView): { text: string; tone: string } {
  if (entry.state === 'correct') return { text: '✓ Đúng', tone: 'text-green-300' };
  if (entry.state === 'wrong') return { text: '✕ Sai', tone: 'text-orange-300' };
  if (entry.state === 'skipped') return { text: 'Bỏ qua', tone: 'text-stage-200' };
  if (entry.state === 'none') return { text: 'Chưa trả lời', tone: 'text-stage-200' };
  const v = entry.verdict ?? entry.suggested;
  if (v === 'correct')
    return { text: entry.verdict ? 'Host: Đúng' : '✓ Khớp đáp án', tone: 'text-green-300' };
  if (v === 'wrong')
    return { text: entry.verdict ? 'Host: Sai' : '✕ Không khớp', tone: 'text-orange-300' };
  return { text: 'Cần Host chấm', tone: 'text-amber-200' };
}

/** Bảng câu trả lời theo thứ tự server nhận (HostControlAcceleration). */
function AnswersTable({
  view,
  question,
  busy,
  paused,
  run,
  excluded = [],
}: {
  view: MatchView;
  question: MatchQuestionView;
  busy: boolean;
  paused: boolean;
  run: (command: HostCommand) => Promise<boolean>;
  excluded?: number[];
}) {
  const answered = question.answers
    .filter((a) => a.elapsedMs !== null)
    .sort((a, b) => (a.elapsedMs ?? 0) - (b.elapsedMs ?? 0));
  const rest = question.answers.filter((a) => a.elapsedMs === null);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-[15px]">
        <thead>
          <tr className="text-left text-[13px] text-stage-200">
            <th scope="col" className="p-2 font-semibold">
              Thứ tự
            </th>
            <th scope="col" className="p-2 font-semibold">
              Người chơi
            </th>
            <th scope="col" className="p-2 font-semibold">
              Câu trả lời
            </th>
            <th scope="col" className="p-2 text-right font-semibold">
              Thời gian
            </th>
            <th scope="col" className="p-2 font-semibold">
              Kết quả
            </th>
            <th scope="col" className="p-2 text-right font-semibold">
              Điểm
            </th>
          </tr>
        </thead>
        <tbody>
          {[...answered, ...rest].map((entry, index) => {
            const result = excluded.includes(entry.seat)
              ? { text: 'Bị loại khỏi vòng', tone: 'text-stage-200' }
              : resultText(entry);
            return (
              <tr key={entry.seat} className="border-t border-stage-700">
                <td className="px-2 py-3 font-bold">
                  {entry.elapsedMs !== null ? index + 1 : '—'}
                </td>
                <td className="px-2 py-3">
                  <span className="inline-flex items-center gap-2 font-semibold">
                    <SeatSquare seat={entry.seat} />
                    {playerName(view, entry.seat)}
                  </span>
                </td>
                <td className="px-2 py-3 font-bold">
                  {entry.answer ? describeAnswer(entry.answer, question.options) : 'Không trả lời'}
                </td>
                <td className="px-2 py-3 text-right tabular-nums">
                  {entry.elapsedMs !== null ? formatElapsed(entry.elapsedMs) : '—'}
                </td>
                <td className="px-2 py-3">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={`font-bold ${result.tone}`}>{result.text}</span>
                    <VerdictButtons
                      entry={entry}
                      phase={question.phase}
                      busy={busy}
                      paused={paused}
                      run={run}
                      questionRef={question.ref}
                    />
                  </span>
                </td>
                <td className="px-2 py-3 text-right font-extrabold text-accent-400">
                  {entry.points != null ? (entry.points > 0 ? `+${entry.points}` : '0') : ''}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// --- Tăng tốc ---

export function AccelerationPanel({
  view,
  round,
  busy,
  paused,
  remaining,
  run,
  onVoid,
}: HostPanelProps<AccelerationView>) {
  const question = round.question;
  const finalPhase = !question || FINAL.includes(question.phase);
  return (
    <>
      {question ? (
        <HostQuestionCard
          question={question}
          label={`Câu ${round.questionNo}/${round.questionTotal}`}
          remaining={remaining}
        />
      ) : (
        <p className={`${card} py-6 text-center text-stage-200`}>
          {view.roundFinished ? 'Vòng thi đã hết câu hỏi.' : 'Bấm “Câu tiếp theo” để bắt đầu.'}
        </p>
      )}
      {question && question.phase !== 'showing' && (
        <section aria-labelledby="rank-heading" className={card}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="rank-heading" className="text-base font-bold">
              Câu trả lời theo thứ tự server nhận
            </h2>
            <span className="text-[13px] text-stage-200">
              Điểm: {round.rankPoints.join(' / ')} cho người trả lời đúng
            </span>
          </div>
          <AnswersTable view={view} question={question} busy={busy} paused={paused} run={run} />
          <p className="text-[13px] text-stage-200">
            Thời gian tính từ lúc câu hỏi bắt đầu, theo đồng hồ server. Hai người đúng cùng
            mili-giây nhận cùng mức điểm cao hơn.
          </p>
        </section>
      )}
      <ActionRow
        left={
          <>
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
              onClick={onVoid}
              className={outlineButton}
            >
              Hủy câu (câu lỗi)
            </button>
          </>
        }
        right={
          view.roundFinished ? null : finalPhase ? (
            <PrimaryButton
              label="Câu tiếp theo"
              command={{ type: 'next_question' }}
              busy={busy}
              paused={paused}
              run={run}
            />
          ) : question.phase === 'showing' ? (
            <PrimaryButton
              label="Bắt đầu tính giờ"
              command={{ type: 'start_timer' }}
              busy={busy}
              paused={paused}
              run={run}
            />
          ) : (
            <PrimaryButton
              label={question.phase === 'answering' ? 'Khóa và công bố' : 'Công bố đáp án'}
              command={{ type: 'reveal' }}
              busy={busy}
              paused={paused}
              run={run}
            />
          )
        }
      />
    </>
  );
}

// --- Vượt chướng ngại vật ---

const ROW_STATUS_TEXT: Record<string, { text: string; tone: string }> = {
  closed: { text: 'Chưa mở', tone: 'text-stage-200' },
  active: { text: 'Đang thi', tone: 'text-amber-200' },
  solved: { text: '✓ Đã giải', tone: 'text-green-300' },
  unsolved: { text: 'Không ai đúng', tone: 'text-orange-300' },
  voided: { text: 'Đã hủy', tone: 'text-stage-200' },
};

export function ObstaclePanel({
  view,
  round,
  busy,
  paused,
  remaining,
  run,
  onVoid,
}: HostPanelProps<ObstacleView>) {
  const [piece, setPiece] = useState('1');
  const question = round.question;
  const active = round.phase === 'row' && question !== null;
  const pending = round.guesses.filter((g) => g.state === 'pending');
  const currentRow = round.rows.find((r) => r.index === round.currentRow);
  const rowName = currentRow?.kind === 'center' ? 'ô trung tâm' : `hàng ${round.currentRow ?? ''}`;
  const centerClosed = round.rows.some((r) => r.kind === 'center' && r.status === 'closed');

  return (
    <>
      {pending.map((guess) => (
        <section
          key={guess.seat}
          role="alert"
          className="flex flex-wrap items-center gap-4 rounded-[18px] border-2 border-accent-400 bg-[#3A2A0A] px-5 py-[18px]"
        >
          <div className="min-w-0 flex-[1_1_320px]">
            <h2 className="text-sm font-bold text-amber-300">
              {playerName(view, guess.seat)} (vị trí {guess.seat}) bấm chuông trả lời chướng ngại
              vật
            </h2>
            <p className="mt-1.5 text-[22px] font-extrabold tracking-wider">“{guess.text}”</p>
            <p className="mt-1 text-[13px] text-amber-100">
              {guess.suggested === 'correct'
                ? 'Hệ thống so khớp: khớp từ khóa'
                : 'Hệ thống so khớp: không khớp'}{' '}
              · nếu đúng: +{guess.points} điểm · nếu sai: loại khỏi vòng
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              disabled={busy || paused}
              onClick={() => void run({ type: 'judge_keyword', seat: guess.seat, correct: true })}
              className={correctButton}
            >
              ✓ Xác nhận Đúng
            </button>
            <button
              type="button"
              disabled={busy || paused}
              onClick={() => void run({ type: 'judge_keyword', seat: guess.seat, correct: false })}
              className={wrongButton}
            >
              ✕ Sai
            </button>
          </div>
        </section>
      ))}

      <section aria-labelledby="board-heading" className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="board-heading" className="text-base font-bold">
            Bảng chướng ngại vật
          </h2>
          <span className="text-[13px] text-stage-200">
            Từ khóa: <b className="tracking-[0.15em] text-accent-400">{round.keyword.answer}</b> ·{' '}
            {round.keyword.revealed ? 'đã công bố' : 'chỉ Host thấy'}
          </span>
        </div>
        {round.rows.map((row) => {
          const status = ROW_STATUS_TEXT[row.status]!;
          const isCurrent = row.index === round.currentRow && row.status === 'active';
          const canChoose =
            round.phase === 'choosing' && row.kind === 'row' && row.status === 'closed';
          return (
            <div
              key={row.index}
              className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-3 py-2.5 ${
                isCurrent ? 'border-2 border-accent-400 bg-[#1B3170]' : 'border border-stage-700'
              }`}
            >
              <span className="w-[110px] text-sm font-bold">
                {row.kind === 'center' ? 'Ô trung tâm' : `Hàng ${row.index}`}
              </span>
              <span className="min-w-0 flex-[1_1_240px] text-sm text-stage-200">{row.content}</span>
              <span className="text-[15px] font-extrabold tracking-[0.12em]">{row.answer}</span>
              <span className={`w-[120px] text-right text-xs font-bold ${status.tone}`}>
                {row.status === 'solved'
                  ? `${status.text} · ${row.correctCount} đúng`
                  : status.text}
              </span>
              {canChoose && (
                <button
                  type="button"
                  disabled={busy || paused}
                  onClick={() =>
                    void run({ type: 'choose', choice: { type: 'row', row: row.index } })
                  }
                  className="h-8 rounded-md border border-stage-700 px-2.5 text-xs font-semibold hover:bg-white/5"
                >
                  Mở hàng này
                </button>
              )}
            </div>
          );
        })}
      </section>

      {question && (
        <section aria-labelledby="row-answers" className={card}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2 id="row-answers" className="text-base font-bold">
                Đáp án {rowName} của người chơi
              </h2>
              <p className="mt-1 text-sm text-stage-200">{question.content}</p>
            </div>
            <TimerRing remainingMs={remaining} size="md" />
          </div>
          {question.phase !== 'showing' && (
            <AnswersTable
              view={view}
              question={question}
              busy={busy}
              paused={paused}
              run={run}
              excluded={round.outSeats}
            />
          )}
        </section>
      )}

      <ActionRow
        left={
          <>
            <button
              type="button"
              disabled={busy || paused || !active}
              onClick={() => void run({ type: 'skip_question' })}
              className={outlineButton}
            >
              Bỏ qua hàng
            </button>
            <button
              type="button"
              disabled={busy || paused || !currentRow || currentRow.status === 'voided'}
              onClick={onVoid}
              className={outlineButton}
            >
              Hủy hàng (câu lỗi)
            </button>
          </>
        }
        right={
          view.roundFinished ? null : active && question.phase === 'showing' ? (
            <PrimaryButton
              label="Bắt đầu tính giờ"
              command={{ type: 'start_timer' }}
              busy={busy}
              paused={paused}
              run={run}
            />
          ) : active ? (
            <PrimaryButton
              label={
                question.phase === 'answering' ? 'Khóa và công bố' : `Công bố kết quả ${rowName}`
              }
              command={{ type: 'reveal' }}
              busy={busy}
              paused={paused}
              run={run}
            />
          ) : round.phase === 'choosing' ? (
            <PrimaryButton
              label={
                round.turnSeat !== null ? 'Mở hàng tiếp theo thay người chơi' : 'Mở hàng tiếp theo'
              }
              command={{ type: 'next_question' }}
              busy={busy}
              paused={paused}
              run={run}
            />
          ) : null
        }
      />

      {!round.keyword.revealed && (
        <section aria-labelledby="obstacle-controls" className={card}>
          <h2 id="obstacle-controls" className="text-base font-bold">
            Điều khiển vòng
          </h2>
          <div className="flex flex-wrap items-end gap-2.5">
            <label className="flex flex-col gap-1 text-[13px] font-semibold">
              Mảnh ảnh
              <select
                value={piece}
                onChange={(event) => setPiece(event.target.value)}
                className="h-11 rounded-lg border border-stage-700 bg-stage-900 px-3 text-sm text-white"
              >
                {round.rows.map((row, i) => (
                  <option key={row.index} value={i + 1} disabled={round.pieces[i]}>
                    {row.kind === 'center' ? 'Trung tâm' : `Mảnh ${row.index}`}
                    {round.pieces[i] ? ' (đã mở)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={busy || round.pieces[Number(piece) - 1]}
              onClick={() => void run({ type: 'open_piece', piece: Number(piece) })}
              className={outlineButton}
            >
              Mở mảnh ảnh thủ công
            </button>
            <button
              type="button"
              disabled={busy || paused || !centerClosed || active}
              onClick={() => void run({ type: 'open_center' })}
              className={outlineButton}
            >
              Mở ô trung tâm
            </button>
            <button
              type="button"
              disabled={busy || paused}
              onClick={() => void run({ type: 'reveal_keyword' })}
              className={outlineButton}
            >
              Công bố từ khóa (không ai giải được)
            </button>
          </div>
          <p className="text-[13px] text-stage-200">
            Giải chướng ngại vật lúc này: {round.keyword.points} điểm.
            {round.rowSelection === 'player' &&
              round.turnSeat !== null &&
              ` Lượt chọn hàng: ${playerName(view, round.turnSeat)}.`}
            {round.outSeats.length > 0 &&
              ` Bị loại khỏi vòng: ${round.outSeats.map((s) => playerName(view, s)).join(', ')}.`}
          </p>
        </section>
      )}
    </>
  );
}

// --- Về đích ---

export function FinishPanel({
  view,
  round,
  busy,
  paused,
  remaining,
  run,
  onVoid,
}: HostPanelProps<FinishView>) {
  const question = round.question;
  const finalPhase = !question || FINAL.includes(question.phase);
  const turnName = playerName(view, round.turnSeat);
  const main = question?.answers.find((a) => a.seat === round.turnSeat);
  const steal = round.steal;
  const answerer = question?.answeringSeat ?? null;
  const judging =
    question && answerer !== null && ['answering', 'judging'].includes(question.phase);

  return (
    <>
      {round.phase === 'picking' && (
        <section aria-labelledby="pick-heading" className={card}>
          <h2 id="pick-heading" className="text-base font-bold">
            {turnName} đang chọn gói câu hỏi
          </h2>
          <p className="text-sm text-stage-200">
            Chờ người chơi chọn trên thiết bị, hoặc chọn thay (ví dụ người chơi nói lựa chọn).
          </p>
          <PackPicker
            key={round.turnSeat ?? 0}
            round={round}
            submitLabel={(levels) => `Chọn thay gói ${levels.join(' · ')}`}
            onSubmit={async (levels, star) =>
              (await run({ type: 'choose', choice: { type: 'pack', levels, star } }))
                ? null
                : 'Không chọn được gói.'
            }
          />
        </section>
      )}

      {round.pack && <PackChips pack={round.pack} title={`Gói của ${turnName}`} />}

      {question && (
        <HostQuestionCard
          question={question}
          label={`Câu ${round.questionNo}/${round.questionsPerPlayer}`}
          remaining={remaining}
        />
      )}

      {question && main && main.state !== 'none' && main.state !== 'answered' && (
        <p
          className={`flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 text-[15px] ${
            main.state === 'correct' ? 'bg-[#0F3B2A]' : 'bg-[#3B1D24]'
          }`}
        >
          {turnName}{' '}
          {main.answer ? `trả lời “${describeAnswer(main.answer, question.options)}” – ` : ''}
          <b>{main.state === 'correct' ? 'Đúng' : main.state === 'skipped' ? 'Hết giờ' : 'Sai'}</b>
          {main.points ? ` · ${main.points > 0 ? '+' : ''}${main.points} điểm` : ''}
          {question.phase === 'revealed' && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run({
                  type: 'regrade',
                  questionRef: question.ref,
                  seat: main.seat,
                  correct: main.state !== 'correct',
                })
              }
              className="ml-auto h-9 rounded-lg border border-stage-700 px-3 text-[13px] font-semibold hover:bg-white/5"
            >
              Chấm lại
            </button>
          )}
        </p>
      )}

      {question?.phase === 'buzzing' && steal && (
        <section className="flex flex-wrap items-center gap-4 rounded-[18px] bg-stage-800 px-5 py-4">
          <p className="min-w-0 flex-1 font-semibold text-green-300">
            Mở giành quyền – chờ người chơi bấm chuông. Đúng: +{steal.points}
            {steal.penalty > 0 ? ` · Sai: −${steal.penalty}` : ''}.
          </p>
          <button
            type="button"
            disabled={busy || paused}
            onClick={() => void run({ type: 'close_buzz' })}
            className={outlineButton}
          >
            Không ai giành quyền
          </button>
        </section>
      )}

      {judging && (
        <JudgeBar
          view={view}
          question={question}
          seat={answerer}
          verbal={round.answerMode === 'verbal'}
          busy={busy}
          paused={paused}
          run={run}
          title={
            answerer === round.turnSeat
              ? undefined
              : `${playerName(view, answerer)} (vị trí ${answerer}) giành quyền`
          }
          note={
            answerer !== round.turnSeat && steal
              ? `Đúng: +${steal.points}. Sai: −${steal.penalty}.`
              : undefined
          }
        />
      )}

      {round.phase === 'playing' && (
        <ActionRow
          left={
            <>
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
                onClick={onVoid}
                className={outlineButton}
              >
                Hủy câu (câu lỗi)
              </button>
            </>
          }
          right={
            finalPhase ? (
              <PrimaryButton
                label={
                  round.questionNo >= round.questionsPerPlayer
                    ? 'Lượt tiếp theo'
                    : `Câu ${round.questionNo + 1} của ${turnName}`
                }
                command={{ type: 'next_question' }}
                busy={busy}
                paused={paused}
                run={run}
              />
            ) : question.phase === 'showing' ? (
              <PrimaryButton
                label="Bắt đầu tính giờ"
                command={{ type: 'start_timer' }}
                busy={busy}
                paused={paused}
                run={run}
              />
            ) : null
          }
        />
      )}
    </>
  );
}

/** Thứ tự thi vòng Về đích (cột phải). */
export function FinishOrder({ view, round }: { view: MatchView; round: FinishView }) {
  return (
    <section aria-labelledby="order-heading" className={card}>
      <h2 id="order-heading" className="text-base font-bold">
        Thứ tự thi {round.order.length > 0 && '(điểm thấp thi trước)'}
      </h2>
      <ol className="flex flex-col gap-2 text-[15px]">
        {round.order.map((seat, i) => (
          <li
            key={seat}
            className={`flex justify-between rounded-[10px] px-2.5 py-2 ${
              i === round.turn && round.phase !== 'done'
                ? 'border border-accent-400 bg-[#1B3170]'
                : ''
            }`}
          >
            <span>
              <b>{seat}</b> · {playerName(view, seat)}
            </span>
            <span className="text-stage-200">
              {i < round.turn || round.phase === 'done'
                ? 'Đã thi'
                : i === round.turn
                  ? 'Đang thi'
                  : i === round.turn + 1
                    ? 'Tiếp theo'
                    : 'Chờ'}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
