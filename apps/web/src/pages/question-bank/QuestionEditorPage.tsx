import {
  type AnswerType,
  answerTypeSchema,
  type Difficulty,
  difficultySchema,
  matchShortAnswer,
  MAX_ACCEPTED_ANSWERS,
  MAX_GRADE,
  MCQ_MAX_OPTIONS,
  MCQ_MIN_OPTIONS,
  type MediaView,
  MIN_GRADE,
  type QuestionAnswer,
  questionInputSchema,
  type QuestionView,
  ROUND_KEYS,
  type RoundKey,
} from '@olympia/shared';
import { type DragEvent, type ReactNode, useId, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Spinner, Wordmark } from '../../components/Card';
import { ChevronLeftIcon, CloseIcon, PlusIcon } from '../../components/icons';
import { TextField } from '../../components/TextField';
import {
  mediaProblem,
  uploadMedia,
  useQuestion,
  useQuestionFacets,
  useSaveQuestion,
} from '../../features/question-bank/qb-api';
import {
  ANSWER_TYPE_LABELS,
  DIFFICULTY_LABELS,
  OPTION_KEYS,
  ROUND_LABELS,
} from '../../features/question-bank/qb-format';
import { errorMessage } from '../../lib/api-client';
import { apiFieldErrors, type FieldErrors } from '../../lib/form-errors';
import { usePublicSettings } from '../../features/system/use-public-settings';

interface FormState {
  answerType: AnswerType;
  content: string;
  options: string[];
  correctIndex: number;
  tfCorrect: boolean;
  shortAnswer: string;
  accepted: string[];
  ignoreDiacritics: boolean;
  explanation: string;
  media: MediaView | null;
  subject: string;
  topic: string;
  grade: string;
  difficulty: Difficulty | '';
  points: string;
  time: string;
  rounds: RoundKey[];
  tags: string;
}

const EMPTY: FormState = {
  answerType: 'mcq',
  content: '',
  options: ['', '', '', ''],
  correctIndex: 0,
  tfCorrect: true,
  shortAnswer: '',
  accepted: [],
  ignoreDiacritics: false,
  explanation: '',
  media: null,
  subject: '',
  topic: '',
  grade: '',
  difficulty: '',
  points: '',
  time: '',
  rounds: [],
  tags: '',
};

function fromQuestion(q: QuestionView): FormState {
  const base: FormState = {
    ...EMPTY,
    answerType: q.answer.type,
    content: q.content,
    explanation: q.explanation ?? '',
    media: q.media,
    subject: q.subject ?? '',
    topic: q.topic ?? '',
    grade: q.grade ? String(q.grade) : '',
    difficulty: q.difficulty ?? '',
    points: q.defaultPoints !== null ? String(q.defaultPoints) : '',
    time: q.defaultTimeSeconds !== null ? String(q.defaultTimeSeconds) : '',
    rounds: q.rounds,
    tags: q.tags.join(', '),
  };
  if (q.answer.type === 'mcq')
    return { ...base, options: q.answer.options, correctIndex: q.answer.correctIndex };
  if (q.answer.type === 'true_false') return { ...base, tfCorrect: q.answer.correct };
  return {
    ...base,
    shortAnswer: q.answer.answer,
    accepted: q.answer.acceptedAnswers,
    ignoreDiacritics: q.answer.ignoreDiacritics,
  };
}

function toAnswer(form: FormState): QuestionAnswer {
  switch (form.answerType) {
    case 'mcq':
      return { type: 'mcq', options: form.options, correctIndex: form.correctIndex };
    case 'true_false':
      return { type: 'true_false', correct: form.tfCorrect };
    case 'short_answer':
      return {
        type: 'short_answer',
        answer: form.shortAnswer,
        acceptedAnswers: form.accepted.filter((a) => a.trim().length > 0),
        ignoreDiacritics: form.ignoreDiacritics,
      };
  }
}

const numberOrNull = (value: string) => (value.trim() === '' ? null : Number(value));

