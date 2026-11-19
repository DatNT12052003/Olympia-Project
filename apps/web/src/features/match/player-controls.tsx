import { OPTION_LETTERS, type MatchQuestionView, type PlayerAnswer } from '@olympia/shared';
import { type FormEvent, useEffect, useState } from 'react';
import { BellIcon } from '../../components/icons';

/** Điều khiển trả lời của Player dùng chung cho các vòng (PlayerAnswer, PlayerBuzz). */

/** Ô chọn đáp án (60px, chạm dễ trên điện thoại) và gửi đáp án; phím 1–6 chọn, Enter gửi. */
export function AnswerForm({
  question,
  onSubmit,
  submitText = 'Gửi đáp án',
  fieldLabel = 'Câu trả lời của bạn',
}: {
  question: MatchQuestionView;
  onSubmit: (answer: PlayerAnswer) => Promise<string | null>;
  submitText?: string;
  fieldLabel?: string;
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
          <span className="text-sm font-semibold text-stage-200">{fieldLabel}</span>
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
          {pending ? 'Đang gửi…' : `${submitText}${label}`}
        </button>
      </div>
    </form>
  );
}

/** Nút bấm chuông (màn PlayerBuzz); phím Space trên máy tính. */
export function BuzzButton({
  onBuzz,
  label = 'BẤM CHUÔNG',
  hint = 'Người bấm đầu tiên (theo thời điểm server nhận) được quyền trả lời.',
}: {
  onBuzz: () => Promise<string | null>;
  label?: string;
  hint?: string;
}) {
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
        {label}
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
          {hint}
        </p>
        <p role="status" className="min-h-5 text-sm font-semibold text-orange-300">
          {message}
        </p>
      </div>
    </div>
  );
}
