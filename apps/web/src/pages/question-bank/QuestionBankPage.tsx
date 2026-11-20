import {
  answerTypeSchema,
  type Difficulty,
  difficultySchema,
  MAX_GRADE,
  MIN_GRADE,
  type QuestionListQuery,
  type QuestionView,
  ROUND_KEYS,
  type RoundKey,
} from '@olympia/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Badge, Spinner } from '../../components/Card';
import { PlusIcon } from '../../components/icons';
import { Modal } from '../../components/Modal';
import { SelectField, TextField } from '../../components/TextField';
import {
  ANSWER_TYPE_LABELS,
  DIFFICULTY_LABELS,
  formatDate,
  MEDIA_LABELS,
  publicationLabel,
  ROUND_LABELS,
} from '../../features/question-bank/qb-format';
import {
  setApi,
  useCreateSet,
  useDeleteQuestions,
  usePublicSets,
  useQuestionFacets,
  useQuestions,
  useQuestionSets,
} from '../../features/question-bank/qb-api';
import { errorMessage } from '../../lib/api-client';

type Tab = 'cau-hoi' | 'bo-de' | 'public';
const PAGE_SIZE = 20;

const filterSelect = 'h-11 rounded-lg border border-slate-300 bg-white px-2.5 text-sm';

function DifficultyBars({ level }: { level: Difficulty }) {
  const filled = level === 'easy' ? 1 : level === 'medium' ? 2 : 3;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden="true" className="inline-flex gap-0.5">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={`h-3 w-1.5 rounded-sm ${n <= filled ? 'bg-brand-600' : 'bg-slate-200'}`}
          />
        ))}
      </span>
      {DIFFICULTY_LABELS[level]}
    </span>
  );
}

