import type { HostRoom, RoomStatus } from '@olympia/shared';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Card';
import { PlusIcon } from '../../components/icons';
import { Modal } from '../../components/Modal';
import { useDeleteRoom, useMyRooms, useRoomAction } from '../../features/rooms/rooms-api';
import {
  CONTROL_MODE_LABELS,
  inviteLink,
  VISIBILITY_LABELS,
} from '../../features/rooms/room-format';
import { ActionMenu, type MenuItem, RoomStatusBadge } from '../../features/rooms/room-ui';
import { errorMessage } from '../../lib/api-client';

type Filter = 'all' | 'active' | 'draft' | 'closed';

const FILTERS: { value: Filter; label: string; match: (status: RoomStatus) => boolean }[] = [
  { value: 'all', label: 'Tất cả', match: () => true },
  { value: 'active', label: 'Đang hoạt động', match: (s) => s === 'open' || s === 'in_match' },
  { value: 'draft', label: 'Nháp', match: (s) => s === 'draft' },
  { value: 'closed', label: 'Đã đóng', match: (s) => s === 'closed' },
];

type Confirm = { kind: 'close' | 'delete'; room: HostRoom } | null;

const ctaClass = {
  stage: 'bg-accent-400 font-bold text-stage-900 hover:bg-accent-500 hover:text-stage-900',
  primary: 'bg-brand-600 text-white hover:bg-brand-700 hover:text-white',
  light: 'bg-brand-50 text-brand-700 hover:bg-brand-100 hover:text-brand-700',
};

function RoomCard({
  room,
  onAction,
}: {
  room: HostRoom;
  onAction: (action: 'open' | 'copy' | 'close' | 'delete', room: HostRoom) => void;
}) {
  const navigate = useNavigate();
  const editPath = `/phong-thi/${room.id}/sua`;
  const cta =
    room.status === 'in_match'
      ? { label: 'Vào điều khiển', to: `/phong/${room.id}`, tone: 'stage' as const }
      : room.status === 'open'
        ? { label: 'Mở sảnh chờ', to: `/phong/${room.id}`, tone: 'primary' as const }
        : room.status === 'draft'
          ? { label: 'Tiếp tục cấu hình', to: editPath, tone: 'light' as const }
          : null;

  const items: MenuItem[] = [];
  if (room.status === 'draft' || room.status === 'open') {
    items.push({ label: 'Sửa cấu hình', onSelect: () => void navigate(editPath) });
  }
  if (room.status === 'draft') {
    items.push({ label: 'Mở phòng', onSelect: () => onAction('open', room) });
    items.push({ label: 'Xóa phòng', tone: 'danger', onSelect: () => onAction('delete', room) });
  }
  if (room.code && (room.status === 'open' || room.status === 'in_match')) {
    items.push({ label: 'Sao chép link mời', onSelect: () => onAction('copy', room) });
  }
  if (room.status === 'open') {
    items.push({ label: 'Đóng phòng', tone: 'danger', onSelect: () => onAction('close', room) });
  }

  return (
    <article className="flex flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 break-words text-[17px] font-bold leading-snug">{room.name}</h2>
        <RoomStatusBadge status={room.status} />
      </div>
      <dl className="grid grid-cols-2 gap-2.5 text-sm">
        <div>
          <dt className="text-xs text-slate-600">Mã phòng</dt>
          <dd className="mt-0.5 font-bold tracking-[0.12em]">{room.code ?? '——'}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-600">Người chơi</dt>
          <dd className="mt-0.5 font-semibold">
            {room.playerCount}/{room.maxPlayers}
            {room.spectatorCount > 0 && ` · ${room.spectatorCount} khán giả`}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-600">Điều khiển</dt>
          <dd className="mt-0.5 font-semibold">{CONTROL_MODE_LABELS[room.controlMode]}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-600">Chế độ</dt>
          <dd className="mt-0.5 font-semibold">{VISIBILITY_LABELS[room.visibility]}</dd>
        </div>
      </dl>
      <div className="mt-auto flex gap-2">
        {cta ? (
          <Link
            to={cta.to}
            className={`inline-flex h-11 flex-1 items-center justify-center rounded-lg text-sm font-semibold no-underline hover:no-underline ${ctaClass[cta.tone]}`}
          >
            {cta.label}
          </Link>
        ) : (
          <p className="flex h-11 flex-1 items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-600">
            Kết quả trận có ở phần Lịch sử (sắp có)
          </p>
        )}
        {items.length > 0 && <ActionMenu label={`Thêm thao tác cho ${room.name}`} items={items} />}
      </div>
    </article>
  );
}

