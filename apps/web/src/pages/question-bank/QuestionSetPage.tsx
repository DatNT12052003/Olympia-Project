import {
  type Difficulty,
  difficultySchema,
  type QuestionSetDetail,
  ROUND_KEYS,
  type RoundKey,
} from '@olympia/shared';
import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Badge, Spinner } from '../../components/Card';
import { ChevronLeftIcon } from '../../components/icons';
import { Modal } from '../../components/Modal';
import { SelectField, TextField } from '../../components/TextField';
import { QuestionSummary } from '../../features/question-bank/QuestionSummary';
import {
  qbKeys,
  setApi,
  useQuestionFacets,
  useQuestionSet,
} from '../../features/question-bank/qb-api';
import {
  DIFFICULTY_LABELS,
  formatDate,
  publicationLabel,
  ROUND_LABELS,
} from '../../features/question-bank/qb-format';
import { errorMessage } from '../../lib/api-client';

type Item = QuestionSetDetail['items'][number];
type Dialog = 'edit' | 'random' | 'delete' | 'unpublish' | null;

const GROUPS: (RoundKey | null)[] = [...ROUND_KEYS, null];

function groupLabel(round: RoundKey | null): string {
  return round ? ROUND_LABELS[round] : 'Chưa xếp vòng';
}

