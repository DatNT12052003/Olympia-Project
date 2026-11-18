import {
  type AdminUser,
  lockUserRequestSchema,
  type Organization,
  systemRoleSchema,
} from '@olympia/shared';
import { type FormEvent, useState } from 'react';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { SelectField, TextField } from '../../components/TextField';
import { useAdminUsers, useLockUser, useUpdateUser } from '../../features/admin/admin-api';
import { ROLE_LABELS } from '../../features/auth/role-labels';
import { errorMessage } from '../../lib/api-client';

export function LockUserDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();
  const lock = useLockUser();

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = lockUserRequestSchema.safeParse({ reason });
    setError(parsed.success ? undefined : parsed.error.issues[0]?.message);
    if (parsed.success) lock.mutate({ userId: user.id, ...parsed.data }, { onSuccess: onClose });
  }

  return (
    <Modal
      title={`Khóa tài khoản ${user.displayName}`}
      description="Người dùng sẽ bị đăng xuất khỏi mọi thiết bị và không đăng nhập được cho tới khi mở khóa."
      onClose={onClose}
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <TextField
          label="Lý do khóa"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={error}
          maxLength={500}
        />
        {lock.isError && <Alert tone="error">{errorMessage(lock.error)}</Alert>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" variant="danger" loading={lock.isPending} loadingText="Đang khóa…">
            Khóa tài khoản
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Chỉ Super Admin: vai trò, quyền Host, tổ chức. */
export function PermissionsDialog({
  user,
  organizations,
  onClose,
}: {
  user: AdminUser;
  organizations: Organization[];
  onClose: () => void;
}) {
  const [systemRole, setSystemRole] = useState(user.systemRole);
  const [canHost, setCanHost] = useState(user.canHost);
  const [organizationId, setOrganizationId] = useState(user.organizationId ?? '');
  const update = useUpdateUser();

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const changes = {
      ...(systemRole !== user.systemRole ? { systemRole } : {}),
      ...(canHost !== user.canHost ? { canHost } : {}),
      ...((organizationId || null) !== user.organizationId
        ? { organizationId: organizationId || null }
        : {}),
    };
    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    update.mutate({ userId: user.id, ...changes }, { onSuccess: onClose });
  }

  return (
    <Modal title={`Phân quyền ${user.displayName}`} description={user.email} onClose={onClose}>
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <SelectField
          label="Vai trò"
          value={systemRole}
          onChange={(e) => setSystemRole(systemRoleSchema.parse(e.target.value))}
          hint="Hạ vai trò Manager sẽ gỡ người này khỏi mọi tổ chức đang quản lý."
        >
          {systemRoleSchema.options.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Tổ chức"
          value={organizationId}
          onChange={(e) => setOrganizationId(e.target.value)}
        >
          <option value="">Không thuộc tổ chức</option>
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </SelectField>
        <label className="flex min-h-11 items-center gap-3 text-sm text-slate-800">
          <input
            type="checkbox"
            className="size-5 accent-brand-600"
            checked={canHost}
            onChange={(e) => setCanHost(e.target.checked)}
          />
          Được làm Host (tạo phòng, câu hỏi)
        </label>
        {update.isError && <Alert tone="error">{errorMessage(update.error)}</Alert>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" loading={update.isPending} loadingText="Đang lưu…">
            Lưu thay đổi
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Super Admin gán tài khoản (tìm theo email/tên) vào một tổ chức. */
export function AddToOrganizationDialog({
  organizations,
  onClose,
}: {
  organizations: Organization[];
  onClose: () => void;
}) {
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? '');
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');
  const results = useAdminUsers(
    { search: submitted, pageSize: 5, page: 1 },
    { enabled: submitted.length > 0 },
  );
  const update = useUpdateUser();
  const [added, setAdded] = useState<string[]>([]);

  if (organizations.length === 0) {
    return (
      <Modal title="Thêm người dùng vào tổ chức" onClose={onClose}>
        <Alert tone="info">Chưa có tổ chức nào. Hãy tạo tổ chức ở mục Tổ chức trước.</Alert>
      </Modal>
    );
  }

  return (
    <Modal title="Thêm người dùng vào tổ chức" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <SelectField
          label="Tổ chức"
          value={organizationId}
          onChange={(e) => setOrganizationId(e.target.value)}
        >
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </SelectField>
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(search.trim());
          }}
          className="flex items-end gap-2"
        >
          <TextField
            className="flex-1"
            label="Tìm tài khoản theo email hoặc tên"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button type="submit" variant="secondary">
            Tìm
          </Button>
        </form>
        {update.isError && <Alert tone="error">{errorMessage(update.error)}</Alert>}
        {submitted && results.data && (
          <ul
            className="divide-y divide-slate-100 rounded-lg border border-slate-200"
            aria-label="Kết quả tìm kiếm"
          >
            {results.data.items.length === 0 && (
              <li className="p-3 text-sm text-slate-600">Không tìm thấy tài khoản.</li>
            )}
            {results.data.items.map((user) => {
              const inOrg =
                user.organizationId === organizationId ||
                added.includes(user.id + ':' + organizationId);
              return (
                <li key={user.id} className="flex items-center justify-between gap-3 p-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{user.displayName}</span>
                    <span className="block truncate text-[13px] text-slate-600">{user.email}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={inOrg || update.isPending}
                    onClick={() =>
                      update.mutate(
                        { userId: user.id, organizationId },
                        {
                          onSuccess: () =>
                            setAdded((keys) => [...keys, user.id + ':' + organizationId]),
                        },
                      )
                    }
                  >
                    {inOrg ? 'Đã trong tổ chức' : 'Thêm'}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Xong
          </Button>
        </div>
      </div>
    </Modal>
  );
}