export function HostRoomsPage() {
  const rooms = useMyRooms();
  const roomAction = useRoomAction();
  const deleteRoom = useDeleteRoom();
  const [filter, setFilter] = useState<Filter>('all');
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const items = rooms.data?.items ?? [];
  const visible = items.filter((room) =>
    FILTERS.find((f) => f.value === filter)!.match(room.status),
  );

  function handleAction(action: 'open' | 'copy' | 'close' | 'delete', room: HostRoom) {
    setNotice(null);
    if (action === 'close' || action === 'delete') {
      setConfirm({ kind: action, room });
      return;
    }
    if (action === 'copy' && room.code) {
      void navigator.clipboard
        ?.writeText(inviteLink(room.code))
        .then(() => setNotice({ tone: 'success', text: 'Đã sao chép link mời.' }))
        .catch(() => setNotice({ tone: 'error', text: 'Không sao chép được link mời.' }));
      return;
    }
    roomAction.mutate(
      { roomId: room.id, action: 'open' },
      {
        onSuccess: (opened) =>
          setNotice({ tone: 'success', text: `Đã mở phòng. Mã phòng: ${opened?.code ?? ''}` }),
        onError: (error) => setNotice({ tone: 'error', text: errorMessage(error) }),
      },
    );
  }

  function runConfirm() {
    if (!confirm) return;
    const done = {
      onSuccess: () => {
        setNotice({
          tone: 'success' as const,
          text: confirm.kind === 'close' ? 'Đã đóng phòng.' : 'Đã xóa phòng nháp.',
        });
        setConfirm(null);
      },
      onError: (error: unknown) => {
        setNotice({ tone: 'error', text: errorMessage(error) });
        setConfirm(null);
      },
    };
    if (confirm.kind === 'close') {
      roomAction.mutate({ roomId: confirm.room.id, action: 'close' }, done);
    } else {
      deleteRoom.mutate(confirm.room.id, done);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold leading-tight">Phòng thi của tôi</h1>
          {rooms.data && (
            <p className="mt-1.5 text-[15px] text-slate-600">
              Đang mở {rooms.data.activeCount}/{rooms.data.activeLimit} phòng cho phép.
            </p>
          )}
        </div>
        <Link
          to="/phong-thi/tao"
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-5 text-[15px] font-semibold text-white no-underline hover:bg-brand-700 hover:text-white hover:no-underline"
        >
          <PlusIcon />
          Tạo phòng
        </Link>
      </header>

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      <div role="group" aria-label="Lọc phòng" className="flex flex-wrap gap-2">
        {FILTERS.map((option) => {
          const count = items.filter((room) => option.match(room.status)).length;
          const active = option.value === filter;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(option.value)}
              className={`h-10 rounded-full px-4 text-sm ${
                active
                  ? 'bg-stage-900 font-semibold text-white'
                  : 'border border-slate-300 bg-white font-medium text-slate-700 hover:bg-slate-50'
              }`}
            >
              {option.label} ({count})
            </button>
          );
        })}
      </div>

      {rooms.isPending && <Spinner label="Đang tải danh sách phòng…" />}
      {rooms.isError && <Alert tone="error">{errorMessage(rooms.error)}</Alert>}
      {rooms.isSuccess && items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="font-semibold">Bạn chưa có phòng thi nào.</p>
          <p className="mt-1 text-sm text-slate-600">
            Tạo phòng, mở sảnh chờ rồi gửi mã phòng cho người chơi.
          </p>
        </div>
      )}
      {rooms.isSuccess && items.length > 0 && visible.length === 0 && (
        <p className="text-sm text-slate-600">Không có phòng nào trong mục này.</p>
      )}
      {visible.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-5">
          {visible.map((room) => (
            <RoomCard key={room.id} room={room} onAction={handleAction} />
          ))}
        </div>
      )}

      {confirm && (
        <Modal
          title={confirm.kind === 'close' ? 'Đóng phòng?' : 'Xóa phòng nháp?'}
          description={
            confirm.kind === 'close'
              ? `Mọi người trong “${confirm.room.name}” sẽ rời phòng và mã phòng hết hiệu lực. Phòng đã đóng không mở lại được.`
              : `Phòng “${confirm.room.name}” sẽ bị xóa vĩnh viễn.`
          }
          onClose={() => setConfirm(null)}
        >
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Hủy
            </Button>
            <Button
              variant="danger"
              loading={roomAction.isPending || deleteRoom.isPending}
              onClick={runConfirm}
            >
              {confirm.kind === 'close' ? 'Đóng phòng' : 'Xóa phòng'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
