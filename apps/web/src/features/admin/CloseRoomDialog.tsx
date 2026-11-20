import { type AdminRoom, closeRoomRequestSchema } from '@olympia/shared';
import { useState } from 'react';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { errorMessage } from '../../lib/api-client';
import { useCloseRoomAsStaff } from './admin-api';

/** Super Admin/Manager đóng phòng vi phạm (15.1, 15.2), cần lý do để ghi nhật ký quản trị. */
export function CloseRoomDialog({
  room,
  onClose,
  onClosed,
}: {
  room: Pick<AdminRoom, 'id' | 'name'> & { status: string };
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
