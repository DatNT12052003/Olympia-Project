import type { ParticipantView, RoomState } from '@olympia/shared';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { LeaveIcon } from '../../components/icons';
import { AvStatusNote, AvTile, LocalAvControls } from '../av/av-ui';
import { errorMessage } from '../../lib/api-client';
import { ReactionBar } from './room-stage';
import { leaveRoom, setReady } from './rooms-api';
import { initials, SEAT_BG, SEAT_BORDER } from './room-format';
import { PlayerStateLabel, SeatChip } from './room-ui';
import { RoomReportButton } from '../reports/RoomReportButton';

function LobbyHeader({
  meId,
  state,
  onLeave,
  leaving,
}: {
  meId: string;
  state: RoomState;
  onLeave: () => void;
  leaving: boolean;
}) {
  return (
    <header className="border-b border-[#1E3A75]">
      <div className="mx-auto flex max-w-[1320px] items-center gap-3 px-4 py-3.5 sm:px-6">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-stage-200 sm:text-[13px]">
            Sảnh chờ{state.room.code ? ` · Mã phòng ${state.room.code}` : ''} · Host{' '}
            {state.host.displayName}
            {state.host.connection !== 'online' && ' (đang vắng)'}
          </p>
          <h1 className="mt-0.5 break-words text-lg font-extrabold sm:text-[22px]">
            {state.room.name}
          </h1>
        </div>
        <RoomReportButton state={state} meId={meId} isHost={false} />
        <button
          type="button"
          onClick={onLeave}
          disabled={leaving}
          className="inline-flex size-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-stage-700 text-sm font-semibold hover:bg-white/5 disabled:opacity-50 sm:w-auto sm:px-4"
        >
          <LeaveIcon />
          <span className="sr-only sm:not-sr-only">Rời phòng</span>
        </button>
      </div>
    </header>
  );
}

