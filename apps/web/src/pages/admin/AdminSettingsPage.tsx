import {
  REACTION_PALETTE,
  type Reaction,
  type SystemSettings,
  systemSettingsSchema,
} from '@olympia/shared';
import { useState } from 'react';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Card';
import { TextField } from '../../components/TextField';
import { useSystemSettings, useUpdateSystemSettings } from '../../features/admin/admin-api';
import { formatDateTime } from '../../features/results/results-format';
import { errorMessage } from '../../lib/api-client';
import { type FieldErrors, zodFieldErrors } from '../../lib/form-errors';

type NumberKey = Exclude<keyof SystemSettings, 'reactions'>;

const GROUPS: { title: string; fields: { key: NumberKey; label: string; unit: string }[] }[] = [
  {
    title: 'Phòng thi',
    fields: [
      { key: 'maxActiveRoomsPerHost', label: 'Số phòng mở cùng lúc của một Host', unit: 'phòng' },
      { key: 'maxSpectatorsPerRoom', label: 'Số khán giả tối đa mỗi phòng', unit: 'người' },
    ],
  },
  {
    title: 'Thời gian chờ',
    fields: [
      { key: 'reconnectGraceSeconds', label: 'Giữ chỗ khi mất kết nối', unit: 'giây' },
      { key: 'roomIdleMinutes', label: 'Tự đóng phòng không hoạt động sau', unit: 'phút' },
      {
        key: 'hostReconnectMinutes',
        label: 'Kết thúc trận khi Host mất kết nối quá',
        unit: 'phút',
      },
    ],
  },
  {
    title: 'Media câu hỏi',
    fields: [
      { key: 'imageMaxMb', label: 'Ảnh tối đa', unit: 'MB' },
      { key: 'videoMaxMb', label: 'Video tối đa', unit: 'MB' },
      { key: 'audioMaxMb', label: 'Âm thanh tối đa', unit: 'MB' },
    ],
  },
];

function SettingsForm({
  settings,
  defaults,
  updatedAt,
}: {
  settings: SystemSettings;
  defaults: SystemSettings;
  updatedAt: string | null;
}) {
  const update = useUpdateSystemSettings();
  const [draft, setDraft] = useState<Record<NumberKey, string>>(
    () =>
      Object.fromEntries(
        GROUPS.flatMap((g) => g.fields).map((f) => [f.key, String(settings[f.key])]),
      ) as Record<NumberKey, string>,
  );
  const [reactions, setReactions] = useState<Reaction[]>(settings.reactions);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saved, setSaved] = useState(false);

  function submit() {
    setSaved(false);
    const candidate = {
      ...Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, Number(v)])),
      // Giữ thứ tự của bảng reaction.
      reactions: REACTION_PALETTE.filter((r) => reactions.includes(r)),
    };
    const parsed = systemSettingsSchema.safeParse(candidate);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    update.mutate(parsed.data, { onSuccess: () => setSaved(true) });
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-5"
    >
      {saved && <Alert tone="success">Đã lưu cấu hình. Thay đổi có hiệu lực ngay.</Alert>}
      {update.isError && <Alert tone="error">{errorMessage(update.error)}</Alert>}
      {GROUPS.map((group) => (
        <section
          key={group.title}
          aria-label={group.title}
          className="flex flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-5"
        >
          <h2 className="text-lg font-bold">{group.title}</h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
            {group.fields.map((f) => (
              <TextField
                key={f.key}
                label={`${f.label} (${f.unit})`}
                type="number"
                inputMode="numeric"
                min={1}
                value={draft[f.key]}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                error={errors[f.key]}
                hint={`Mặc định: ${defaults[f.key]} ${f.unit}`}
              />
            ))}
          </div>
        </section>
      ))}
      <section
        aria-labelledby="reactions-h"
        className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5"
      >
        <h2 id="reactions-h" className="text-lg font-bold">
          Reaction của khán giả
        </h2>
        <div role="group" aria-labelledby="reactions-h" className="flex flex-wrap gap-2.5">
          {REACTION_PALETTE.map((emoji) => {
            const on = reactions.includes(emoji);
            return (
              <label
                key={emoji}
                className={`flex h-11 items-center gap-2 rounded-lg px-3 text-xl ${
                  on ? 'border-2 border-brand-600 bg-brand-50' : 'border border-slate-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  aria-label={`Bật ${emoji}`}
                  onChange={() =>
                    setReactions((list) =>
                      on ? list.filter((r) => r !== emoji) : [...list, emoji],
                    )
                  }
                  className="size-4 accent-brand-600"
                />
                {emoji}
              </label>
            );
          })}
        </div>
        {errors.reactions && <p className="text-[13px] text-orange-800">{errors.reactions}</p>}
      </section>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {updatedAt && (
          <span className="text-[13px] text-slate-600">
            Cập nhật lần cuối {formatDateTime(updatedAt)}
          </span>
        )}
        <Button
          variant="secondary"
          onClick={() => {
            setDraft(
              Object.fromEntries(
                GROUPS.flatMap((g) => g.fields).map((f) => [f.key, String(defaults[f.key])]),
              ) as Record<NumberKey, string>,
            );
            setReactions(defaults.reactions);
          }}
        >
          Khôi phục mặc định
        </Button>
        <Button type="submit" loading={update.isPending}>
          Lưu cấu hình
        </Button>
      </div>
    </form>
  );
}

/** Cấu hình hệ thống `/quan-tri/cau-hinh` (mục 15.1, DL-049); chỉ Super Admin. */
export function AdminSettingsPage() {
  const settings = useSystemSettings();
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[28px] font-bold">Cấu hình hệ thống</h1>
        <p className="mt-1 text-sm text-slate-600">
          Áp dụng cho toàn hệ thống, có hiệu lực ngay và được ghi vào nhật ký quản trị.
        </p>
      </div>
      {settings.isPending && <Spinner />}
      {settings.isError && <Alert tone="error">{errorMessage(settings.error)}</Alert>}
      {settings.data && (
        <SettingsForm
          settings={settings.data.settings}
          defaults={settings.data.defaults}
          updatedAt={settings.data.updatedAt}
        />
      )}
    </div>
  );
}
