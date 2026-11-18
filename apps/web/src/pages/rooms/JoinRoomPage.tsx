import {
  type ParticipantRole,
  ROOM_CODE_LENGTH,
  RoomErrorCode,
  type RoomPreview,
  roomCodeSchema,
} from '@olympia/shared';
import { type FormEvent, type ReactNode, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Wordmark } from '../../components/Card';
import { AlertCircleIcon, CheckIcon } from '../../components/icons';
import { useAuth } from '../../features/auth/use-auth';
import { joinRoom, usePublicRooms, useRoomLookup } from '../../features/rooms/rooms-api';
import { ApiError, errorMessage } from '../../lib/api-client';
import type { FieldErrors } from '../../lib/form-errors';

const stageInput =
  'block w-full rounded-lg border bg-stage-800 px-3.5 text-white placeholder:text-stage-200/60';

function normalizeCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, ROOM_CODE_LENGTH);
}

function StageField({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="flex items-center gap-1.5 text-[13px] text-orange-300">
          <AlertCircleIcon size={16} className="shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

function RoleOption({
  value,
  current,
  title,
  description,
  disabled,
  onChange,
}: {
  value: ParticipantRole;
  current: ParticipantRole;
  title: string;
  description: string;
  disabled: boolean;
  onChange: (value: ParticipantRole) => void;
}) {
  const checked = value === current && !disabled;
  return (
    <label
      className={`flex items-center gap-3 rounded-xl bg-stage-800 p-3.5 ${
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
      } ${checked ? 'border-2 border-accent-400' : 'border border-stage-700'}`}
    >
      <input
        type="radio"
        name="role"
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
        className="size-5 shrink-0 accent-accent-400"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-base font-bold">{title}</span>
        <span className="text-[13px] text-stage-200">{description}</span>
      </span>
    </label>
  );
}

function roomStatusLine(room: RoomPreview): string {
  if (room.status === 'in_match')
    return `Phòng “${room.name}” đang thi – chỉ vào được làm khán giả`;
  return `Phòng “${room.name}” đang mở`;
}

function JoinForm({ initialCode }: { initialCode: string }) {
  const navigate = useNavigate();
  const { status, user } = useAuth();
  const [code, setCode] = useState(initialCode);
  /** `null`: chưa sửa – dùng tên tài khoản (nếu đã đăng nhập). */
  const [editedName, setEditedName] = useState<string | null>(null);
  const displayName = editedName ?? user?.displayName ?? '';
  const [role, setRole] = useState<ParticipantRole>('player');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<{ text: string; hostRoomId?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const validCode = roomCodeSchema.safeParse(code).success ? code : null;
  const lookup = useRoomLookup(validCode);
  const room = lookup.data;

  const playersLeft = room ? room.players.total - room.players.taken : 0;
  const spectatorsLeft = room ? room.spectators.total - room.spectators.taken : 0;
  const playerDisabled = !room || room.status !== 'open' || playersLeft <= 0;
  const spectatorDisabled = !room || !room.allowSpectators || spectatorsLeft <= 0;
  const effectiveRole: ParticipantRole =
    role === 'player' && playerDisabled && !spectatorDisabled ? 'spectator' : role;
  const guestsBlocked = room && !room.allowGuests && status === 'anonymous';

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const nextErrors: FieldErrors = {};
    if (!validCode) nextErrors.code = `Mã phòng gồm ${ROOM_CODE_LENGTH} ký tự chữ và số.`;
    const name = displayName.trim().replace(/\s+/g, ' ');
    if (!user && name.length < 2) nextErrors.displayName = 'Tên hiển thị tối thiểu 2 ký tự.';
    if (room?.requiresPassword && !password) nextErrors.password = 'Nhập mật khẩu phòng.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !room) return;

    setSubmitting(true);
    try {
      await joinRoom(room.id, {
        role: effectiveRole,
        ...(room.requiresPassword ? { password } : {}),
        ...(name && (!user || name !== user.displayName) ? { displayName: name } : {}),
      });
      await navigate(`/phong/${room.id}`);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === RoomErrorCode.DisplayNameTaken) {
          setErrors({ displayName: error.message });
          return;
        }
        if (error.code === RoomErrorCode.WrongRoomPassword) {
          setErrors({ password: error.message });
          return;
        }
        if (error.code === RoomErrorCode.HostCannotJoin) {
          setFormError({ text: 'Đây là phòng của bạn.', hostRoomId: room.id });
          return;
        }
      }
      setFormError({ text: errorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-5">
      <StageField id="room-code" label="Mã phòng" error={errors.code}>
        <input
          id="room-code"
          value={code}
          onChange={(event) => setCode(normalizeCode(event.target.value))}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          aria-invalid={errors.code || lookup.isError ? true : undefined}
          aria-describedby="room-code-status"
          className="block h-16 w-full rounded-xl border-2 border-accent-400 bg-stage-800 px-4 text-center text-[30px] font-extrabold uppercase tracking-[0.3em] text-white"
        />
        <p id="room-code-status" aria-live="polite" className="min-h-5 text-[13px]">
          {lookup.isFetching && !room && <span className="text-stage-200">Đang tìm phòng…</span>}
          {room && (
            <span className="flex items-center gap-1.5 text-green-300">
              <CheckIcon size={16} className="shrink-0" />
              {roomStatusLine(room)}
            </span>
          )}
          {lookup.isError && (
            <span className="flex items-center gap-1.5 text-orange-300">
              <AlertCircleIcon size={16} className="shrink-0" />
              {errorMessage(lookup.error)}
            </span>
          )}
        </p>
      </StageField>

      {guestsBlocked ? (
        <p role="alert" className="rounded-xl border border-orange-300/60 bg-stage-800 p-4 text-sm">
          Phòng này chỉ dành cho người có tài khoản.{' '}
          <Link
            to={`/dang-nhap?next=${encodeURIComponent(`/vao-phong/${code}`)}`}
            className="font-semibold text-accent-400 hover:text-accent-500"
          >
            Đăng nhập
          </Link>{' '}
          để tham gia.
        </p>
      ) : (
        <>
          <StageField id="display-name" label="Tên hiển thị" error={errors.displayName}>
            <input
              id="display-name"
              value={displayName}
              onChange={(event) => setEditedName(event.target.value)}
              maxLength={50}
              autoComplete="nickname"
              aria-invalid={errors.displayName ? true : undefined}
              aria-describedby={errors.displayName ? 'display-name-error' : undefined}
              className={`${stageInput} h-12 text-base font-medium ${
                errors.displayName ? 'border-2 border-orange-300' : 'border-stage-700'
              }`}
            />
          </StageField>

          {room?.requiresPassword && (
            <StageField id="room-password" label="Mật khẩu phòng" error={errors.password}>
              <input
                id="room-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="off"
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? 'room-password-error' : undefined}
                className={`${stageInput} h-12 text-base ${
                  errors.password ? 'border-2 border-orange-300' : 'border-stage-700'
                }`}
              />
            </StageField>
          )}

          <fieldset className="flex flex-col gap-2.5">
            <legend className="mb-2.5 text-sm font-semibold">Tham gia với vai trò</legend>
            <RoleOption
              value="player"
              current={effectiveRole}
              title="Người chơi"
              description={
                !room
                  ? 'Nhập mã phòng để xem số chỗ'
                  : room.status !== 'open'
                    ? 'Trận đang diễn ra'
                    : playersLeft <= 0
                      ? 'Đã đủ người chơi'
                      : `Còn ${playersLeft}/${room.players.total} chỗ · Host sẽ duyệt`
              }
              disabled={playerDisabled}
              onChange={setRole}
            />
            <RoleOption
              value="spectator"
              current={effectiveRole}
              title="Khán giả"
              description={
                room && !room.allowSpectators
                  ? 'Phòng không nhận khán giả'
                  : room && spectatorsLeft <= 0
                    ? 'Đã đủ khán giả'
                    : 'Xem, nghe và gửi cảm xúc'
              }
              disabled={spectatorDisabled}
              onChange={setRole}
            />
          </fieldset>
        </>
      )}

      {formError && (
        <p role="alert" className="flex gap-2 text-sm text-orange-300">
          <AlertCircleIcon size={18} className="mt-0.5 shrink-0" />
          <span>
            {formError.text}{' '}
            {formError.hostRoomId && (
              <Link
                to={`/phong/${formError.hostRoomId}`}
                className="font-semibold text-accent-400 hover:text-accent-500"
              >
                Vào sảnh chờ với vai trò Host
              </Link>
            )}
          </span>
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || Boolean(guestsBlocked)}
        aria-busy={submitting || undefined}
        className="mt-2 h-[52px] rounded-xl bg-accent-400 text-[17px] font-extrabold text-stage-900 hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Đang vào phòng…' : 'Vào phòng'}
      </button>
    </form>
  );
}

function PublicRooms() {
  const rooms = usePublicRooms();
  const navigate = useNavigate();
  const items = rooms.data ?? [];

  return (
    <section aria-labelledby="public-rooms-heading" className="flex flex-col gap-3">
      <h2 id="public-rooms-heading" className="text-lg font-bold">
        Phòng công khai đang mở
      </h2>
      {rooms.isPending && <p className="text-sm text-stage-200">Đang tải…</p>}
      {rooms.isError && <p className="text-sm text-orange-300">{errorMessage(rooms.error)}</p>}
      {rooms.isSuccess && items.length === 0 && (
        <p className="text-sm text-stage-200">Chưa có phòng công khai nào đang mở.</p>
      )}
      <ul className="flex flex-col gap-2.5">
        {items.map((room) => (
          <li key={room.id}>
            <button
              type="button"
              onClick={() => void navigate(`/vao-phong/${room.code}`)}
              className="flex w-full items-center gap-3 rounded-xl border border-stage-700 bg-stage-800 p-3.5 text-left hover:border-accent-400"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{room.name}</span>
                <span className="block text-[13px] text-stage-200">
                  {room.hostName} · {room.players.taken}/{room.players.total} người chơi
                  {room.requiresPassword ? ' · có mật khẩu' : ''}
                </span>
              </span>
              <span className="font-bold tracking-[0.12em] text-accent-400">{room.code}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Vào phòng bằng mã hoặc link mời `/vao-phong/<mã>` (màn JoinRoom, DL-027). */
export function JoinRoomPage() {
  const { code: codeParam } = useParams();
  const { status } = useAuth();
  const initialCode = normalizeCode(codeParam ?? '');

  return (
    <div className="min-h-dvh bg-stage-900 font-sans text-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-7 px-5 pb-8 pt-6 sm:px-6">
        <Link
          to="/"
          className="self-start hover:no-underline"
          aria-label="Olympia Online – trang chủ"
        >
          <Wordmark className="text-lg" />
        </Link>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-16">
          <div className="flex flex-col gap-7">
            <div>
              <h1 className="text-[28px] font-extrabold leading-tight">Vào phòng thi</h1>
              <p className="mt-2 text-[15px] leading-normal text-stage-200">
                Nhập mã phòng Host gửi cho bạn. Không cần tài khoản.
              </p>
            </div>
            <JoinForm key={initialCode} initialCode={initialCode} />
            {status === 'anonymous' && (
              <p className="text-center text-sm text-stage-200">
                Có tài khoản?{' '}
                <Link
                  to={`/dang-nhap?next=${encodeURIComponent(`/vao-phong/${initialCode}`)}`}
                  className="font-semibold text-accent-400 hover:text-accent-500"
                >
                  Đăng nhập
                </Link>{' '}
                để lưu lịch sử thi.
              </p>
            )}
          </div>
          <PublicRooms />
        </div>
      </div>
    </div>
  );
}
