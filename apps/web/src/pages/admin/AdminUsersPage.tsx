import {
  type AdminUser,
  lockUserRequestSchema,
  type Organization,
  systemRoleSchema,
  type UserStatus,
} from '@olympia/shared';
import { type FormEvent, useId, useState } from 'react';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Card, Spinner } from '../../components/Card';
import { TextField } from '../../components/TextField';
import {
  useAdminUsers,
  useLockUser,
  useOrganizations,
  useSendPasswordReset,
  useUnlockUser,
  useUpdateUser,
} from '../../features/admin/admin-api';
import { useAuth } from '../../features/auth/use-auth';
import { errorMessage } from '../../lib/api-client';
import { ROLE_LABELS } from '../../features/auth/role-labels';

const PAGE_SIZE = 20;

interface UsersFilter {
  search?: string | undefined;
  status?: UserStatus | undefined;
  page: number;
  pageSize: number;
}
const selectClass =
  'mt-1.5 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base sm:text-sm';

function Badge({
  tone,
  children,
}: {
  tone: 'slate' | 'red' | 'amber' | 'brand';
  children: string;
}) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    red: 'bg-red-100 text-red-800',
    amber: 'bg-amber-100 text-amber-900',
    brand: 'bg-brand-50 text-brand-700',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

function LockForm({ user, onDone }: { user: AdminUser; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();
  const lock = useLockUser();

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = lockUserRequestSchema.safeParse({ reason });
    setError(parsed.success ? undefined : parsed.error.issues[0]?.message);
    if (parsed.success) lock.mutate({ userId: user.id, ...parsed.data }, { onSuccess: onDone });
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-3 rounded-lg bg-red-50 p-3">
      {lock.isError && <Alert tone="error">{errorMessage(lock.error)}</Alert>}
      <TextField
        label={`Lý do khóa ${user.displayName}`}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        error={error}
        hint="Người dùng sẽ bị đăng xuất khỏi mọi thiết bị."
        maxLength={500}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="danger" loading={lock.isPending} loadingText="Đang khóa…">
          Xác nhận khóa
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Hủy
        </Button>
      </div>
    </form>
  );
}

/** Chỉ Super Admin: vai trò, quyền Host, tổ chức. */
function PermissionsPanel({
  user,
  organizations,
}: {
  user: AdminUser;
  organizations: Organization[];
}) {
  const update = useUpdateUser();
  const roleId = useId();
  const orgId = useId();

  return (
    <details className="rounded-lg border border-slate-200 p-3">
      <summary className="cursor-pointer text-sm font-medium text-slate-800">Phân quyền</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {update.isError && (
          <div className="sm:col-span-3">
            <Alert tone="error">{errorMessage(update.error)}</Alert>
          </div>
        )}
        <div>
          <label htmlFor={roleId} className="block text-sm font-medium text-slate-800">
            Vai trò
          </label>
          <select
            id={roleId}
            className={selectClass}
            value={user.systemRole}
            disabled={update.isPending}
            onChange={(e) =>
              update.mutate({ userId: user.id, systemRole: systemRoleSchema.parse(e.target.value) })
            }
          >
            {systemRoleSchema.options.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={orgId} className="block text-sm font-medium text-slate-800">
            Tổ chức
          </label>
          <select
            id={orgId}
            className={selectClass}
            value={user.organizationId ?? ''}
            disabled={update.isPending}
            onChange={(e) =>
              update.mutate({ userId: user.id, organizationId: e.target.value || null })
            }
          >
            <option value="">Không thuộc tổ chức</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>
        <label className="flex min-h-11 items-center gap-3 self-end text-sm text-slate-800">
          <input
            type="checkbox"
            className="size-5 accent-brand-600"
            checked={user.canHost}
            disabled={update.isPending}
            onChange={(e) => update.mutate({ userId: user.id, canHost: e.target.checked })}
          />
          Được làm Host
        </label>
      </div>
    </details>
  );
}

function UserItem({
  user,
  isSelf,
  isSuperAdmin,
  organizations,
}: {
  user: AdminUser;
  isSelf: boolean;
  isSuperAdmin: boolean;
  organizations: Organization[];
}) {
  const [locking, setLocking] = useState(false);
  const unlock = useUnlockUser();
  const reset = useSendPasswordReset();
  const organization = organizations.find((org) => org.id === user.organizationId);

  return (
    <li className="flex flex-col gap-3 py-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-medium text-slate-900">
            {user.displayName}
            {isSelf && <span className="text-slate-500"> (bạn)</span>}
          </p>
          <p className="break-all text-sm text-slate-600">{user.email}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone="brand">{ROLE_LABELS[user.systemRole]}</Badge>
            {user.status === 'locked' && <Badge tone="red">Đã khóa</Badge>}
            {!user.emailVerified && <Badge tone="amber">Chưa xác minh email</Badge>}
            {!user.canHost && <Badge tone="slate">Không được làm Host</Badge>}
            {organization && <Badge tone="slate">{organization.name}</Badge>}
          </div>
          {user.status === 'locked' && user.lockedReason && (
            <p className="mt-2 text-sm text-red-800">Lý do khóa: {user.lockedReason}</p>
          )}
        </div>
        {!isSelf && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {user.status === 'locked' ? (
              <Button
                variant="secondary"
                onClick={() => unlock.mutate(user.id)}
                loading={unlock.isPending}
                loadingText="Đang mở khóa…"
              >
                Mở khóa
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setLocking(true)} disabled={locking}>
                Khóa
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => reset.mutate(user.id)}
              loading={reset.isPending}
              loadingText="Đang gửi…"
              disabled={reset.isSuccess}
            >
              {reset.isSuccess ? 'Đã gửi email đặt lại' : 'Gửi email đặt lại mật khẩu'}
            </Button>
          </div>
        )}
      </div>
      {(unlock.isError || reset.isError) && (
        <Alert tone="error">{errorMessage(unlock.error ?? reset.error)}</Alert>
      )}
      {locking && <LockForm user={user} onDone={() => setLocking(false)} />}
      {isSuperAdmin && !isSelf && <PermissionsPanel user={user} organizations={organizations} />}
    </li>
  );
}