function questionTypeLabel(question: QuestionView): string {
  const base = ANSWER_TYPE_LABELS[question.answer.type];
  return question.media ? `${base} · ${MEDIA_LABELS[question.media.kind]}` : base;
}

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Chọn bộ đề (và vòng) để thêm các câu hỏi đã chọn. */
function AddToSetDialog({
  questionIds,
  onClose,
  onDone,
}: {
  questionIds: string[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const sets = useQuestionSets();
  const queryClient = useQueryClient();
  const [setId, setSetId] = useState('');
  const [round, setRound] = useState<RoundKey | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const chosen = setId || sets.data?.[0]?.id || '';

  async function submit() {
    if (!chosen) return;
    setSaving(true);
    setError(null);
    try {
      const result = await setApi.append(chosen, questionIds, round || null);
      await queryClient.invalidateQueries({ queryKey: ['question-bank'] });
      onDone(
        result.added > 0
          ? `Đã thêm ${result.added} câu vào bộ “${result.set.name}”.`
          : 'Các câu đã chọn đều có sẵn trong bộ đề.',
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Thêm vào bộ đề"
      description={`${questionIds.length} câu hỏi đã chọn.`}
      onClose={onClose}
    >
      {sets.isPending && <Spinner />}
      {sets.data?.length === 0 && (
        <Alert tone="info">Bạn chưa có bộ đề nào. Tạo bộ đề ở tab “Bộ đề của tôi”.</Alert>
      )}
      {sets.data && sets.data.length > 0 && (
        <div className="flex flex-col gap-4">
          {error && <Alert tone="error">{error}</Alert>}
          <SelectField label="Bộ đề" value={chosen} onChange={(e) => setSetId(e.target.value)}>
            {sets.data.map((set) => (
              <option key={set.id} value={set.id}>
                {set.name} ({set.questionCount} câu)
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Xếp vào vòng"
            value={round}
            onChange={(e) => setRound(e.target.value as RoundKey | '')}
          >
            <option value="">Chưa xếp vòng</option>
            {ROUND_KEYS.map((key) => (
              <option key={key} value={key}>
                {ROUND_LABELS[key]}
              </option>
            ))}
          </SelectField>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={onClose}>
              Hủy
            </Button>
            <Button loading={saving} onClick={() => void submit()}>
              Thêm vào bộ đề
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function QuestionsTab() {
  const facets = useQuestionFacets();
  const deleteQuestions = useDeleteQuestions();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Omit<QuestionListQuery, 'q' | 'page' | 'pageSize'>>({});
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<'add' | 'delete' | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const q = useDebounced(search.trim());
  const questions = useQuestions({ ...filters, q, page, pageSize: PAGE_SIZE });

  const setFilter = (key: keyof typeof filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value || undefined }));
    setPage(1);
  };

  const items = questions.data?.items ?? [];
  const total = questions.data?.total ?? 0;
  const allOnPage = items.length > 0 && items.every((item) => selected.has(item.id));

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((current) => {
      const next = new Set(current);
      for (const item of items) {
        if (allOnPage) next.delete(item.id);
        else next.add(item.id);
      }
      return next;
    });
  }

  function hideSelected() {
    deleteQuestions.mutate([...selected], {
      onSuccess: (result) => {
        setNotice({ tone: 'success', text: `Đã ẩn ${result.deleted} câu hỏi.` });
        setSelected(new Set());
        setDialog(null);
      },
      onError: (error) => {
        setNotice({ tone: 'error', text: errorMessage(error) });
        setDialog(null);
      },
    });
  }

  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-2.5">
        <TextField
          className="min-w-0 flex-[1_1_280px]"
          compactLabel
          label="Tìm kiếm"
          type="search"
          placeholder="Nội dung, đáp án hoặc thẻ"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        {(
          [
            ['subject', 'Môn', facets.data?.subjects.map((s) => [s, s]) ?? []],
            [
              'grade',
              'Lớp',
              Array.from({ length: MAX_GRADE - MIN_GRADE + 1 }, (_, i) => [
                String(i + MIN_GRADE),
                String(i + MIN_GRADE),
              ]),
            ],
            [
              'difficulty',
              'Độ khó',
              difficultySchema.options.map((d) => [d, DIFFICULTY_LABELS[d]]),
            ],
            ['answerType', 'Loại', answerTypeSchema.options.map((t) => [t, ANSWER_TYPE_LABELS[t]])],
            [
              'media',
              'Media',
              [
                ['none', 'Không có'],
                ['image', 'Hình ảnh'],
                ['video', 'Video'],
                ['audio', 'Âm thanh'],
              ],
            ],
            ['round', 'Vòng', ROUND_KEYS.map((r) => [r, ROUND_LABELS[r]])],
          ] as const
        ).map(([key, label, options]) => (
          <div key={key} className="flex flex-col gap-1.5">
            <label htmlFor={`qb-${key}`} className="text-[13px] font-semibold text-slate-700">
              {label}
            </label>
            <select
              id={`qb-${key}`}
              className={filterSelect}
              value={filters[key] === undefined ? '' : String(filters[key])}
              onChange={(e) => setFilter(key, e.target.value)}
            >
              <option value="">Tất cả</option>
              {options.map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-700">
          <span>Đã chọn {selected.size} câu</span>
          <Button size="sm" onClick={() => setDialog('add')}>
            Thêm vào bộ đề
          </Button>
          <button
            type="button"
            onClick={() => setDialog('delete')}
            className="h-9 rounded-lg border border-brand-100 px-3.5 text-sm font-semibold text-brand-700 hover:bg-brand-100"
          >
            Ẩn câu hỏi
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto text-sm font-medium text-brand-700 underline"
          >
            Bỏ chọn
          </button>
        </div>
      )}

      {questions.isPending && <Spinner label="Đang tải câu hỏi…" />}
      {questions.isError && <Alert tone="error">{errorMessage(questions.error)}</Alert>}
      {questions.isSuccess && total === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="font-semibold">
            {q || Object.values(filters).some(Boolean)
              ? 'Không có câu hỏi phù hợp bộ lọc.'
              : 'Ngân hàng của bạn chưa có câu hỏi nào.'}
          </p>
          <Link to="/ngan-hang/cau-hoi/moi" className="mt-2 inline-block text-sm font-semibold">
            Thêm câu hỏi đầu tiên
          </Link>
        </div>
      )}
      {items.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <caption className="sr-only">Câu hỏi trong ngân hàng của bạn</caption>
              <thead>
                <tr className="bg-slate-50 text-left text-slate-600">
                  <th scope="col" className="w-11 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Chọn tất cả câu trên trang"
                      checked={allOnPage}
                      onChange={toggleAll}
                      className="size-[18px] accent-brand-600"
                    />
                  </th>
                  <th scope="col" className="px-2 py-3 font-semibold">
                    Nội dung
                  </th>
                  <th scope="col" className="px-2 py-3 font-semibold">
                    Loại
                  </th>
                  <th scope="col" className="px-2 py-3 font-semibold">
                    Môn · Lớp
                  </th>
                  <th scope="col" className="px-2 py-3 font-semibold">
                    Độ khó
                  </th>
                  <th scope="col" className="px-2 py-3 font-semibold">
                    Vòng phù hợp
                  </th>
                  <th scope="col" className="py-3 pl-2 pr-4">
                    <span className="sr-only">Thao tác</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((question) => (
                  <tr
                    key={question.id}
                    className={`border-t border-slate-100 ${selected.has(question.id) ? 'bg-[#F5F7FF]' : ''}`}
                  >
                    <td className="px-4 py-3.5">
                      <input
                        type="checkbox"
                        aria-label={`Chọn câu: ${question.content}`}
                        checked={selected.has(question.id)}
                        onChange={() => toggle(question.id)}
                        className="size-[18px] accent-brand-600"
                      />
                    </td>
                    <td className="max-w-[420px] px-2 py-3.5">
                      <span className="line-clamp-2 block font-medium leading-snug">
                        {question.content}
                      </span>
                      {question.tags.length > 0 && (
                        <span className="text-xs text-slate-600">{question.tags.join(' · ')}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3.5">{questionTypeLabel(question)}</td>
                    <td className="whitespace-nowrap px-2 py-3.5">
                      {[question.subject, question.grade].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="px-2 py-3.5">
                      {question.difficulty ? <DifficultyBars level={question.difficulty} /> : '—'}
                    </td>
                    <td className="px-2 py-3.5 text-slate-700">
                      {question.rounds.map((r) => ROUND_LABELS[r]).join(', ') || '—'}
                    </td>
                    <td className="py-3.5 pl-2 pr-4">
                      <Link
                        to={`/ngan-hang/cau-hoi/${question.id}`}
                        className="font-semibold"
                        aria-label={`Sửa câu: ${question.content}`}
                      >
                        Sửa
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
            <p>
              Hiển thị {from}–{to} trong {total} câu hỏi
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Trang trước
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={to >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Trang sau
              </Button>
            </div>
          </div>
        </>
      )}

      {dialog === 'add' && (
        <AddToSetDialog
          questionIds={[...selected]}
          onClose={() => setDialog(null)}
          onDone={(message) => {
            setNotice({ tone: 'success', text: message });
            setSelected(new Set());
            setDialog(null);
          }}
        />
      )}
      {dialog === 'delete' && (
        <Modal
          title={`Ẩn ${selected.size} câu hỏi?`}
          description="Câu hỏi bị ẩn khỏi ngân hàng và gỡ khỏi các bộ đề đang soạn. Lịch sử trận và bộ public đã gửi duyệt không bị ảnh hưởng."
          onClose={() => setDialog(null)}
        >
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setDialog(null)}>
              Hủy
            </Button>
            <Button variant="danger" loading={deleteQuestions.isPending} onClick={hideSelected}>
              Ẩn câu hỏi
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function CreateSetDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const createSet = useCreateSet();
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal title="Tạo bộ đề" onClose={onClose}>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          createSet.mutate(
            { name, subject },
            {
              onSuccess: (set) => void navigate(`/ngan-hang/bo-de/${set.id}`),
              onError: (err) => setError(errorMessage(err)),
            },
          );
        }}
      >
        {error && <Alert tone="error">{error}</Alert>}
        <TextField
          label="Tên bộ đề"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
        />
        <TextField
          label="Môn học (tùy chọn)"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={50}
        />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" loading={createSet.isPending}>
            Tạo bộ đề
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function SetsTab() {
  const sets = useQuestionSets();
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Bộ đề nhóm câu hỏi theo vòng để dùng trong kịch bản trận và chia sẻ public.
        </p>
        <Button variant="secondary" onClick={() => setCreating(true)}>
          <PlusIcon />
          Tạo bộ đề
        </Button>
      </div>
      {sets.isPending && <Spinner label="Đang tải bộ đề…" />}
      {sets.isError && <Alert tone="error">{errorMessage(sets.error)}</Alert>}
      {sets.data?.length === 0 && (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
          Bạn chưa có bộ đề nào.
        </p>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-4">
        {sets.data?.map((set) => {
          const status = publicationLabel(set.publication);
          return (
            <Link
              key={set.id}
              to={`/ngan-hang/bo-de/${set.id}`}
              className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 no-underline hover:border-brand-600 hover:text-slate-900 hover:no-underline"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-[17px] font-bold leading-snug">{set.name}</h3>
                <Badge tone={status.tone}>{status.text}</Badge>
              </div>
              <p className="text-sm text-slate-600">
                {set.questionCount} câu
                {set.subject ? ` · ${set.subject}` : ''}
                {set.grade ? ` · Lớp ${set.grade}` : ''}
              </p>
              <p className="flex flex-wrap gap-1.5 text-xs">
                {ROUND_KEYS.filter((r) => set.roundCounts[r]).map((r) => (
                  <span key={r} className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-700">
                    {ROUND_LABELS[r]} {set.roundCounts[r]}
                  </span>
                ))}
              </p>
              <p className="mt-auto text-xs text-slate-500">Cập nhật {formatDate(set.updatedAt)}</p>
            </Link>
          );
        })}
      </div>
      {creating && <CreateSetDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function PublicTab() {
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const sets = usePublicSets(q);

  return (
    <div className="flex flex-col gap-5">
      <TextField
        className="max-w-md"
        compactLabel
        label="Tìm bộ public"
        type="search"
        placeholder="Tên bộ câu hỏi"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {sets.isPending && <Spinner label="Đang tải bộ public…" />}
      {sets.isError && <Alert tone="error">{errorMessage(sets.error)}</Alert>}
      {sets.data?.length === 0 && (
        <p className="text-sm text-slate-600">Chưa có bộ câu hỏi public phù hợp.</p>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-4">
        {sets.data?.map((set) => (
          <Link
            key={set.versionId}
            to={`/ngan-hang/bo-public/${set.versionId}`}
            className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 no-underline hover:border-brand-600 hover:text-slate-900 hover:no-underline"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-[17px] font-bold leading-snug">{set.name}</h3>
              {set.mine && <Badge tone="brand">Của bạn</Badge>}
            </div>
            <p className="text-sm text-slate-600">
              {set.ownerName} · {set.questionCount} câu
              {set.subject ? ` · ${set.subject}` : ''}
              {set.grade ? ` · Lớp ${set.grade}` : ''}
            </p>
            <p className="mt-auto text-xs text-slate-500">
              Phiên bản {set.versionNo} · duyệt {formatDate(set.approvedAt)}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Ngân hàng câu hỏi (màn QuestionBank): câu hỏi của tôi, bộ đề của tôi, bộ public. */
export function QuestionBankPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'cau-hoi';
  const facets = useQuestionFacets();
  const questionCount = facets.data?.total ?? null;
  const sets = useQuestionSets();
  const publicSets = usePublicSets('');

  const tabs: { value: Tab; label: string }[] = [
    { value: 'cau-hoi', label: `Của tôi${questionCount !== null ? ` · ${questionCount}` : ''}` },
    { value: 'bo-de', label: `Bộ đề${sets.data ? ` · ${sets.data.length}` : ''}` },
    {
      value: 'public',
      label: `Bộ public${publicSets.data ? ` · ${publicSets.data.length} bộ` : ''}`,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[28px] font-bold leading-tight">Ngân hàng câu hỏi</h1>
        <Link
          to="/ngan-hang/cau-hoi/moi"
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-5 text-[15px] font-semibold text-white no-underline hover:bg-brand-700 hover:text-white hover:no-underline"
        >
          <PlusIcon />
          Thêm câu hỏi
        </Link>
      </header>

      <div
        role="tablist"
        aria-label="Nguồn câu hỏi"
        className="flex gap-6 overflow-x-auto border-b border-slate-200"
      >
        {tabs.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            id={`tab-${item.value}`}
            aria-selected={tab === item.value}
            aria-controls={`panel-${item.value}`}
            onClick={() => setParams(item.value === 'cau-hoi' ? {} : { tab: item.value })}
            className={`h-11 shrink-0 border-b-[3px] text-[15px] ${
              tab === item.value
                ? 'border-brand-600 font-bold text-slate-900'
                : 'border-transparent font-medium text-slate-600 hover:text-slate-900'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'cau-hoi' && <QuestionsTab />}
        {tab === 'bo-de' && <SetsTab />}
        {tab === 'public' && <PublicTab />}
      </div>
    </div>
  );
}
