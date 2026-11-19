import type { MatchView, RoomState } from '@olympia/shared';
import { initials, SEAT_BG, SEAT_BORDER } from '../rooms/room-format';
import { partLabel, roundTitle, useRemainingMs } from './match-format';
import { PauseBanner, SeatSquare, TimerBar } from './match-ui';
import {
  AccelerationPlayer,
  FinishPlayer,
  ObstaclePlayer,
  type PlayerActions,
  TiebreakPlayer,
  WarmupPlayer,
} from './player-rounds';

export type { PlayerActions } from './player-rounds';

function RoundContent({
  view,
  actions,
  remaining,
}: {
  view: MatchView;
  actions: PlayerActions;
  remaining: number | null;
}) {
  const round = view.round;
  const props = { view, actions, remaining };
  switch (round.type) {
    case 'warmup':
      return <WarmupPlayer {...props} round={round} />;
    case 'obstacle':
      return <ObstaclePlayer {...props} round={round} />;
    case 'acceleration':
      return <AccelerationPlayer {...props} round={round} />;
    case 'finish':
      return <FinishPlayer {...props} round={round} />;
    case 'tiebreak':
      return <TiebreakPlayer {...props} round={round} />;
  }
}

/**
 * Màn người chơi trong trận (PlayerAnswer, PlayerBuzz, PlayerDesktop*, Acceleration*, FinishPick*,
 * PlayerDesktopObstacle, FinishStealTablet).
 */
export function PlayerMatch({
  view,
  room,
  clockOffset,
  actions,
}: {
  view: MatchView;
  room: RoomState;
  clockOffset: number;
  actions: PlayerActions;
}) {
  const remaining = useRemainingMs(view.timer, clockOffset);
  const me = view.players.find((p) => p.seat === view.mySeat);
  const out = view.round.type === 'obstacle' && view.mySeat !== null ? view.round.outSeats : [];

  return (
    <>
      <header className="border-b border-[#1E3A75]">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs text-stage-200 lg:text-[13px]">
              <span className="hidden lg:inline">{room.room.name} · </span>
              {roundTitle(view)}
            </p>
            <p className="mt-0.5 text-[15px] font-bold leading-snug lg:text-xl lg:font-extrabold">
              {partLabel(view, view.mySeat)}
            </p>
          </div>
          {me && (
            <div className="flex shrink-0 items-center gap-2 rounded-xl bg-stage-800 py-1.5 pl-1.5 pr-3">
              <SeatSquare seat={me.seat} className="size-7 rounded-lg text-sm" />
              <span className="hidden text-sm text-stage-200 lg:inline">Điểm của bạn</span>
              <span className="text-xl font-extrabold tabular-nums text-accent-400">
                {me.score}
              </span>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-3.5 px-4 py-4 sm:px-6 lg:flex-row lg:items-start lg:gap-6 lg:py-6">
        <section
          aria-label="Người tham gia"
          className="grid grid-cols-[2fr_repeat(3,minmax(0,1fr))] gap-1.5 lg:w-72 lg:shrink-0 lg:grid-cols-1 lg:gap-3"
        >
          <div className="flex h-[84px] items-end rounded-[10px] bg-[#1E3A75] p-1.5 text-[11px] font-semibold lg:h-40 lg:items-center lg:justify-center lg:text-sm">
            Host · {room.host.displayName}
          </div>
          {view.players
            .filter((p) => p.seat !== view.mySeat)
            .map((p) => (
              <div
                key={p.seat}
                className={`relative flex h-[84px] flex-col items-center justify-center gap-1 rounded-[10px] border-2 bg-[#1E3A75] p-1 text-[10px] lg:h-auto lg:flex-row lg:justify-start lg:gap-2.5 lg:p-2.5 lg:text-sm ${SEAT_BORDER[p.seat] ?? ''} ${
                  p.connection !== 'online' || p.eliminated || out.includes(p.seat)
                    ? 'opacity-45'
                    : ''
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`hidden size-9 items-center justify-center rounded-full font-extrabold text-stage-900 lg:flex ${SEAT_BG[p.seat] ?? ''}`}
                >
                  {initials(p.displayName)}
                </span>
                <span className="min-w-0 truncate">
                  <b>{p.seat}</b>
                  <span className="hidden lg:inline"> · {p.displayName}</span> · {p.score}
                  {out.includes(p.seat) && <span className="hidden lg:inline"> · bị loại</span>}
                </span>
              </div>
            ))}
        </section>

        <div className="flex min-w-0 flex-1 flex-col gap-3.5">
          <PauseBanner view={view} />
          {view.timer && view.timer.purpose !== 'break' && view.timer.purpose !== 'auto' && (
            <div className="lg:hidden">
              <TimerBar remainingMs={remaining} durationMs={view.timer.durationMs} />
            </div>
          )}
          <RoundContent view={view} actions={actions} remaining={remaining} />
        </div>
      </main>
    </>
  );
}
