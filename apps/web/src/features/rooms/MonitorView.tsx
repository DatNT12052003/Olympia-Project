import type { RoomState } from '@olympia/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { CloseRoomDialog } from '../admin/CloseRoomDialog';
import { AvStatusNote, AvTile, SpeakerToggle } from '../av/av-ui';
import { PlayersList } from './MemberLobby';
import { CONTROL_MODE_LABELS, initials, SEAT_BG, VISIBILITY_LABELS } from './room-format';
import { PlayerStateLabel, SeatChip } from './room-ui';

/**
 * Thanh giám sát của Super Admin/Manager (BR-ROLE-04, 15.2): luôn hiện trên sảnh chờ và màn trận,
 * kèm quyền quản trị mục 15 (đóng phòng vi phạm).
 */
export function MonitorBar({ state }: { state: RoomState }) {
  const [closing, setClosing] = useState(false);
  return (
    <div className="border-b border-accent-400/40 bg-accent-400/10">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-bold text-accent-400">Chế độ giám sát</span>
          <span className="text-stage-200">
            {' '}
            · Bạn xem như khán giả, không xuất hiện trong danh sách phòng và không tác động trận
            đấu.
          </span>
        </p>
        <div className="flex gap-2">
          <Link
            to="/quan-tri/phong"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-stage-700 px-4 text-sm font-semibold text-white no-underline hover:bg-white/5 hover:text-white hover:no-underline"
          >
            Về trang quản trị
          </Link>
          <button
            type="button"
            onClick={() => setClosing(true)}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-red-100 px-4 text-sm font-semibold text-red-700 hover:bg-red-200"
          >
            Đóng phòng
          </button>
        </div>
      </div>
      {closing && (
        <CloseRoomDialog
          room={{ id: state.room.id, name: state.room.name, status: state.room.status }}
          onClose={() => setClosing(false)}
          // Server đóng phòng rồi báo `room:removed` (closed): trang phòng tự chuyển sang thông báo.
          onClosed={() => setClosing(false)}
        />
      )}
    </div>
  );
}

/** Sảnh chờ khi giám sát: thông tin phòng, video Host/người chơi, danh sách người chơi. */
export function MonitorLobby({ state }: { state: RoomState }) {
  const seats = Array.from({ length: state.room.maxPlayers }, (_, i) => i + 1);
  return (
    <>
      <header className="border-b border-[#1E3A75]">
        <div className="mx-auto max-w-[1320px] px-4 py-3.5 sm:px-6">
          <p className="text-xs text-stage-200 sm:text-[13px]">
            Sảnh chờ{state.room.code ? ` · Mã phòng ${state.room.code}` : ''} · Host{' '}
            {state.host.displayName}
            {state.host.connection !== 'online' && ' (đang vắng)'}
          </p>
          <h1 className="mt-0.5 break-words text-lg font-extrabold sm:text-[22px]">
            {state.room.name}
          </h1>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[1320px] flex-1 flex-wrap items-start gap-6 px-4 py-5 sm:px-6 sm:py-6">
        <section aria-label="Video" className="flex min-w-0 flex-[999_1_600px] flex-col gap-4">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
            <article
              aria-label={`Host: ${state.host.displayName}`}
              className="relative flex h-[150px] items-center justify-center overflow-hidden rounded-2xl border-2 border-accent-400 bg-[#1E3A75]"
            >
              <AvTile
                target={{ role: 'host' }}
                fallback={
                  <span className="flex size-16 items-center justify-center rounded-full bg-accent-400 text-[22px] font-extrabold text-stage-900">
                    {initials(state.host.displayName)}
                  </span>
                }
              />
              <span className="absolute bottom-2 left-2 rounded bg-stage-900/80 px-2 py-0.5 text-xs font-semibold">
                Host · {state.host.displayName}
              </span>
            </article>
            {seats.map((seat) => {
              const player = state.players.find((p) => p.seat === seat);
              if (!player) return null;
              return (
                <article
                  key={seat}
                  aria-label={`Vị trí ${seat}: ${player.displayName}`}
                  className="relative flex h-[150px] items-center justify-center overflow-hidden rounded-2xl border-2 border-stage-700 bg-[#1E3A75]"
                >
                  <AvTile
                    target={{ participantId: player.id }}
                    fallback={
                      <span
                        className={`flex size-16 items-center justify-center rounded-full text-[22px] font-extrabold text-stage-900 ${SEAT_BG[seat]}`}
                      >
                        {initials(player.displayName)}
                      </span>
                    }
                  />
                  <span className="absolute left-2 top-2">
                    <SeatChip seat={seat} size="sm" />
                  </span>
                  <span className="absolute bottom-2 left-2 flex items-center gap-2 rounded bg-stage-900/80 px-2 py-0.5 text-xs font-semibold">
                    {player.displayName}
                    <PlayerStateLabel participant={player} />
                  </span>
                </article>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SpeakerToggle />
          </div>
          <AvStatusNote />
        </section>

        <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-4">
          <section
            aria-labelledby="monitor-room-heading"
            className="flex flex-col gap-2 rounded-[18px] bg-stage-800 p-5 text-sm"
          >
            <h2 id="monitor-room-heading" className="text-base font-bold">
              Thông tin phòng
            </h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              <dt className="text-stage-200">Hiển thị</dt>
              <dd>{VISIBILITY_LABELS[state.room.visibility]}</dd>
              <dt className="text-stage-200">Điều khiển</dt>
              <dd>{CONTROL_MODE_LABELS[state.room.controlMode]}</dd>
              <dt className="text-stage-200">Khán giả</dt>
              <dd>
                {state.room.allowSpectators
                  ? `${state.spectators.count}/${state.room.maxSpectators}`
                  : 'Không cho phép'}
              </dd>
            </dl>
          </section>
          <section
            aria-labelledby="players-heading"
            className="flex flex-col gap-3 rounded-[18px] bg-stage-800 p-5"
          >
            <h2 id="players-heading" className="text-base font-bold">
              Người chơi
            </h2>
            <PlayersList state={state} />
          </section>
        </aside>
      </main>
    </>
  );
}
