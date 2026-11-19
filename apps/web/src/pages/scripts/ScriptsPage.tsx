import { MIN_PLAYERS, ROUND_TITLES, type ScriptSummary } from '@olympia/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Badge, Spinner } from '../../components/Card';
import { PlusIcon } from '../../components/icons';
import { Modal } from '../../components/Modal';
import { useDeleteScript, useDuplicateScript, useScripts } from '../../features/match/match-api';
import { ActionMenu } from '../../features/rooms/room-ui';
import { errorMessage } from '../../lib/api-client';

function readiness(script: ScriptSummary) {
  if (script.supportedPlayers < MIN_PLAYERS) {
    return <Badge tone="orange">Chưa đủ câu hỏi</Badge>;
  }
  return <Badge tone="green">Đủ câu cho {script.supportedPlayers} người chơi</Badge>;
}

/** `/kich-ban`: kịch bản trận đấu của Host (mục 6, BR-SCRIPT-02). */
export function ScriptsPage() {
  const scripts = useScripts();
  const duplicate = useDuplicateScript();
  const remove = useDeleteScript();
  const [confirm, setConfirm] = useState<ScriptSummary | null>(null);
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  async function copy(script: ScriptSummary) {
    setNotice(null);
    try {
      const created = await duplicate.mutateAsync({ id: script.id });
      setNotice({ tone: 'success', text: `Đã tạo “${created.name}”.` });
    } catch (error) {
      setNotice({ tone: 'error', text: errorMessage(error) });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold">Kịch bản</h1>
          <p className="mt-1.5 text-[15px] text-slate-600">
            Chọn vòng thi, thứ tự, luật và bộ câu hỏi; dùng lại cho nhiều phòng.
          </p>
        </div>
        <Link
          to="/kich-ban/moi"
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-5 text-[15px] font-semibold text-white no-underline hover:bg-brand-700 hover:text-white hover:no-underline"
        >
          <PlusIcon />
          Tạo kịch bản
        </Link>
      </header>

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      {scripts.isPending && <Spinner />}
      {scripts.isError && <Alert tone="error">{errorMessage(scripts.error)}</Alert>}
      {scripts.data?.length === 0 && (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h2 className="text-lg font-bold">Chưa có kịch bản</h2>
          <p className="mt-2 text-slate-600">
            Tạo kịch bản đầu tiên rồi chọn nó khi tạo phòng để bắt đầu trận.
          </p>
        </section>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5">
        {scripts.data?.map((script) => (
          <article
            key={script.id}
            className="flex flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-[17px] font-bold leading-snug">{script.name}</h2>
              {readiness(script)}
            </div>
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-slate-700">
              {script.rounds.map((round) => (
                <li key={round}>{ROUND_TITLES[round]}</li>
              ))}
            </ol>
            <p className="text-xs text-slate-500">
              Cập nhật {new Date(script.updatedAt).toLocaleString('vi-VN')}
            </p>
            <div className="mt-auto flex gap-2">
              <Link
                to={`/kich-ban/${script.id}`}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-lg bg-brand-50 text-sm font-semibold text-brand-700 no-underline hover:bg-brand-100 hover:no-underline"
              >
                Sửa kịch bản
              </Link>
              <ActionMenu
                label={`Thêm thao tác cho ${script.name}`}
                items={[
                  { label: 'Nhân bản', onSelect: () => void copy(script) },
                  { label: 'Xóa kịch bản', tone: 'danger', onSelect: () => setConfirm(script) },
                ]}
              />
            </div>
          </article>
        ))}
      </div>

      {confirm && (
        <Modal
          title={`Xóa “${confirm.name}”?`}
          description="Phòng đang chọn kịch bản này phải chọn kịch bản khác trước khi bắt đầu trận. Trận đã diễn ra không bị ảnh hưởng."
          onClose={() => setConfirm(null)}
        >
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Hủy
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() =>
                void remove
                  .mutateAsync(confirm.id)
                  .then(() => setConfirm(null))
                  .catch((error: unknown) => {
                    setConfirm(null);
                    setNotice({ tone: 'error', text: errorMessage(error) });
                  })
              }
            >
              Xóa kịch bản
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