/** Danh sách ghế người chơi trong sảnh chờ; `meId` đánh dấu chính mình. */
export function PlayersList({ state, meId }: { state: RoomState; meId?: string }) {
  return (
    <ul className="flex flex-col gap-2.5 text-[15px]">
      {Array.from({ length: state.room.maxPlayers }, (_, i) => i + 1).map((seat) => {
        const player = state.players.find((p) => p.seat === seat);
        return (
          <li key={seat} className="flex items-center gap-2.5">
            <SeatChip seat={seat} size="sm" />
            {player ? (
              <>
                <span
                  className={`min-w-0 flex-1 truncate ${player.id === meId ? 'font-bold' : ''}`}
                >
                  {player.displayName}
                  {player.id === meId && ' (bạn)'}
                </span>
                <PlayerStateLabel participant={player} />
              </>
            ) : (
              <span className="flex-1 text-stage-200">Đang chờ người chơi</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Sảnh chờ của người chơi, khán giả và người đang chờ duyệt. */
export function MemberLobby({
  state,
  me,
  onSendReaction,
}: {
  state: RoomState;
  me: ParticipantView;
  onSendReaction: (emoji: string) => Promise<string | null>;
}) {
  const navigate = useNavigate();
  const roomId = state.room.id;
  const [leaving, setLeaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ghế/sẵn sàng của mình lấy từ trạng thái phòng (mới nhất), dự phòng bằng /me.
  const self = state.players.find((p) => p.id === me.id) ?? me;
  const isPlayer = self.role === 'player' && self.status === 'approved';
  const pending = self.status === 'pending';
  const seat = isPlayer ? self.seat : null;
  const inLobby = state.room.status === 'open';

  async function onLeave() {
    setLeaving(true);
    setError(null);
    try {
      await leaveRoom(roomId);
      await navigate('/vao-phong');
    } catch (err) {
      setError(errorMessage(err));
      setLeaving(false);
    }
  }

  async function toggleReady() {
    setSaving(true);
    setError(null);
    try {
      await setReady(roomId, !self.ready);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const reactions = !pending && (
    <ReactionBar enabled={state.room.reactionsEnabled} onSend={onSendReaction} />
  );

  return (
    <>
      <LobbyHeader state={state} meId={me.id} onLeave={() => void onLeave()} leaving={leaving} />
      <main className="mx-auto flex w-full max-w-[1320px] flex-1 flex-wrap items-start gap-6 px-4 py-5 sm:px-6 sm:py-6">
        <section
          aria-label="Bạn trong phòng"
          className="flex min-w-0 flex-[999_1_600px] flex-col gap-4"
        >
          {state.room.status === 'in_match' && (
            <p
              role="status"
              className="rounded-xl bg-amber-100 px-4 py-3 text-sm font-semibold text-amber-900"
            >
              Trận đang diễn ra. Màn thi đấu sẽ có khi Game Engine hoàn thành.
            </p>
          )}
          <div
            className={`relative flex h-[230px] items-center justify-center overflow-hidden rounded-[18px] border-2 bg-[#1E3A75] sm:aspect-video sm:h-auto sm:rounded-[20px] sm:border-[3px] ${
              seat ? SEAT_BORDER[seat] : 'border-stage-700'
            }`}
          >
            <AvTile
              target={{ participantId: self.id }}
              mirror
              fallback={
                <span
                  className={`flex size-20 items-center justify-center rounded-full text-[28px] font-extrabold text-stage-900 sm:size-[120px] sm:text-[42px] ${
                    seat ? SEAT_BG[seat] : 'bg-stage-200'
                  }`}
                >
                  {initials(self.displayName)}
                </span>
              }
            />
            <span className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-lg bg-stage-900/85 py-1.5 pl-1.5 pr-3 text-sm font-bold sm:text-[15px]">
              {seat ? <SeatChip seat={seat} size="sm" /> : null}
              {pending
                ? `${self.displayName} · Đang chờ Host duyệt`
                : isPlayer
                  ? `${self.displayName} · ${seat ? `Vị trí ${seat}` : 'Chưa có vị trí'}`
                  : `${self.displayName} · Khán giả`}
            </span>
          </div>
          {isPlayer ? (
            <section aria-labelledby="devices-heading" className="flex flex-col gap-2.5">
              <h2 id="devices-heading" className="text-[15px] font-bold">
                Kiểm tra thiết bị
              </h2>
              <LocalAvControls showLevel />
              <p className="text-[13px] text-stage-200">
                Không có camera hoặc micro vẫn thi được; mọi người sẽ thấy ảnh đại diện của bạn.
              </p>
            </section>
          ) : (
            !pending && <AvStatusNote />
          )}
        </section>

        <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-4">
          {pending && (
            <section className="flex flex-col gap-2 rounded-[18px] border border-accent-400/50 bg-stage-800 p-5">
              <h2 className="text-base font-bold">Đang chờ Host duyệt</h2>
              <p className="text-sm text-stage-200">
                Bạn đã gửi yêu cầu làm người chơi. Màn hình sẽ tự cập nhật khi Host duyệt.
              </p>
            </section>
          )}
          <section
            aria-labelledby="players-heading"
            className="flex flex-col gap-3 rounded-[18px] bg-stage-800 p-5"
          >
            <h2 id="players-heading" className="text-base font-bold">
              Người chơi
            </h2>
            <PlayersList state={state} meId={me.id} />
            {state.room.allowSpectators && (
              <p className="border-t border-stage-700 pt-3 text-[13px] text-stage-200">
                {state.spectators.count} khán giả đang xem
              </p>
            )}
          </section>

          {!pending && <section aria-label="Cảm xúc">{reactions}</section>}

          {error && (
            <p role="alert" className="text-sm text-orange-300">
              {error}
            </p>
          )}

          {isPlayer && inLobby && (
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                aria-pressed={self.ready}
                disabled={saving || !seat}
                onClick={() => void toggleReady()}
                className={`h-14 rounded-[14px] text-lg font-extrabold disabled:cursor-not-allowed disabled:opacity-60 ${
                  self.ready
                    ? 'border border-stage-700 bg-transparent text-white hover:bg-white/5'
                    : 'bg-accent-400 text-stage-900 hover:bg-accent-500'
                }`}
              >
                {self.ready ? 'Hủy sẵn sàng' : 'Tôi đã sẵn sàng'}
              </button>
              <p className="text-center text-[13px] text-stage-200">
                {!seat
                  ? 'Host sẽ xếp vị trí cho bạn trước khi bắt đầu.'
                  : self.ready
                    ? '✓ Bạn đã sẵn sàng. Trận bắt đầu khi Host bấm Bắt đầu.'
                    : 'Trận bắt đầu khi Host bấm Bắt đầu.'}
              </p>
            </div>
          )}
          {!isPlayer && !pending && (
            <p className="text-center text-[13px] text-stage-200">
              Bạn đang xem với vai trò khán giả. Trận bắt đầu khi Host bấm Bắt đầu.
            </p>
          )}
        </aside>
      </main>
    </>
  );
}
