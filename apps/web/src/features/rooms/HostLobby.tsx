import type { ParticipantView, RoomState } from '@olympia/shared';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '../../components/Button';
import { CheckIcon, ChevronLeftIcon, CloseIcon, PlayIcon } from '../../components/icons';
import { Modal } from '../../components/Modal';
import { errorMessage } from '../../lib/api-client';
import { ReactionBar } from './room-stage';
import { participantAction, type ParticipantAction, useRoomAction } from './rooms-api';
import {
  CONTROL_MODE_LABELS,
  initials,
  inviteLink,
  SEAT_BG,
  SEAT_BORDER,
  VISIBILITY_LABELS,
} from './room-format';
import { ActionMenu, type MenuItem, PlayerStateLabel, SeatChip } from './room-ui';

type Confirm =
  { kind: 'kick' | 'ban'; participant: ParticipantView } | { kind: 'code' | 'close' } | null;

const SPECTATOR_PREVIEW = 5;

const stageButton =
  'inline-flex h-10 items-center justify-center rounded-lg border border-stage-700 bg-transparent px-3.5 text-[13px] font-semibold text-white hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50';

function guestOrUser(participant: ParticipantView): string {
  return participant.kind === 'guest' ? 'Khách' : 'Tài khoản';
}

export function HostLobby({
  state,
  onSendReaction,
}: {
  state: RoomState;
  onSendReaction: (emoji: string) => Promise<string | null>;
}) {
  const navigate = useNavigate();
  const roomId = state.room.id;
  const roomAction = useRoomAction();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [skipReady, setSkipReady] = useState(false);
  const [showAllSpectators, setShowAllSpectators] = useState(false);

  const seated = state.players.filter((p) => p.seat !== null);
  const unseated = state.players.filter((p) => p.seat === null);
  const readyCount = seated.filter((p) => p.ready).length;
  const enoughPlayers = seated.length >= 2;
  const allReady = enoughPlayers && readyCount === seated.length;

  async function act(participant: ParticipantView, action: ParticipantAction, done?: string) {
    setBusy(true);
    setNotice(null);
    try {
      await participantAction(roomId, participant.id, action);
      if (done) setNotice({ tone: 'success', text: done });
    } catch (error) {
      setNotice({ tone: 'error', text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  function playerMenu(player: ParticipantView): MenuItem[] {
    return [
      ...(player.seat !== null
        ? [
            {
              label: 'Bỏ khỏi vị trí',
              onSelect: () => void act(player, { type: 'seat', seat: null }),
            },
          ]
        : []),
      {
        label: 'Chuyển thành khán giả',
        disabled: !state.room.allowSpectators,
        onSelect: () => void act(player, { type: 'role', role: 'spectator' }),
      },
      {
        label: 'Mời ra khỏi phòng',
        tone: 'danger',
        onSelect: () => setConfirm({ kind: 'kick', participant: player }),
      },
      {
        label: 'Cấm khỏi phòng',
        tone: 'danger',
        onSelect: () => setConfirm({ kind: 'ban', participant: player }),
      },
    ];
  }

  function seatMenu(player: ParticipantView): MenuItem[] {
    return Array.from({ length: state.room.maxPlayers }, (_, i) => i + 1)
      .filter((seat) => seat !== player.seat)
      .map((seat) => {
        const occupant = state.players.find((p) => p.seat === seat);
        return {
          label: occupant
            ? `Đổi chỗ với ${occupant.displayName} (vị trí ${seat})`
            : `Chuyển sang vị trí ${seat}`,
          onSelect: () => void act(player, { type: 'seat', seat }),
        };
      });
  }

  async function runConfirm() {
    if (!confirm) return;
    if (confirm.kind === 'kick' || confirm.kind === 'ban') {
      const { participant, kind } = confirm;
      setConfirm(null);
      await act(
        participant,
        { type: kind },
        kind === 'kick'
          ? `Đã mời ${participant.displayName} ra khỏi phòng.`
          : `Đã cấm ${participant.displayName} khỏi phòng.`,
      );
      return;
    }
    const kind = confirm.kind;
    roomAction.mutate(
      { roomId, action: kind },
      {
        onSuccess: () => {
          setConfirm(null);
          if (kind === 'close') void navigate('/phong-thi');
          else
            setNotice({ tone: 'success', text: 'Đã tạo mã phòng mới. Link mời cũ hết hiệu lực.' });
        },
        onError: (error) => {
          setConfirm(null);
          setNotice({ tone: 'error', text: errorMessage(error) });
        },
      },
    );
  }

  function copyInvite() {
    if (!state.room.code) return;
    void navigator.clipboard
      ?.writeText(inviteLink(state.room.code))
      .then(() => setNotice({ tone: 'success', text: 'Đã sao chép link mời.' }))
      .catch(() => setNotice({ tone: 'error', text: 'Không sao chép được link mời.' }));
  }

  const spectators = showAllSpectators
    ? state.spectators.items
    : state.spectators.items.slice(0, SPECTATOR_PREVIEW);

  return (
    <>
      <header className="border-b border-[#1E3A75]">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-8 gap-y-4 px-4 py-4 sm:px-6">
          <div className="min-w-0 flex-[1_1_320px]">
            <Link
              to="/phong-thi"
              className="inline-flex items-center gap-1 text-[13px] text-stage-200 no-underline hover:text-white"
            >
              <ChevronLeftIcon size={14} />
              Phòng thi
            </Link>
            <p className="mt-1 text-[13px] text-stage-200">
              Sảnh chờ · {VISIBILITY_LABELS[state.room.visibility]} ·{' '}
              {CONTROL_MODE_LABELS[state.room.controlMode]}
            </p>
            <h1 className="mt-0.5 break-words text-2xl font-extrabold">{state.room.name}</h1>
          </div>
          {state.room.code && (
            <div className="flex flex-wrap items-center gap-3 rounded-[14px] bg-stage-800 py-2 pl-4 pr-2">
              <span className="text-[13px] text-stage-200">Mã phòng</span>
              <span className="text-[26px] font-extrabold tracking-[0.25em] text-accent-400">
                {state.room.code}
              </span>
              <button
                type="button"
                onClick={copyInvite}
                className="h-10 rounded-lg bg-accent-400 px-3.5 text-sm font-bold text-stage-900 hover:bg-accent-500"
              >
                Sao chép link mời
              </button>
              <button
                type="button"
                onClick={() => setConfirm({ kind: 'code' })}
                className={stageButton}
              >
                Tạo link mới
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1320px] flex-1 flex-wrap items-start gap-6 px-4 py-6 sm:px-6">
        <section
          aria-labelledby="seats-heading"
          className="flex min-w-0 flex-[999_1_640px] flex-col gap-4"
        >
          {notice && (
            <p
              role={notice.tone === 'error' ? 'alert' : 'status'}
              className={`rounded-xl px-4 py-3 text-sm ${
                notice.tone === 'error'
                  ? 'border border-orange-300/60 bg-stage-800 text-orange-200'
                  : 'bg-stage-800 text-green-300'
              }`}
            >
              {notice.text}
            </p>
          )}
          {state.room.status === 'in_match' && (
            <p
              role="status"
              className="rounded-xl bg-amber-100 px-4 py-3 text-sm font-semibold text-amber-900"
            >
              Trận đang diễn ra. Màn điều khiển trận sẽ có khi Game Engine hoàn thành.
            </p>
          )}
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="seats-heading" className="text-lg font-bold">
              Vị trí thi đấu
            </h2>
            <span className="text-sm text-stage-200">
              {readyCount}/{seated.length} người đã sẵn sàng
            </span>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-4">
            {Array.from({ length: state.room.maxPlayers }, (_, i) => i + 1).map((seat) => {
              const player = state.players.find((p) => p.seat === seat);
              if (!player) {
                return (
                  <article
                    key={seat}
                    aria-label={`Vị trí ${seat}: trống`}
                    className="flex flex-col overflow-hidden rounded-2xl border-2 border-stage-700 bg-stage-800"
                  >
                    <div className="relative flex h-[150px] items-center justify-center">
                      <span className="flex size-16 items-center justify-center rounded-full bg-stage-700 text-[22px] font-extrabold">
                        +
                      </span>
                      <span className="absolute left-2.5 top-2.5">
                        <SeatChip seat={seat} />
                      </span>
                    </div>
                    <div className="flex flex-col gap-2.5 px-3.5 py-3">
                      <span className="text-base font-bold text-stage-200">Vị trí trống</span>
                      <ActionMenu
                        theme="stage"
                        label={`Gán người chơi vào vị trí ${seat}`}
                        trigger="Gán người chơi"
                        items={
                          unseated.length > 0
                            ? unseated.map((p) => ({
                                label: p.displayName,
                                onSelect: () => void act(p, { type: 'seat', seat }),
                              }))
                            : [
                                {
                                  label: 'Chưa có người chơi chờ xếp chỗ',
                                  disabled: true,
                                  onSelect: () => undefined,
                                },
                              ]
                        }
                      />
                    </div>
                  </article>
                );
              }
              return (
                <article
                  key={seat}
                  aria-label={`Vị trí ${seat}: ${player.displayName}`}
                  className={`flex flex-col overflow-hidden rounded-2xl border-2 bg-stage-800 ${
                    player.ready ? SEAT_BORDER[seat] : 'border-stage-700'
                  }`}
                >
                  <div className="relative flex h-[150px] items-center justify-center bg-[#1E3A75]">
                    <span
                      className={`flex size-16 items-center justify-center rounded-full text-[22px] font-extrabold text-stage-900 ${SEAT_BG[seat]}`}
                    >
                      {initials(player.displayName)}
                    </span>
                    <span className="absolute left-2.5 top-2.5">
                      <SeatChip seat={seat} />
                    </span>
                    <span className="absolute bottom-2.5 right-2.5 text-xs text-stage-200">
                      {guestOrUser(player)}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2.5 px-3.5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-base font-bold">
                        {player.displayName}
                      </span>
                      <PlayerStateLabel participant={player} />
                    </div>
                    <div className="flex gap-2">
                      <ActionMenu
                        theme="stage"
                        className="flex-1"
                        label={`Đổi vị trí cho ${player.displayName}`}
                        trigger="Đổi vị trí"
                        items={seatMenu(player)}
                      />
                      <ActionMenu
                        theme="stage"
                        label={`Thêm thao tác cho vị trí ${seat}`}
                        items={playerMenu(player)}
                      />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {unseated.length > 0 && (
            <section
              aria-labelledby="unseated-heading"
              className="flex flex-col gap-3 rounded-2xl bg-stage-800 p-4"
            >
              <h3 id="unseated-heading" className="text-base font-bold">
                Người chơi chưa có vị trí
              </h3>
              <ul className="flex flex-col gap-2">
                {unseated.map((player) => (
                  <li key={player.id} className="flex items-center gap-2.5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-stage-700 text-[13px] font-bold">
                      {initials(player.displayName)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {player.displayName}
                      </span>
                      <PlayerStateLabel participant={player} />
                    </span>
                    <ActionMenu
                      theme="stage"
                      label={`Xếp vị trí cho ${player.displayName}`}
                      trigger="Xếp vị trí"
                      items={seatMenu(player)}
                    />
                    <ActionMenu
                      theme="stage"
                      label={`Thêm thao tác cho ${player.displayName}`}
                      items={playerMenu(player)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-stage-800 px-5 py-4">
            <label className="flex items-center gap-2.5 text-sm text-stage-200">
              <input
                type="checkbox"
                checked={skipReady}
                onChange={(event) => setSkipReady(event.target.checked)}
                className="size-[18px] accent-accent-400"
              />
              Bắt đầu không cần chờ tất cả Sẵn sàng
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                to={`/phong-thi/${roomId}/sua`}
                className="inline-flex h-12 items-center rounded-xl border border-stage-700 px-4 text-[15px] font-semibold text-white no-underline hover:bg-white/5 hover:text-white hover:no-underline"
              >
                Sửa cấu hình
              </Link>
              <button
                type="button"
                onClick={() => setConfirm({ kind: 'close' })}
                className="h-12 rounded-xl border border-stage-700 px-4 text-[15px] font-semibold text-red-300 hover:bg-white/5"
              >
                Đóng phòng
              </button>
              <button
                type="button"
                disabled
                aria-describedby="start-match-hint"
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-accent-400 px-6 text-base font-extrabold text-stage-900 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
              >
                <PlayIcon />
                {enoughPlayers ? 'Bắt đầu trận' : 'Chưa đủ người'}
              </button>
            </div>
            <p id="start-match-hint" className="w-full text-[13px] text-stage-200">
              {!enoughPlayers
                ? 'Cần ít nhất 2 người chơi đã có vị trí.'
                : !allReady && !skipReady
                  ? 'Chờ tất cả người chơi bấm Sẵn sàng, hoặc chọn bắt đầu không cần chờ.'
                  : 'Đủ điều kiện. Chức năng bắt đầu trận đang được phát triển.'}
            </p>
          </div>
        </section>

        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <section
            aria-labelledby="pending-heading"
            className="flex flex-col gap-3 rounded-2xl bg-stage-800 p-[18px]"
          >
            <h2 id="pending-heading" className="text-base font-bold">
              Chờ duyệt
              <span className="ml-1.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-accent-400 px-1.5 text-[13px] text-stage-900">
                {state.pending.length}
              </span>
            </h2>
            {state.pending.length === 0 && (
              <p className="text-sm text-stage-200">Không có ai đang chờ duyệt.</p>
            )}
            {state.pending.map((p) => (
              <div key={p.id} className="flex items-center gap-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-stage-700 text-[13px] font-bold">
                  {initials(p.displayName)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold">{p.displayName}</span>
                  <span className="text-xs text-stage-200">
                    {guestOrUser(p)} · muốn làm người chơi
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={`Duyệt ${p.displayName}`}
                  disabled={busy}
                  onClick={() => void act(p, { type: 'approve' })}
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-green-700 text-white hover:bg-green-800 disabled:opacity-50"
                >
                  <CheckIcon />
                </button>
                <button
                  type="button"
                  aria-label={`Từ chối ${p.displayName}`}
                  disabled={busy}
                  onClick={() => void act(p, { type: 'reject' })}
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-stage-700 text-white hover:bg-white/5 disabled:opacity-50"
                >
                  <CloseIcon />
                </button>
              </div>
            ))}
          </section>

          <section
            aria-labelledby="spectators-heading"
            className="flex flex-col gap-3 rounded-2xl bg-stage-800 p-[18px]"
          >
            <div className="flex items-baseline justify-between">
              <h2 id="spectators-heading" className="text-base font-bold">
                Khán giả
              </h2>
              <span className="text-[13px] text-stage-200">
                {state.room.allowSpectators
                  ? `${state.spectators.count}/${state.room.maxSpectators}`
                  : 'Không cho phép'}
              </span>
            </div>
            {state.spectators.count === 0 && (
              <p className="text-sm text-stage-200">Chưa có khán giả.</p>
            )}
            <ul className="flex flex-col gap-2 text-sm">
              {spectators.map((s) => (
                <li key={s.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{s.displayName}</span>
                  <span className="text-xs text-stage-200">
                    {s.connection === 'disconnected' ? 'Mất kết nối' : guestOrUser(s)}
                  </span>
                  <ActionMenu
                    theme="stage"
                    label={`Thao tác với khán giả ${s.displayName}`}
                    items={[
                      {
                        label: 'Chuyển thành người chơi',
                        onSelect: () => void act(s, { type: 'role', role: 'player' }),
                      },
                      {
                        label: 'Mời ra khỏi phòng',
                        tone: 'danger',
                        onSelect: () => setConfirm({ kind: 'kick', participant: s }),
                      },
                      {
                        label: 'Cấm khỏi phòng',
                        tone: 'danger',
                        onSelect: () => setConfirm({ kind: 'ban', participant: s }),
                      },
                    ]}
                  />
                </li>
              ))}
            </ul>
            {state.spectators.items.length > SPECTATOR_PREVIEW && (
              <button
                type="button"
                onClick={() => setShowAllSpectators((value) => !value)}
                className="self-start text-sm font-semibold text-accent-400 hover:text-accent-500"
              >
                {showAllSpectators ? 'Thu gọn' : `Xem tất cả ${state.spectators.count} khán giả`}
              </button>
            )}
          </section>

          <section aria-label="Cảm xúc" className="rounded-2xl bg-stage-800 p-[18px]">
            <ReactionBar enabled={state.room.reactionsEnabled} onSend={onSendReaction} />
          </section>
        </aside>
      </main>

      {confirm && (
        <Modal
          title={
            confirm.kind === 'kick'
              ? `Mời ${confirm.participant.displayName} ra khỏi phòng?`
              : confirm.kind === 'ban'
                ? `Cấm ${confirm.participant.displayName}?`
                : confirm.kind === 'code'
                  ? 'Tạo link mời mới?'
                  : 'Đóng phòng?'
          }
          description={
            confirm.kind === 'kick'
              ? 'Người này có thể vào lại bằng mã phòng.'
              : confirm.kind === 'ban'
                ? 'Người này bị đưa ra và không vào lại được phòng này.'
                : confirm.kind === 'code'
                  ? 'Mã phòng mới được tạo; mã và link mời cũ hết hiệu lực. Người đang trong phòng không bị ảnh hưởng.'
                  : 'Mọi người sẽ rời phòng và mã phòng hết hiệu lực. Phòng đã đóng không mở lại được.'
          }
          onClose={() => setConfirm(null)}
        >
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Hủy
            </Button>
            <Button
              variant={confirm.kind === 'code' ? 'primary' : 'danger'}
              loading={roomAction.isPending}
              onClick={() => void runConfirm()}
            >
              {confirm.kind === 'kick'
                ? 'Mời ra'
                : confirm.kind === 'ban'
                  ? 'Cấm khỏi phòng'
                  : confirm.kind === 'code'
                    ? 'Tạo mã mới'
                    : 'Đóng phòng'}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
