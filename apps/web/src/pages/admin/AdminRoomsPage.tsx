import { type AdminRoom, closeRoomRequestSchema } from '@olympia/shared';
import { useState } from 'react';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Badge, Spinner } from '../../components/Card';
import { Modal } from '../../components/Modal';
import { useAdminRooms, useCloseRoomAsStaff } from '../../features/admin/admin-api';
import { formatLastActive } from '../../features/admin/format-activity';
import { VISIBILITY_LABELS } from '../../features/rooms/room-format';
import { errorMessage } from '../../lib/api-client';

function CloseRoomDialog({
  room,
  onClose,
  onClosed,
}: {
  room: AdminRoom;
  onClose: () => void;
  onClosed: () => void;
}) {
  const close = useCloseRoomAsStaff();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      title={`Đóng phòng “${room.name}”?`}
      description={
        room.status === 'in_match'
          ? 'Phòng đang thi: trận đấu sẽ kết thúc bất thường và mọi người rời phòng.'
          : 'Mọi người trong phòng sẽ rời phòng; mã phòng hết hiệu lực.'
      }
      onClose={onClose}
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = closeRoomRequestSchema.safeParse({ reason });
          if (!parsed.success) {
            setError(parsed.error.issues[0]?.message ?? 'Cần nhập lý do.');
            return;
          }
          close.mutate(
            { roomId: room.id, reason: parsed.data.reason },
            { onSuccess: onClosed, onError: (err) => setError(errorMessage(err)) },
          );
        }}
        className="flex flex-col gap-3"
      >
        <label htmlFor="close-reason" className="text-sm font-semibold text-slate-900">
          Lý do đóng phòng
        </label>
        <textarea
          id="close-reason"
          rows={2}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="rounded-lg border border-slate-300 px-3.5 py-2.5 text-[15px] text-slate-900"
        />
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Để sau
          </Button>
          <Button type="submit" variant="danger" loading={close.isPending}>
            Đóng phòng
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Phòng đang hoạt động `/quan-tri/phong` (mục 15.1, 15.2): giám sát, đóng phòng vi phạm. */
export function AdminRoomsPage() {
  const rooms = useAdminRooms();
  const [closing, setClosing] = useState<AdminRoom | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const items = rooms.data ?? [];
  const inMatch = items.filter((r) => r.status === 'in_match').length;
  const people = items.reduce((sum, r) => sum + r.playerCount + r.spectatorCount, 0);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[28px] font-bold">Phòng đang hoạt động</h1>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        {[
          ['Phòng đang mở', items.length],
          ['Đang thi', inMatch],
          ['Người trong phòng', people],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[14px] border border-slate-200 bg-white p-4">
            <span className="text-[13px] text-slate-600">{label}</span>
            <p className="mt-1 text-[26px] font-extrabold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      {message && <Alert tone="success">{message}</Alert>}
      {rooms.isError && <Alert tone="error">{errorMessage(rooms.error)}</Alert>}
      {rooms.isPending ? (
        <Spinner label="Đang tải danh sách phòng…" />
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
          Không có phòng nào đang hoạt động.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-slate-600">
                <th scope="col" className="px-4 py-3 font-semibold">
                  Phòng
                </th>
                <th scope="col" className="px-2 py-3 font-semibold">
                  Host
                </th>
                <th scope="col" className="px-2 py-3 font-semibold">
                  Trạng thái
                </th>
                <th scope="col" className="px-2 py-3 text-right font-semibold">
                  Người chơi
                </th>
                <th scope="col" className="px-2 py-3 text-right font-semibold">
                  Khán giả
                </th>
                <th scope="col" className="px-2 py-3 font-semibold">
                  Mở lúc
                </th>
                <th scope="col" className="py-3 pr-4 pl-2">
                  <span className="sr-only">Thao tác</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((room) => (
                <tr key={room.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <span className="block font-semibold">{room.name}</span>
                    <span className="text-[13px] text-slate-600">
                      {VISIBILITY_LABELS[room.visibility]}
                      {room.code ? ` · Mã ${room.code}` : ''}
                    </span>
                  </td>
                  <td className="px-2 py-3">
                    <span className="block">{room.hostName}</span>
                    {room.organizationName && (
                      <span className="text-[13px] text-slate-600">{room.organizationName}</span>
                    )}
                  </td>
                  <td className="px-2 py-3">
                    {room.status === 'in_match' ? (
                      <Badge tone="brand">Đang thi</Badge>
                    ) : (
                      <Badge tone="green">Đang mở</Badge>
                    )}
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums">{room.playerCount}</td>
                  <td className="px-2 py-3 text-right tabular-nums">{room.spectatorCount}</td>
                  <td className="px-2 py-3 whitespace-nowrap">
                    {room.openedAt ? formatLastActive(room.openedAt) : '—'}
                  </td>
                  <td className="py-3 pr-4 pl-2 text-right">
                    <Button
                      variant="secondary-warning"
                      size="sm"
                      onClick={() => {
                        setMessage(null);
                        setClosing(room);
                      }}
                    >
                      Đóng phòng
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {closing && (
        <CloseRoomDialog
          room={closing}
          onClose={() => setClosing(null)}
          onClosed={() => {
            setMessage(`Đã đóng phòng “${closing.name}”.`);
            setClosing(null);
          }}
        />
      )}
    </div>
  );
}
