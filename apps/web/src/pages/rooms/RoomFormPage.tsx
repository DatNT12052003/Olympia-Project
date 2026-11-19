import {
  type ControlMode,
  createRoomRequestSchema,
  type HostRoom,
  MAX_PLAYERS,
  MIN_PLAYERS,
  ROUND_TITLES,
  type RoomVisibility,
  type UpdateRoomRequest,
  updateRoomRequestSchema,
} from '@olympia/shared';
import { type FormEvent, type ReactNode, useId, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Spinner, Wordmark } from '../../components/Card';
import { ChevronLeftIcon } from '../../components/icons';
import { SelectField, TextField } from '../../components/TextField';
import { useScripts } from '../../features/match/match-api';
import {
  useCreateRoom,
  useHostRoom,
  useRoomAction,
  useUpdateRoom,
} from '../../features/rooms/rooms-api';
import { CONTROL_MODE_LABELS, VISIBILITY_LABELS } from '../../features/rooms/room-format';
import { errorMessage } from '../../lib/api-client';
import { apiFieldErrors, type FieldErrors, validate } from '../../lib/form-errors';

interface FormValues {
  name: string;
  description: string;
  maxPlayers: number;
  allowGuests: boolean;
  autoApprove: boolean;
  allowSpectators: boolean;
  maxSpectators: string;
  reactionsEnabled: boolean;
  visibility: RoomVisibility;
  /** Mật khẩu mới; bỏ trống khi sửa = giữ nguyên. */
  password: string;
  removePassword: boolean;
  controlMode: ControlMode;
  /** `''` = chưa chọn kịch bản. */
  scriptId: string;
}

const DEFAULTS: FormValues = {
  name: '',
  description: '',
  maxPlayers: 4,
  allowGuests: true,
  autoApprove: false,
  allowSpectators: true,
  maxSpectators: '50',
  reactionsEnabled: true,
  visibility: 'private',
  password: '',
  removePassword: false,
  controlMode: 'manual',
  scriptId: '',
};