export function AdminUsersPage() {
  const { user: me } = useAuth();
  const isSuperAdmin = me?.systemRole === 'super_admin';
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState<UsersFilter>({ page: 1, pageSize: PAGE_SIZE });
  const users = useAdminUsers(query);
  const organizations = useOrganizations();
  const statusId = useId();

  function onSearch(event: FormEvent) {
    event.preventDefault();
    setQuery((current) => ({ ...current, search: search.trim() || undefined, page: 1 }));
  }

  const page = query.page;
  const totalPages = users.data ? Math.max(1, Math.ceil(users.data.total / PAGE_SIZE)) : 1;

  return (
    <Card>
      <form
        role="search"
        onSubmit={onSearch}
        className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
      >
        <TextField
          label="Tìm theo email hoặc tên"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div>
          <label htmlFor={statusId} className="block text-sm font-medium text-slate-800">
            Trạng thái
          </label>
          <select
            id={statusId}
            className={selectClass}
            value={query.status ?? ''}
            onChange={(e) =>
              setQuery((current) => ({
                ...current,
                status: (e.target.value || undefined) as UserStatus | undefined,
                page: 1,
              }))
            }
          >
            <option value="">Tất cả</option>
            <option value="active">Đang hoạt động</option>
            <option value="locked">Đã khóa</option>
          </select>
        </div>
        <Button type="submit">Tìm</Button>
      </form>

      <div className="mt-4">
        {users.isPending ? (
          <Spinner label="Đang tải danh sách tài khoản…" />
        ) : users.isError ? (
          <Alert tone="error">{errorMessage(users.error)}</Alert>
        ) : users.data.items.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-600">Không có tài khoản phù hợp.</p>
        ) : (
          <>
            <p className="text-sm text-slate-600">{users.data.total} tài khoản</p>
            <ul className="divide-y divide-slate-100" aria-label="Danh sách tài khoản">
              {users.data.items.map((user) => (
                <UserItem
                  key={user.id}
                  user={user}
                  isSelf={user.id === me?.id}
                  isSuperAdmin={isSuperAdmin}
                  organizations={organizations.data ?? []}
                />
              ))}
            </ul>
          </>
        )}
      </div>

      {totalPages > 1 && (
        <nav
          aria-label="Phân trang"
          className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4"
        >
          <Button
            variant="secondary"
            disabled={page <= 1}
            onClick={() => setQuery((current) => ({ ...current, page: page - 1 }))}
          >
            Trang trước
          </Button>
          <span className="text-sm text-slate-600">
            Trang {page}/{totalPages}
          </span>
          <Button
            variant="secondary"
            disabled={page >= totalPages}
            onClick={() => setQuery((current) => ({ ...current, page: page + 1 }))}
          >
            Trang sau
          </Button>
        </nav>
      )}
    </Card>
  );
}