function toInput(form: FormState) {
  return {
    content: form.content,
    answer: toAnswer(form),
    explanation: form.explanation,
    mediaId: form.media?.id ?? null,
    subject: form.subject,
    topic: form.topic,
    grade: numberOrNull(form.grade),
    difficulty: form.difficulty || null,
    rounds: form.rounds,
    defaultPoints: numberOrNull(form.points),
    defaultTimeSeconds: numberOrNull(form.time),
    tags: form.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
  };
}

/** Dung lượng dễ đọc: KB cho tệp nhỏ, MB cho tệp lớn. */
function toMb(bytes: number): number {
  return Math.round(bytes / (1024 * 1024));
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function MediaPicker({
  media,
  onChange,
}: {
  media: MediaView | null;
  onChange: (media: MediaView | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const { mediaMaxBytes } = usePublicSettings();

  async function handle(file: File | undefined) {
    if (!file) return;
    setError(null);
    const problem = mediaProblem(file, mediaMaxBytes);
    if (problem) {
      setError(problem);
      return;
    }
    setUploading(true);
    try {
      onChange(await uploadMedia(file));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void handle(event.dataTransfer.files[0]);
  }

  if (media) {
    return (
      <div className="flex flex-wrap items-start gap-4 rounded-xl border border-slate-200 p-3">
        {media.kind === 'image' && (
          <img
            src={media.url}
            alt="Hình ảnh đính kèm câu hỏi"
            className="max-h-48 rounded-lg object-contain"
          />
        )}
        {media.kind === 'video' && (
          <video src={media.url} controls className="max-h-48 rounded-lg">
            <track kind="captions" />
          </video>
        )}
        {media.kind === 'audio' && <audio src={media.url} controls />}
        <div className="flex flex-col gap-2 text-sm text-slate-600">
          <span>{formatSize(media.sizeBytes)}</span>
          <Button variant="secondary" size="sm" onClick={() => onChange(null)}>
            Gỡ media
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-wrap items-center gap-4 rounded-xl border-2 border-dashed p-4 ${
          dragging ? 'border-brand-600 bg-brand-50' : 'border-slate-300'
        }`}
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#475569"
          strokeWidth="1.75"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
        <span className="flex-[1_1_240px] text-sm text-slate-600">
          {uploading
            ? 'Đang tải tệp lên…'
            : `Kéo thả hình ảnh, video hoặc âm thanh vào đây. Ảnh ≤ ${toMb(mediaMaxBytes.image)} MB (JPG, PNG, WEBP), video ≤ ${toMb(mediaMaxBytes.video)} MB (MP4), âm thanh ≤ ${toMb(mediaMaxBytes.audio)} MB (MP3).`}
        </span>
        <Button
          variant="secondary"
          size="sm"
          loading={uploading}
          loadingText="Đang tải…"
          onClick={() => inputRef.current?.click()}
        >
          Chọn tệp
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,audio/mpeg"
          className="sr-only"
          aria-label="Chọn tệp media"
          onChange={(event) => void handle(event.target.files?.[0])}
        />
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-orange-800">
          {error}
        </p>
      )}
    </div>
  );
}

function ShortAnswerTester({ form }: { form: FormState }) {
  const [attempt, setAttempt] = useState('');
  const id = useId();
  if (!form.shortAnswer.trim()) return null;
  const matched = matchShortAnswer(attempt, {
    answer: form.shortAnswer,
    acceptedAnswers: form.accepted,
    ignoreDiacritics: form.ignoreDiacritics,
  });
  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-slate-50 p-3">
      <label htmlFor={id} className="text-[13px] font-semibold text-slate-700">
        Thử câu trả lời của người chơi
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <input
          id={id}
          value={attempt}
          onChange={(e) => setAttempt(e.target.value)}
          className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm"
        />
        {attempt.trim() && (
          <span
            aria-live="polite"
            className={`text-sm font-semibold ${matched ? 'text-green-700' : 'text-orange-800'}`}
          >
            {matched ? '✓ Khớp đáp án' : 'Không khớp – chờ Host xác nhận'}
          </span>
        )}
      </div>
    </div>
  );
}

function AnswerEditor({
  form,
  set,
  error,
}: {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  error: string | undefined;
}) {
  if (form.answerType === 'mcq') {
    return (
      <Section
        title="Phương án trả lời"
        aside={
          <span className="text-[13px] text-slate-600">
            Chọn đúng 1 đáp án · {MCQ_MIN_OPTIONS}–{MCQ_MAX_OPTIONS} phương án
          </span>
        }
      >
        <fieldset className="flex flex-col gap-3">
          <legend className="sr-only">Phương án và đáp án đúng</legend>
          {form.options.map((option, index) => {
            const correct = index === form.correctIndex;
            const key = OPTION_KEYS[index] ?? String(index + 1);
            return (
              <div
                key={index}
                className={`flex items-center gap-3 rounded-xl p-2 ${
                  correct ? 'border-2 border-green-700 bg-green-50' : 'border border-slate-200'
                }`}
              >
                <label className="flex min-h-11 cursor-pointer items-center gap-2 px-1.5">
                  <input
                    type="radio"
                    name="correct"
                    checked={correct}
                    onChange={() => set('correctIndex', index)}
                    aria-label={`Phương án ${key} là đáp án đúng`}
                    className="size-5 accent-green-700"
                  />
                  <span className="w-[18px] font-extrabold">{key}</span>
                </label>
                <input
                  aria-label={`Phương án ${key}`}
                  value={option}
                  maxLength={300}
                  onChange={(e) =>
                    set(
                      'options',
                      form.options.map((o, i) => (i === index ? e.target.value : o)),
                    )
                  }
                  className="h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-[15px]"
                />
                {correct && (
                  <span className="hidden w-24 text-[13px] font-semibold text-green-800 sm:inline">
                    Đáp án đúng
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`Xóa phương án ${key}`}
                  disabled={form.options.length <= MCQ_MIN_OPTIONS}
                  onClick={() => {
                    // Xóa đúng đáp án đúng thì chọn lại phương án đầu; xóa phía trước thì lùi chỉ số.
                    const nextCorrect =
                      form.correctIndex === index
                        ? 0
                        : form.correctIndex > index
                          ? form.correctIndex - 1
                          : form.correctIndex;
                    set(
                      'options',
                      form.options.filter((_, i) => i !== index),
                    );
                    set('correctIndex', nextCorrect);
                  }}
                  className="flex size-11 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                >
                  <CloseIcon />
                </button>
              </div>
            );
          })}
        </fieldset>
        {form.options.length < MCQ_MAX_OPTIONS && (
          <button
            type="button"
            onClick={() => set('options', [...form.options, ''])}
            className="inline-flex h-10 items-center gap-1.5 self-start text-sm font-semibold text-brand-600"
          >
            <PlusIcon size={16} />
            Thêm phương án
          </button>
        )}
        {error && <p className="text-[13px] text-orange-800">{error}</p>}
      </Section>
    );
  }

  if (form.answerType === 'true_false') {
    return (
      <Section title="Đáp án">
        <fieldset className="grid grid-cols-2 gap-3">
          <legend className="sr-only">Mệnh đề đúng hay sai</legend>
          {[true, false].map((value) => (
            <label
              key={String(value)}
              className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-4 ${
                form.tfCorrect === value
                  ? 'border-2 border-green-700 bg-green-50'
                  : 'border border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="tf"
                checked={form.tfCorrect === value}
                onChange={() => set('tfCorrect', value)}
                className="size-5 accent-green-700"
              />
              <span className="font-semibold">{value ? 'Đúng' : 'Sai'}</span>
            </label>
          ))}
        </fieldset>
      </Section>
    );
  }

  return (
    <Section title="Đáp án">
      <TextField
        label="Đáp án chuẩn *"
        value={form.shortAnswer}
        maxLength={200}
        onChange={(e) => set('shortAnswer', e.target.value)}
        error={error}
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">Các đáp án chấp nhận</legend>
        {form.accepted.map((value, index) => (
          <div key={index} className="flex gap-2">
            <input
              aria-label={`Đáp án chấp nhận ${index + 1}`}
              value={value}
              maxLength={200}
              onChange={(e) =>
                set(
                  'accepted',
                  form.accepted.map((a, i) => (i === index ? e.target.value : a)),
                )
              }
              className="h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-[15px]"
            />
            <button
              type="button"
              aria-label={`Xóa đáp án chấp nhận ${index + 1}`}
              onClick={() =>
                set(
                  'accepted',
                  form.accepted.filter((_, i) => i !== index),
                )
              }
              className="flex size-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
            >
              <CloseIcon />
            </button>
          </div>
        ))}
        {form.accepted.length < MAX_ACCEPTED_ANSWERS && (
          <button
            type="button"
            onClick={() => set('accepted', [...form.accepted, ''])}
            className="inline-flex h-10 items-center gap-1.5 self-start text-sm font-semibold text-brand-600"
          >
            <PlusIcon size={16} />
            Thêm đáp án tương đương
          </button>
        )}
      </fieldset>
      <label className="flex items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={form.ignoreDiacritics}
          onChange={(e) => set('ignoreDiacritics', e.target.checked)}
          className="size-[18px] accent-brand-600"
        />
        Chấp nhận câu trả lời không dấu (ví dụ “ha noi” = “Hà Nội”)
      </label>
      <p className="text-[13px] text-slate-600">
        Khi chấm, hệ thống bỏ khoảng trắng thừa và không phân biệt hoa/thường. Câu trả lời không
        khớp sẽ chờ Host xác nhận.
      </p>
      <ShortAnswerTester form={form} />
    </Section>
  );
}

function Preview({ form }: { form: FormState }) {
  return (
    <section
      aria-label="Xem trước trên màn hình người chơi"
      className="flex flex-col gap-3 rounded-2xl bg-stage-900 p-5 text-white"
    >
      <span className="text-xs font-semibold uppercase tracking-wider text-stage-200">
        Xem trước
      </span>
      {form.media?.kind === 'image' && (
        <img src={form.media.url} alt="" className="max-h-40 rounded-lg object-contain" />
      )}
      <p className="whitespace-pre-line text-base font-semibold leading-snug">
        {form.content || 'Nội dung câu hỏi sẽ hiện ở đây.'}
      </p>
      {form.answerType === 'mcq' && (
        <div className="grid grid-cols-2 gap-2 text-sm">
          {form.options.map((option, index) => (
            <span key={index} className="rounded-lg bg-stage-800 px-3 py-2.5">
              <b className="text-accent-400">{OPTION_KEYS[index]}</b> {option}
            </span>
          ))}
        </div>
      )}
      {form.answerType === 'true_false' && (
        <div className="grid grid-cols-2 gap-2 text-sm">
          <span className="rounded-lg bg-stage-800 px-3 py-2.5 text-center">Đúng</span>
          <span className="rounded-lg bg-stage-800 px-3 py-2.5 text-center">Sai</span>
        </div>
      )}
      {form.answerType === 'short_answer' && (
        <span className="rounded-lg border border-stage-700 bg-stage-800 px-3 py-2.5 text-sm text-stage-200">
          Ô nhập câu trả lời
        </span>
      )}
    </section>
  );
}

function QuestionForm({ question }: { question?: QuestionView }) {
  const navigate = useNavigate();
  const facets = useQuestionFacets();
  const save = useSaveQuestion(question?.id);
  const [form, setForm] = useState<FormState>(question ? fromQuestion(question) : EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const subjectsId = useId();

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  function submit() {
    setFormError(null);
    const parsed = questionInputSchema.safeParse(toInput(form));
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? '');
        next[key] ??= issue.message;
      }
      setErrors(next);
      setFormError('Vui lòng kiểm tra lại các trường được đánh dấu.');
      return;
    }
    setErrors({});
    save.mutate(parsed.data, {
      onSuccess: () => void navigate('/ngan-hang'),
      onError: (error) => {
        setErrors(apiFieldErrors(error));
        setFormError(errorMessage(error));
      },
    });
  }

  const numberField = 'h-11 min-w-0 rounded-lg border border-slate-300 px-2.5 text-sm';

  return (
    <>
      <header className="bg-stage-900 text-white">
        <div className="mx-auto flex min-h-16 max-w-[1240px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <Link to="/" className="hover:no-underline" aria-label="Olympia Online – trang chủ">
            <Wordmark className="text-xl" />
          </Link>
          <Link
            to="/ngan-hang"
            className="inline-flex items-center gap-1.5 text-sm text-stage-200 no-underline hover:text-white"
          >
            <ChevronLeftIcon size={16} />
            Ngân hàng câu hỏi
          </Link>
          <div className="ml-auto flex gap-2.5">
            <Link
              to="/ngan-hang"
              className="inline-flex h-10 items-center rounded-lg border border-stage-700 px-4 text-sm font-semibold text-white no-underline hover:bg-white/5 hover:text-white hover:no-underline"
            >
              Hủy
            </Link>
            <Button
              variant="stage"
              className="h-10"
              loading={save.isPending}
              loadingText="Đang lưu…"
              onClick={submit}
            >
              Lưu câu hỏi
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] px-4 pb-12 pt-7 sm:px-6">
        <h1 className="mb-5 text-[26px] font-bold">{question ? 'Sửa câu hỏi' : 'Thêm câu hỏi'}</h1>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          className="flex flex-wrap items-start gap-6"
        >
          <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
            {formError && <Alert tone="error">{formError}</Alert>}
            <Section title="Câu hỏi">
              <fieldset>
                <legend className="mb-2 text-sm font-semibold">Dạng đáp án</legend>
                <div className="flex flex-wrap gap-2">
                  {answerTypeSchema.options.map((type) => (
                    <label
                      key={type}
                      className={`inline-flex h-10 cursor-pointer items-center rounded-full px-3.5 text-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-600 ${
                        form.answerType === type
                          ? 'bg-brand-600 font-semibold text-white'
                          : 'border border-slate-300 font-medium'
                      }`}
                    >
                      <input
                        type="radio"
                        name="answerType"
                        className="sr-only"
                        checked={form.answerType === type}
                        onChange={() => set('answerType', type)}
                      />
                      {ANSWER_TYPE_LABELS[type]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="q-content" className="text-sm font-semibold">
                  Nội dung câu hỏi <span className="text-orange-800">*</span>
                </label>
                <textarea
                  id="q-content"
                  rows={3}
                  maxLength={2000}
                  value={form.content}
                  onChange={(e) => set('content', e.target.value)}
                  aria-invalid={errors.content ? true : undefined}
                  aria-describedby={errors.content ? 'q-content-error' : undefined}
                  className={`resize-y rounded-lg px-3.5 py-3 text-base ${
                    errors.content ? 'border-2 border-orange-700' : 'border border-slate-300'
                  }`}
                />
                {errors.content && (
                  <p id="q-content-error" className="text-[13px] text-orange-800">
                    {errors.content}
                  </p>
                )}
              </div>
              <MediaPicker media={form.media} onChange={(media) => set('media', media)} />
            </Section>

            <AnswerEditor form={form} set={set} error={errors.answer} />

            <Section title="Giải thích">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="q-explain" className="text-sm font-semibold">
                  Giải thích (hiện sau khi công bố đáp án)
                </label>
                <textarea
                  id="q-explain"
                  rows={2}
                  maxLength={2000}
                  value={form.explanation}
                  onChange={(e) => set('explanation', e.target.value)}
                  className="resize-y rounded-lg border border-slate-300 px-3.5 py-2.5 text-[15px]"
                />
              </div>
            </Section>
          </div>

          <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-5">
            <Section title="Phân loại">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="q-subject" className="text-[13px] font-semibold">
                    Môn
                  </label>
                  <input
                    id="q-subject"
                    list={subjectsId}
                    maxLength={50}
                    value={form.subject}
                    onChange={(e) => set('subject', e.target.value)}
                    className={numberField}
                  />
                  <datalist id={subjectsId}>
                    {facets.data?.subjects.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="q-grade" className="text-[13px] font-semibold">
                    Lớp
                  </label>
                  <select
                    id="q-grade"
                    value={form.grade}
                    onChange={(e) => set('grade', e.target.value)}
                    className={`${numberField} bg-white`}
                  >
                    <option value="">—</option>
                    {Array.from({ length: MAX_GRADE - MIN_GRADE + 1 }, (_, i) => i + MIN_GRADE).map(
                      (g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ),
                    )}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="q-topic" className="text-[13px] font-semibold">
                    Chủ đề
                  </label>
                  <input
                    id="q-topic"
                    maxLength={100}
                    value={form.topic}
                    onChange={(e) => set('topic', e.target.value)}
                    className={numberField}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="q-level" className="text-[13px] font-semibold">
                    Độ khó
                  </label>
                  <select
                    id="q-level"
                    value={form.difficulty}
                    onChange={(e) => set('difficulty', e.target.value as Difficulty | '')}
                    className={`${numberField} bg-white`}
                  >
                    <option value="">—</option>
                    {difficultySchema.options.map((d) => (
                      <option key={d} value={d}>
                        {DIFFICULTY_LABELS[d]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="q-points" className="text-[13px] font-semibold">
                    Điểm mặc định
                  </label>
                  <input
                    id="q-points"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={form.points}
                    onChange={(e) => set('points', e.target.value)}
                    className={numberField}
                  />
                  {errors.defaultPoints && (
                    <p className="text-xs text-orange-800">{errors.defaultPoints}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="q-time" className="text-[13px] font-semibold">
                    Thời gian (giây)
                  </label>
                  <input
                    id="q-time"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={form.time}
                    onChange={(e) => set('time', e.target.value)}
                    className={numberField}
                  />
                  {errors.defaultTimeSeconds && (
                    <p className="text-xs text-orange-800">{errors.defaultTimeSeconds}</p>
                  )}
                </div>
              </div>
              <fieldset>
                <legend className="mb-2 text-[13px] font-semibold">Vòng phù hợp</legend>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {ROUND_KEYS.map((round) => (
                    <label key={round} className="flex min-h-8 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={form.rounds.includes(round)}
                        onChange={(e) =>
                          set(
                            'rounds',
                            e.target.checked
                              ? [...form.rounds, round]
                              : form.rounds.filter((r) => r !== round),
                          )
                        }
                        className="size-[18px] accent-brand-600"
                      />
                      {ROUND_LABELS[round]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <TextField
                compactLabel
                label="Thẻ"
                hint="Phân tách bằng dấu phẩy, tối đa 10 thẻ."
                value={form.tags}
                onChange={(e) => set('tags', e.target.value)}
                error={errors.tags}
              />
            </Section>
            <Preview form={form} />
          </aside>
        </form>
      </main>
    </>
  );
}

/** Thêm (`/ngan-hang/cau-hoi/moi`) hoặc sửa câu hỏi (màn QuestionEditor). */
export function QuestionEditorPage() {
  const { questionId } = useParams();
  const question = useQuestion(questionId);

  return (
    <div className="min-h-dvh bg-canvas text-slate-900">
      {questionId && question.isPending && <Spinner />}
      {questionId && question.isError && (
        <div className="mx-auto max-w-xl p-6">
          <Alert tone="error">{errorMessage(question.error)}</Alert>
        </div>
      )}
      {(!questionId || question.data) && (
        <QuestionForm key={questionId ?? 'new'} question={question.data} />
      )}
    </div>
  );
}
