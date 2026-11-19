import {
  type AdminUser,
  type Organization,
  type SystemRole,
  systemRoleSchema,
  type UserStatus,
} from '@olympia/shared';
import { type FormEvent, useState } from 'react';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Badge, Spinner } from '../../components/Card';
import { SelectField, TextField } from '../../components/TextField';
import {
  useAdminUsers,
  useOrganizations,
  useResendVerificationEmail,
  useSendPasswordReset,
  useUnlockUser,
} from '../../features/admin/admin-api';
import { formatLastActive, initials } from '../../features/admin/format-activity';
import { ROLE_LABELS, roleLabel } from '../../features/auth/role-labels';
import { useAuth } from '../../features/auth/use-auth';
import { errorMessage } from '../../lib/api-client';
import { AddToOrganizationDialog, LockUserDialog, PermissionsDialog } from './UserDialogs';

const PAGE_SIZE = 20;

interface UsersFilter {
  search?: string | undefined;
  status?: UserStatus | undefined;
  systemRole?: SystemRole | undefined;
  page: number;
  pageSize: number;
}

type Dialog =
  | { kind: 'lock'; user: AdminUser }
  | { kind: 'permissions'; user: AdminUser }
  | { kind: 'add-to-organization' };

function StatusBadge({ user }: { user: AdminUser }) {
  if (user.status === 'locked') return <Badge tone="red">Đã khóa</Badge>;
  if (user.status === 'pending_deletion') return <Badge tone="orange">Chờ xóa</Badge>;
  if (user.status === 'deleted') return <Badge tone="slate">Đã xóa</Badge>;
  if (!user.emailVerified) return <Badge tone="amber">Chưa xác minh email</Badge>;
  return <Badge tone="green">Hoạt động</Badge>;
}

function UserRow({
  user,
  isSelf,
  isSuperAdmin,
  onOpen,
}: {
  user: AdminUser;
  isSelf: boolean;
  isSuperAdmin: boolean;
  onOpen: (dialog: Dialog) => void;
}) {
  const unlock = useUnlockUser();
  const reset = useSendPasswordReset();
  const resend = useResendVerificationEmail();
  const failed = unlock.error ?? reset.error ?? resend.error;
  const notice = reset.isSuccess
    ? 'Đã gửi email đặt lại mật khẩu.'
    : resend.isSuccess
      ? 'Đã gửi lại email xác minh.'
      : null;

  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="px-4 py-3">
        <span className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[13px] font-bold text-brand-700"
          >
            {initials(user.displayName)}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="font-semibold">
              {user.displayName}
              {isSelf && <span className="font-normal text-slate-600"> (bạn)</span>}
            </span>
            <span className="text-[13px] text-slate-600 [overflow-wrap:anywhere]">
              {user.email}
            </span>
          </span>
        </span>
      </td>
      <td className="px-2 py-3">{roleLabel(user)}</td>
      <td className="px-2 py-3">
        <StatusBadge user={user} />
        {user.status === 'locked' && user.lockedReason && (
          <p className="mt-1 max-w-48 text-xs text-slate-600">Lý do: {user.lockedReason}</p>
        )}
        {user.warningCount > 0 && (
          <p className="mt-1 text-xs text-orange-800">Đã cảnh báo {user.warningCount} lần</p>
        )}
      </td>
      <td className="px-2 py-3 text-slate-700">{formatLastActive(user.lastActiveAt)}</td>
      <td className="py-3 pl-2 pr-4">
        {isSelf || user.status === 'pending_deletion' || user.status === 'deleted' ? (
          <span className="text-slate-500">—</span>
        ) : (
          <>
            <span className="flex flex-wrap gap-2">
              {user.status === 'locked' ? (
                <Button
                  size="sm"
                  variant="secondary-success"
                  onClick={() => unlock.mutate(user.id)}
                  loading={unlock.isPending}
                  loadingText="Đang mở khóa…"
                >
                  Mở khóa
                </Button>
              ) : (
                <>
                  {!user.emailVerified && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => resend.mutate(user.id)}
                      loading={resend.isPending}
                      loadingText="Đang gửi…"
                    >
                      Gửi lại email
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary-warning"
                    onClick={() => onOpen({ kind: 'lock', user })}
                  >
                    Khóa
                  </Button>
                </>
              )}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => reset.mutate(user.id)}
                loading={reset.isPending}
                loadingText="Đang gửi…"
              >
                Đặt lại mật khẩu
              </Button>
              {isSuperAdmin && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onOpen({ kind: 'permissions', user })}
                >
                  Phân quyền
                </Button>
              )}
            </span>
            {notice && (
              <p role="status" className="mt-1.5 text-xs text-green-800">
                {notice}
              </p>
            )}
            {failed && (
              <p role="alert" className="mt-1.5 text-xs text-orange-800">
                {errorMessage(failed)}
              </p>
            )}
          </>
        )}
      </td>
    </tr>
  );
}