function EditSetDialog({
  set,
  onClose,
  onSaved,
}: {
  set: QuestionSetDetail;
  onClose: () => void;
  onSaved: (set: QuestionSetDetail) => void;
}) {
  const [name, setName] = useState(set.name);
  const [description, setDescription] = useState(set.description ?? '');
  const [subject, setSubject] = useState(set.subject ?? '');
  const [grade, setGrade] = useState(set.grade ? String(set.grade) : '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      onSaved(
        await setApi.update(set.id, {
          name,
          description,
          subject,
          grade: grade ? Number(grade) : null,
        }),
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Thông tin bộ đề" onClose={onClose}>
      <form noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
        {error && <Alert tone="error">{error}</Alert>}
        <TextField
          label="Tên bộ đề"
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
        />
        <TextField
          label="Mô tả"
          value={description}
          maxLength={500}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Môn"
            value={subject}
            maxLength={50}
            onChange={(e) => setSubject(e.target.value)}
          />
          <SelectField label="Lớp" value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="">—</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" loading={saving}>
            Lưu
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Chọn câu ngẫu nhiên theo tiêu chí (5.3). */
function RandomDialog({
  set,
  onClose,
  onDone,
}: {
  set: QuestionSetDetail;
  onClose: () => void;
  onDone: (set: QuestionSetDetail, added: number) => void;
}) {
  const facets = useQuestionFacets();
  const [count, setCount] = useState('5');
  const [round, setRound] = useState<RoundKey | ''>('warmup');
  const [matchRound, setMatchRound] = useState(true);
  const [subject, setSubject] = useState(set.subject ?? '');
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const result = await setApi.random(set.id, {
        count: Number(count),
        round: round || null,
        matchRound,
        subject,
        difficulty: difficulty || null,
      });
      onDone(result.set, result.added);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Thêm câu ngẫu nhiên"
      description="Lấy ngẫu nhiên từ ngân hàng của bạn những câu chưa có trong bộ đề."
      onClose={onClose}
    >
      <form noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Số câu"
            type="number"
            min={1}
            max={50}
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
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
          <SelectField label="Môn" value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="">Tất cả</option>
            {facets.data?.subjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Độ khó"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Difficulty | '')}
          >
            <option value="">Tất cả</option>
            {difficultySchema.options.map((d) => (
              <option key={d} value={d}>
                {DIFFICULTY_LABELS[d]}
              </option>
            ))}
          </SelectField>
        </div>
        {round && (
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={matchRound}
              onChange={(e) => setMatchRound(e.target.checked)}
              className="size-[18px] accent-brand-600"
            />
            Chỉ lấy câu đánh dấu phù hợp vòng {ROUND_LABELS[round]}
          </label>
        )}
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" loading={saving}>
            Thêm câu
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PublicationPanel({
  set,
  busy,
  onPublish,
  onUnpublish,
}: {
  set: QuestionSetDetail;
  busy: boolean;
  onPublish: () => void;
  onUnpublish: () => void;
}) {
  const { approved, pending, rejected } = set.publication;
  return (
    <section
      aria-labelledby="publication-heading"
      className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5"
    >
      <h2 id="publication-heading" className="text-base font-bold">
        Chia sẻ public
      </h2>
      {rejected && (
        <Alert tone="error" title={`Bản ${rejected.versionNo} bị từ chối`}>
          {rejected.reason}
        </Alert>
      )}
      {approved && (
        <p className="text-sm text-slate-700">
          Bản {approved.versionNo} đang public từ {formatDate(approved.reviewedAt)}. Host khác xem
          và sao chép được bản này.
        </p>
      )}
      {pending && (
        <p className="text-sm text-slate-700">
          Bản {pending.versionNo} gửi ngày {formatDate(pending.submittedAt)} đang chờ Manager duyệt.
          {approved && ' Bản đang public vẫn hiển thị tới khi bản mới được duyệt.'}
        </p>
      )}
      {!approved && !pending && !rejected && (
        <p className="text-sm text-slate-600">
          Bộ đề đang riêng tư. Khi chia sẻ, bộ đề được gửi Manager duyệt trước khi hiển thị với Host
          khác.
        </p>
      )}
      <p className="text-xs text-slate-500">
        Bản gửi duyệt là ảnh chụp nội dung hiện tại; sửa câu hỏi sau đó cần gửi lại bản mới.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" loading={busy} disabled={set.questionCount === 0} onClick={onPublish}>
          {approved || pending ? 'Gửi duyệt bản mới' : 'Chia sẻ public'}
        </Button>
        {(approved || pending) && (
          <Button size="sm" variant="secondary-warning" disabled={busy} onClick={onUnpublish}>
            {approved ? 'Gỡ khỏi public' : 'Hủy gửi duyệt'}
          </Button>
        )}
      </div>
    </section>
  );
}

function SetEditor({ set }: { set: QuestionSetDetail }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const status = publicationLabel(set.publication);

  function apply(next: QuestionSetDetail, message?: string) {
    queryClient.setQueryData(qbKeys.set(set.id), next);
    void queryClient.invalidateQueries({ queryKey: qbKeys.sets });
    if (message) setNotice({ tone: 'success', text: message });
  }

  async function run(task: () => Promise<QuestionSetDetail | undefined>, message?: string) {
    setBusy(true);
    setNotice(null);
    try {
      const next = await task();
      if (next) apply(next, message);
    } catch (err) {
      setNotice({ tone: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  const saveItems = (items: Item[]) =>
    run(() =>
      setApi.replaceItems(
        set.id,
        items.map((item) => ({ questionId: item.question.id, round: item.round })),
      ),
    );

  function move(index: number, delta: -1 | 1) {
    const items = [...set.items];
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target]!, items[index]!];
    void saveItems(items);
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <Link
          to="/ngan-hang?tab=bo-de"
          className="inline-flex items-center gap-1 self-start text-sm font-medium"
        >
          <ChevronLeftIcon size={16} />
          Bộ đề của tôi
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="break-words text-[28px] font-bold leading-tight">{set.name}</h1>
              <Badge tone={status.tone}>{status.text}</Badge>
            </div>
            <p className="mt-1.5 text-[15px] text-slate-600">
              {set.questionCount} câu
              {set.subject ? ` · ${set.subject}` : ''}
              {set.grade ? ` · Lớp ${set.grade}` : ''}
              {set.description ? ` · ${set.description}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setDialog('edit')}>
              Sửa thông tin
            </Button>
            <Button variant="secondary" onClick={() => setDialog('random')}>
              Thêm câu ngẫu nhiên
            </Button>
            <Link
              to="/ngan-hang"
              className="inline-flex h-11 items-center rounded-lg bg-brand-600 px-5 text-[15px] font-semibold text-white no-underline hover:bg-brand-700 hover:text-white hover:no-underline"
            >
              Chọn câu từ ngân hàng
            </Link>
          </div>
        </div>
      </header>

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
          {set.items.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
              Bộ đề chưa có câu hỏi. Chọn câu ở trang Ngân hàng câu hỏi (“Thêm vào bộ đề”) hoặc thêm
              câu ngẫu nhiên.
            </div>
          )}
          {GROUPS.map((round) => {
            const entries = set.items
              .map((item, index) => ({ item, index }))
              .filter(({ item }) => item.round === round);
            if (entries.length === 0) return null;
            return (
              <section
                key={round ?? 'none'}
                aria-labelledby={`group-${round ?? 'none'}`}
                className="flex flex-col gap-2.5"
              >
                <h2 id={`group-${round ?? 'none'}`} className="text-base font-bold">
                  {groupLabel(round)}{' '}
                  <span className="font-medium text-slate-500">· {entries.length} câu</span>
                </h2>
                {entries.map(({ item, index }) => (
                  <QuestionSummary
                    key={item.question.id}
                    question={item.question}
                    index={index + 1}
                    actions={
                      <>
                        <label className="sr-only" htmlFor={`round-${item.question.id}`}>
                          Vòng của câu {index + 1}
                        </label>
                        <select
                          id={`round-${item.question.id}`}
                          value={item.round ?? ''}
                          disabled={busy}
                          onChange={(e) =>
                            void saveItems(
                              set.items.map((it, i) =>
                                i === index
                                  ? { ...it, round: (e.target.value || null) as RoundKey | null }
                                  : it,
                              ),
                            )
                          }
                          className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-[13px]"
                        >
                          <option value="">Chưa xếp vòng</option>
                          {ROUND_KEYS.map((key) => (
                            <option key={key} value={key}>
                              {ROUND_LABELS[key]}
                            </option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy || index === 0}
                          aria-label={`Đưa câu ${index + 1} lên`}
                          onClick={() => move(index, -1)}
                        >
                          ↑
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy || index === set.items.length - 1}
                          aria-label={`Đưa câu ${index + 1} xuống`}
                          onClick={() => move(index, 1)}
                        >
                          ↓
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          aria-label={`Bỏ câu ${index + 1} khỏi bộ đề`}
                          onClick={() => void saveItems(set.items.filter((_, i) => i !== index))}
                        >
                          Bỏ
                        </Button>
                      </>
                    }
                  />
                ))}
              </section>
            );
          })}
        </div>

        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <PublicationPanel
            set={set}
            busy={busy}
            onPublish={() =>
              void run(() => setApi.publish(set.id), 'Đã gửi bộ đề cho Manager duyệt.')
            }
            onUnpublish={() => setDialog('unpublish')}
          />
          <section className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-base font-bold">Theo vòng</h2>
            <ul className="flex flex-col gap-1.5 text-sm">
              {GROUPS.map((round) => (
                <li key={round ?? 'none'} className="flex justify-between">
                  <span className="text-slate-600">{groupLabel(round)}</span>
                  <span className="font-semibold">{set.roundCounts[round ?? 'none'] ?? 0}</span>
                </li>
              ))}
            </ul>
          </section>
          <Button variant="danger" onClick={() => setDialog('delete')}>
            Xóa bộ đề
          </Button>
        </aside>
      </div>

      {dialog === 'edit' && (
        <EditSetDialog
          set={set}
          onClose={() => setDialog(null)}
          onSaved={(next) => {
            apply(next, 'Đã lưu thông tin bộ đề.');
            setDialog(null);
          }}
        />
      )}
      {dialog === 'random' && (
        <RandomDialog
          set={set}
          onClose={() => setDialog(null)}
          onDone={(next, added) => {
            apply(
              next,
              added > 0
                ? `Đã thêm ${added} câu ngẫu nhiên.`
                : 'Không còn câu hỏi nào phù hợp tiêu chí.',
            );
            setDialog(null);
          }}
        />
      )}
      {(dialog === 'delete' || dialog === 'unpublish') && (
        <Modal
          title={dialog === 'delete' ? 'Xóa bộ đề?' : 'Gỡ khỏi public?'}
          description={
            dialog === 'delete'
              ? 'Bộ đề bị xóa và gỡ khỏi public (nếu có). Câu hỏi vẫn còn trong ngân hàng.'
              : 'Host khác không còn thấy bộ đề này. Kịch bản đang dùng bộ đề vẫn chạy được.'
          }
          onClose={() => setDialog(null)}
        >
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setDialog(null)}>
              Hủy
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() => {
                if (dialog === 'delete') {
                  setBusy(true);
                  setApi
                    .remove(set.id)
                    .then(async () => {
                      await queryClient.invalidateQueries({ queryKey: qbKeys.sets });
                      await navigate('/ngan-hang?tab=bo-de');
                    })
                    .catch((err: unknown) => setNotice({ tone: 'error', text: errorMessage(err) }))
                    .finally(() => setBusy(false));
                } else {
                  void run(() => setApi.unpublish(set.id), 'Đã gỡ bộ đề khỏi public.');
                }
                setDialog(null);
              }}
            >
              {dialog === 'delete' ? 'Xóa bộ đề' : 'Gỡ khỏi public'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Chi tiết bộ đề `/ngan-hang/bo-de/:setId` (5.3, 5.4). */
export function QuestionSetPage() {
  const { setId } = useParams();
  const set = useQuestionSet(setId);
  if (set.isPending) return <Spinner />;
  if (set.isError) return <Alert tone="error">{errorMessage(set.error)}</Alert>;
  return <SetEditor set={set.data} />;
}