function fromRoom(room: HostRoom): FormValues {
  return {
    name: room.name,
    description: room.description ?? '',
    maxPlayers: room.maxPlayers,
    allowGuests: room.allowGuests,
    autoApprove: room.autoApprove,
    allowSpectators: room.allowSpectators,
    maxSpectators: String(room.maxSpectators),
    reactionsEnabled: room.reactionsEnabled,
    visibility: room.visibility,
    password: '',
    removePassword: false,
    controlMode: room.controlMode,
    scriptId: room.script?.id ?? '',
  };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Switch({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3.5">
      <span className="flex flex-col gap-0.5">
        <span className="text-[15px] font-semibold">{label}</span>
        {description && <span className="text-[13px] text-slate-600">{description}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-6 w-11 shrink-0 accent-brand-600"
      />
    </label>
  );
}

function ChoiceCard<T extends string>({
  name,
  value,
  current,
  title,
  description,
  onChange,
}: {
  name: string;
  value: T;
  current: T;
  title: string;
  description: string;
  onChange: (value: T) => void;
}) {
  const checked = value === current;
  const id = useId();
  return (
    <label
      className={`flex cursor-pointer gap-3 rounded-xl p-3.5 ${
        checked ? 'border-2 border-brand-600 bg-brand-50' : 'border border-slate-300'
      }`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={() => onChange(value)}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        className="mt-0.5 size-[18px] shrink-0 accent-brand-600"
      />
      <span>
        <span id={`${id}-title`} className="block font-semibold">
          {title}
        </span>
        <span id={`${id}-description`} className="text-[13px] text-slate-600">
          {description}
        </span>
      </span>
    </label>
  );
}

function RoomForm({ room }: { room?: HostRoom }) {
  const navigate = useNavigate();
  const editing = Boolean(room);
  const createRoom = useCreateRoom();
  const updateRoom = useUpdateRoom(room?.id ?? '');
  const roomAction = useRoomAction();
  const [values, setValues] = useState<FormValues>(room ? fromRoom(room) : DEFAULTS);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<'draft' | 'open' | null>(null);
  const scripts = useScripts();
  const selectedScript = scripts.data?.find((s) => s.id === values.scriptId);

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((previous) => ({ ...previous, [key]: value }));

  const maxSpectators = Number.parseInt(values.maxSpectators, 10);
  const isPrivate = values.visibility === 'private';

  function baseInput() {
    return {
      name: values.name,
      description: values.description,
      maxPlayers: values.maxPlayers,
      visibility: values.visibility,
      allowGuests: values.allowGuests,
      autoApprove: values.autoApprove,
      allowSpectators: values.allowSpectators,
      maxSpectators: Number.isNaN(maxSpectators) ? 0 : maxSpectators,
      reactionsEnabled: values.reactionsEnabled,
      controlMode: values.controlMode,
      scriptId: values.scriptId || null,
    };
  }

  async function submit(open: boolean) {
    setFormError(null);
    setPendingAction(open ? 'open' : 'draft');
    try {
      if (!room) {
        const checked = validate(createRoomRequestSchema, {
          ...baseInput(),
          password: isPrivate && values.password ? values.password : null,
          open,
        });
        if (checked.errors) {
          setErrors(checked.errors);
          return;
        }
        setErrors({});
        const created = await createRoom.mutateAsync(checked.data);
        if (created) await navigate(open ? `/phong/${created.id}` : '/phong-thi');
        return;
      }

      const input: UpdateRoomRequest = { ...baseInput() };
      if (isPrivate && values.password) input.password = values.password;
      else if (!isPrivate || values.removePassword) input.password = null;
      const checked = validate(updateRoomRequestSchema, input);
      if (checked.errors) {
        setErrors(checked.errors);
        return;
      }
      setErrors({});
      await updateRoom.mutateAsync(checked.data);
      if (room.status === 'draft' && open) {
        await roomAction.mutateAsync({ roomId: room.id, action: 'open' });
      }
      await navigate(room.status === 'open' || open ? `/phong/${room.id}` : '/phong-thi');
    } catch (error) {
      setErrors(apiFieldErrors(error));
      setFormError(errorMessage(error));
    } finally {
      setPendingAction(null);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit(room ? room.status === 'open' : true);
  }

  const busy = pendingAction !== null;
  const roomIsOpen = room?.status === 'open';

  return (
    <div className="flex flex-wrap items-start gap-6">
      <form
        noValidate
        onSubmit={onSubmit}
        className="flex min-w-0 flex-[999_1_560px] flex-col gap-5"
        aria-labelledby="room-form-heading"
      >
        {formError && <Alert tone="error">{formError}</Alert>}

        <Section title="Thông tin phòng">
          <TextField
            label="Tên phòng *"
            value={values.name}
            onChange={(event) => set('name', event.target.value)}
            error={errors.name}
            maxLength={100}
            required
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="room-description" className="text-sm font-semibold">
              Mô tả
            </label>
            <textarea
              id="room-description"
              rows={3}
              maxLength={500}
              value={values.description}
              onChange={(event) => set('description', event.target.value)}
              aria-describedby="room-description-count"
              className="resize-y rounded-lg border border-slate-300 px-3.5 py-2.5 text-[15px]"
            />
            <span id="room-description-count" className="self-end text-xs text-slate-600">
              {values.description.length}/500
            </span>
          </div>
        </Section>

        <Section title="Người tham gia">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Số người chơi</legend>
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-300">
              {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i).map(
                (count) => (
                  <label
                    key={count}
                    className={`flex h-11 w-16 cursor-pointer items-center justify-center font-semibold not-first:border-l not-first:border-slate-300 has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-brand-600 ${
                      values.maxPlayers === count ? 'bg-brand-600 font-bold text-white' : ''
                    }`}
                  >
                    <input
                      type="radio"
                      name="maxPlayers"
                      className="sr-only"
                      checked={values.maxPlayers === count}
                      onChange={() => set('maxPlayers', count)}
                    />
                    {count}
                  </label>
                ),
              )}
            </div>
            {errors.maxPlayers && (
              <p className="mt-1.5 text-[13px] text-orange-800">{errors.maxPlayers}</p>
            )}
          </fieldset>
          <div className="flex flex-col gap-4 border-t border-slate-100 pt-4">
            <Switch
              label="Cho phép khách tham gia"
              description="Người không có tài khoản vào bằng mã phòng và tên hiển thị."
              checked={values.allowGuests}
              onChange={(value) => set('allowGuests', value)}
            />
            <Switch
              label="Tự động duyệt người chơi"
              description="Tắt: bạn duyệt từng người trong sảnh chờ."
              checked={values.autoApprove}
              onChange={(value) => set('autoApprove', value)}
            />
            <div className="flex flex-col gap-3">
              <Switch
                label="Cho phép khán giả"
                description="Khán giả xem, nghe và gửi cảm xúc; không trả lời câu hỏi."
                checked={values.allowSpectators}
                onChange={(value) => set('allowSpectators', value)}
              />
              <TextField
                className="w-full max-w-56"
                label="Tối đa khán giả"
                type="number"
                inputMode="numeric"
                min={1}
                value={values.maxSpectators}
                onChange={(event) => set('maxSpectators', event.target.value)}
                disabled={!values.allowSpectators}
                hint="Tối đa theo giới hạn hệ thống"
                error={errors.maxSpectators}
              />
            </div>
            <Switch
              label="Cho phép gửi cảm xúc"
              description="Người chơi và khán giả gửi 👍 ❤️ 😂 🔥 trong phòng."
              checked={values.reactionsEnabled}
              onChange={(value) => set('reactionsEnabled', value)}
            />
          </div>
        </Section>

        <Section title="Truy cập và điều khiển">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Chế độ phòng</legend>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
              <ChoiceCard
                name="visibility"
                value="public"
                current={values.visibility}
                title="Công khai"
                description="Hiện trong danh sách phòng, ai cũng xin vào được."
                onChange={(value) => set('visibility', value)}
              />
              <ChoiceCard
                name="visibility"
                value="private"
                current={values.visibility}
                title="Riêng tư"
                description="Chỉ vào bằng mã hoặc link mời."
                onChange={(value) => set('visibility', value)}
              />
            </div>
          </fieldset>
          {isPrivate && (
            <div className="flex max-w-sm flex-col gap-2">
              <TextField
                label={
                  room?.hasPassword
                    ? 'Mật khẩu mới (để trống: giữ nguyên)'
                    : 'Mật khẩu phòng (tùy chọn)'
                }
                type="password"
                autoComplete="new-password"
                value={values.password}
                onChange={(event) => set('password', event.target.value)}
                disabled={values.removePassword}
                error={errors.password}
              />
              {room?.hasPassword && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-brand-600"
                    checked={values.removePassword}
                    onChange={(event) => set('removePassword', event.target.checked)}
                  />
                  Bỏ mật khẩu phòng
                </label>
              )}
            </div>
          )}
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Chế độ điều khiển</legend>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
              <ChoiceCard
                name="controlMode"
                value="manual"
                current={values.controlMode}
                title="Thủ công"
                description="Bạn chuyển câu, mở chuông, chấm điểm."
                onChange={(value) => set('controlMode', value)}
              />
              <ChoiceCard
                name="controlMode"
                value="auto"
                current={values.controlMode}
                title="Tự động theo kịch bản"
                description="Hệ thống tự chạy; bạn vẫn tạm dừng, chấm lại được."
                onChange={(value) => set('controlMode', value)}
              />
            </div>
          </fieldset>
          <div className="flex max-w-[480px] flex-col gap-1.5">
            <SelectField
              label="Kịch bản"
              value={values.scriptId}
              onChange={(event) => set('scriptId', event.target.value)}
              error={errors.scriptId}
              hint={
                selectedScript && selectedScript.supportedPlayers < values.maxPlayers
                  ? selectedScript.supportedPlayers < MIN_PLAYERS
                    ? 'Kịch bản chưa đủ câu hỏi để bắt đầu trận.'
                    : `Kịch bản chỉ đủ câu hỏi cho tối đa ${selectedScript.supportedPlayers} người chơi.`
                  : undefined
              }
            >
              <option value="">Chưa chọn kịch bản</option>
              {scripts.data?.map((script) => (
                <option key={script.id} value={script.id}>
                  {script.name}
                </option>
              ))}
            </SelectField>
            <Link to="/kich-ban/moi" className="self-start text-sm font-semibold">
              Tạo kịch bản mới
            </Link>
          </div>
        </Section>

        <div className="flex flex-wrap justify-end gap-3">
          {roomIsOpen ? (
            <>
              <Link
                to={`/phong/${room.id}`}
                className="inline-flex h-11 items-center rounded-lg border border-slate-300 bg-white px-5 text-[15px] font-semibold text-slate-900 no-underline hover:bg-slate-50 hover:text-slate-900 hover:no-underline"
              >
                Hủy
              </Link>
              <Button type="submit" loading={busy} loadingText="Đang lưu…">
                Lưu thay đổi
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                disabled={busy}
                loading={pendingAction === 'draft'}
                loadingText="Đang lưu…"
                onClick={() => void submit(false)}
              >
                Lưu nháp
              </Button>
              <Button
                type="submit"
                disabled={busy}
                loading={pendingAction === 'open'}
                loadingText="Đang mở phòng…"
              >
                {editing ? 'Lưu và mở sảnh chờ' : 'Tạo và mở sảnh chờ'}
              </Button>
            </>
          )}
        </div>
      </form>

      <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4 rounded-2xl bg-stage-900 p-6 text-white">
        <h2 className="text-base font-bold">Tóm tắt</h2>
        <ul className="flex flex-col gap-3 text-sm text-stage-200">
          {[
            ['Người chơi', String(values.maxPlayers)],
            ['Khách', values.allowGuests ? 'Cho phép' : 'Không cho phép'],
            [
              'Khán giả',
              values.allowSpectators
                ? `Tối đa ${Number.isNaN(maxSpectators) ? '—' : maxSpectators}`
                : 'Không cho phép',
            ],
            ['Duyệt người chơi', values.autoApprove ? 'Tự động' : 'Host duyệt'],
            [
              'Truy cập',
              `${VISIBILITY_LABELS[values.visibility]}${
                isPrivate && (values.password || (room?.hasPassword && !values.removePassword))
                  ? ' · có mật khẩu'
                  : ''
              }`,
            ],
            ['Điều khiển', CONTROL_MODE_LABELS[values.controlMode]],
            ['Kịch bản', selectedScript?.name ?? 'Chưa chọn'],
          ].map(([label, value]) => (
            <li key={label} className="flex justify-between gap-3">
              <span>{label}</span>
              <span className="text-right font-semibold text-white">{value}</span>
            </li>
          ))}
        </ul>
        {selectedScript && (
          <div className="flex flex-col gap-2 border-t border-stage-700 pt-4">
            <span className="text-[13px] font-semibold text-stage-200">
              Vòng thi trong kịch bản
            </span>
            <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm">
              {selectedScript.rounds.map((round) => (
                <li key={round}>{ROUND_TITLES[round]}</li>
              ))}
            </ol>
          </div>
        )}
        <p className="border-t border-stage-700 pt-4 text-[13px] leading-normal text-stage-200">
          {room?.code
            ? `Mã phòng hiện tại: ${room.code}.`
            : 'Mã phòng và link mời được tạo khi bạn mở phòng.'}
        </p>
      </aside>
    </div>
  );
}

/** Tạo phòng (`/phong-thi/tao`) hoặc sửa cấu hình (`/phong-thi/:roomId/sua`), theo màn CreateRoom. */
export function RoomFormPage() {
  const { roomId } = useParams();
  const room = useHostRoom(roomId);
  const editable = !roomId || room.data?.status === 'draft' || room.data?.status === 'open';

  return (
    <div className="min-h-dvh bg-canvas text-slate-900">
      <header className="bg-stage-900 text-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link to="/" className="hover:no-underline" aria-label="Olympia Online – trang chủ">
            <Wordmark className="text-xl" />
          </Link>
          <Link
            to="/phong-thi"
            className="inline-flex items-center gap-1.5 text-sm text-stage-200 no-underline hover:text-white"
          >
            <ChevronLeftIcon size={16} />
            Phòng thi
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-12 pt-8 sm:px-6">
        <h1 id="room-form-heading" className="mb-6 text-[28px] font-bold">
          {roomId ? 'Sửa cấu hình phòng' : 'Tạo phòng thi'}
        </h1>
        {roomId && room.isPending && <Spinner />}
        {roomId && room.isError && <Alert tone="error">{errorMessage(room.error)}</Alert>}
        {room.data && !editable && (
          <Alert tone="warning">
            Chỉ sửa được phòng nháp hoặc đang mở (không sửa khi đang thi).
          </Alert>
        )}
        {(!roomId || (room.data && editable)) && <RoomForm key={roomId} room={room.data} />}
      </main>
    </div>
  );
}