function scopeSubtitle(isSuperAdmin: boolean, organizations: Organization[], total?: number) {
  const scope = isSuperAdmin
    ? 'Toàn hệ thống'
    : `Tổ chức: ${organizations.map((org) => org.name).join(', ') || 'chưa được gán'}`;
  return total === undefined ? scope : `${scope} · ${total} tài khoản`;
}

export function AdminUsersPage() {
  const { user: me } = useAuth();
  const isSuperAdmin = me?.systemRole === 'super_admin';
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState<UsersFilter>({ page: 1, pageSize: PAGE_SIZE });
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const users = useAdminUsers(query);
  const organizations = useOrganizations();
  const organizationList = organizations.data ?? [];

  function onSearch(event: FormEvent) {
    event.preventDefault();
    setQuery((current) => ({ ...current, search: search.trim() || undefined, page: 1 }));
  }

  const page = query.page;
  const totalPages = users.data ? Math.max(1, Math.ceil(users.data.total / PAGE_SIZE)) : 1;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold leading-tight">Người dùng</h1>
          <p className="mt-1.5 text-[15px] text-slate-600">
            {scopeSubtitle(isSuperAdmin, organizationList, users.data?.total)}
          </p>
        </div>
        {isSuperAdmin && (
          <Button variant="secondary" onClick={() => setDialog({ kind: 'add-to-organization' })}>
            Thêm người dùng vào tổ chức
          </Button>
        )}
      </header>

      <form role="search" onSubmit={onSearch} className="flex flex-wrap items-end gap-2.5">
        <TextField
          className="min-w-0 flex-[1_1_280px]"
          label="Tìm theo tên hoặc email"
          type="search"
          compactLabel
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {isSuperAdmin && (
          <SelectField
            label="Vai trò"
            compactLabel
            value={query.systemRole ?? ''}
            onChange={(e) =>
              setQuery((current) => ({
                ...current,
                systemRole: e.target.value ? systemRoleSchema.parse(e.target.value) : undefined,
                page: 1,
              }))
            }
          >
            <option value="">Tất cả</option>
            {systemRoleSchema.options.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </SelectField>
        )}
        <SelectField
          label="Trạng thái"
          compactLabel
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
          <option value="active">Hoạt động</option>
          <option value="locked">Đã khóa</option>
          <option value="pending_deletion">Chờ xóa</option>
          <option value="deleted">Đã xóa</option>
        </SelectField>
        <Button type="submit">Tìm</Button>
      </form>

      {users.isPending ? (
        <Spinner label="Đang tải danh sách tài khoản…" />
      ) : users.isError ? (
        <Alert tone="error">{errorMessage(users.error)}</Alert>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <caption className="sr-only">Danh sách tài khoản</caption>
            <thead>
              <tr className="bg-slate-50 text-left text-slate-600">
                <th scope="col" className="px-4 py-3 font-semibold">
                  Người dùng
                </th>
                <th scope="col" className="whitespace-nowrap px-2 py-3 font-semibold">
                  Vai trò
                </th>
                <th scope="col" className="whitespace-nowrap px-2 py-3 font-semibold">
                  Trạng thái
                </th>
                <th scope="col" className="whitespace-nowrap px-2 py-3 font-semibold">
                  Đăng nhập gần nhất
                </th>
                <th scope="col" className="py-3 pl-2 pr-4 font-semibold">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody>
              {users.data.items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-600">
                    Không có tài khoản phù hợp.
                  </td>
                </tr>
              ) : (
                users.data.items.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    isSelf={user.id === me?.id}
                    isSuperAdmin={isSuperAdmin}
                    onOpen={setDialog}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <nav aria-label="Phân trang" className="flex items-center justify-between gap-3">
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

      <p className="text-[13px] text-slate-600">
        Manager chỉ quản lý tài khoản trong tổ chức được gán; cấp vai trò Manager/Super Admin do
        Super Admin thực hiện.
      </p>

      {dialog?.kind === 'lock' && (
        <LockUserDialog user={dialog.user} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'permissions' && (
        <PermissionsDialog
          user={dialog.user}
          organizations={organizationList}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'add-to-organization' && (
        <AddToOrganizationDialog organizations={organizationList} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}
