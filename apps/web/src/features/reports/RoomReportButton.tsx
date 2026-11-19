import type { RoomState } from '@olympia/shared';
import { useState } from 'react';
import { FlagIcon } from '../../components/icons';
import { useAuth } from '../auth/use-auth';
import { ReportDialog } from './ReportDialog';

/**
 * Báo cáo hành vi trong phòng (15.3). Chỉ tài khoản đăng nhập được báo cáo (BR-AUTH-06); người
 * bị báo cáo chọn trong Host, người chơi và khán giả đang thấy.
 */
export function RoomReportButton({
  state,
  meId,
  isHost,
}: {
  state: RoomState;
  /** Id người tham gia của chính mình (không tự báo cáo). */
  meId: string | null;
  isHost: boolean;
}) {
  const { status } = useAuth();
  const [open, setOpen] = useState(false);
  if (status !== 'authenticated') return null;

  const people = [
    ...(isHost ? [] : [{ id: null, name: `Host ${state.host.displayName}` }]),
    ...[...state.players, ...state.spectators.items]
      .filter((p) => p.id !== meId)
      .map((p) => ({ id: p.id, name: p.displayName })),
  ];
  if (people.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex size-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-stage-700 text-sm font-semibold hover:bg-white/5 sm:w-auto sm:px-4"
      >
        <FlagIcon />
        <span className="sr-only sm:not-sr-only">Báo cáo</span>
      </button>
      {open && (
        <ReportDialog
          target={{ kind: 'room', roomId: state.room.id, label: state.room.name, people }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
