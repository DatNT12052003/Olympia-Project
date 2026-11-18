import { type AdminUser, type Organization, organizationRequestSchema } from '@olympia/shared';
import { type FormEvent, useId, useState } from 'react';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Card, Spinner } from '../../components/Card';
import { TextField } from '../../components/TextField';
import {
  useAdminUsers,
  useAssignManager,
  useCreateOrganization,
  useOrganizations,
  useRemoveManager,
} from '../../features/admin/admin-api';
import { useAuth } from '../../features/auth/use-auth';
import { errorMessage } from '../../lib/api-client';

function CreateOrganizationForm() {
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const create = useCreateOrganization();

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = organizationRequestSchema.safeParse({ name });
    setError(parsed.success ? undefined : parsed.error.issues[0]?.message);
    if (parsed.success) create.mutate(parsed.data, { onSuccess: () => setName('') });
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-slate-900">Thêm tổ chức</h2>
      <form
        noValidate
        onSubmit={onSubmit}
        className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start"
      >
        <TextField
          className="flex-1"
          label="Tên tổ chức"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            create.reset();
          }}
          error={error ?? (create.isError ? errorMessage(create.error) : undefined)}
          hint="Ví dụ: một trường học hoặc câu lạc bộ."
        />
        <Button
          type="submit"
          className="sm:mt-7"
          loading={create.isPending}
          loadingText="Đang thêm…"
        >
          Thêm
        </Button>
      </form>
    </Card>
  );
}

function OrganizationItem({
  organization,
  managers,
  canEdit,
}: {
  organization: Organization;
  managers: AdminUser[];
  canEdit: boolean;
}) {
  const [selected, setSelected] = useState('');
  const assign = useAssignManager();
  const remove = useRemoveManager();
  const selectId = useId();
  const nameOf = (userId: string) =>
    managers.find((m) => m.id === userId)?.displayName ?? 'Manager';
  const available = managers.filter((m) => !organization.managerIds.includes(m.id));

  return (
    <li className="flex flex-col gap-3 py-4">
      <div>
        <p className="font-medium text-slate-900">{organization.name}</p>
        <p className="text-sm text-slate-600">{organization.memberCount} thành viên</p>
      </div>
      <div>
        <p className="text-sm font-medium text-slate-800">Manager</p>
        {organization.managerIds.length === 0 ? (
          <p className="text-sm text-slate-500">Chưa có Manager.</p>
        ) : (
          <ul className="mt-1 flex flex-wrap gap-2">
            {organization.managerIds.map((userId) => (
              <li
                key={userId}
                className="flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-sm"
              >
                {nameOf(userId)}
                {canEdit && (
                  <button
                    type="button"
                    aria-label={`Gỡ ${nameOf(userId)} khỏi ${organization.name}`}
                    className="inline-flex size-8 items-center justify-center rounded-full text-slate-600 hover:bg-slate-200"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ organizationId: organization.id, userId })}
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {canEdit && available.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor={selectId} className="block text-sm font-medium text-slate-800">
              Gán Manager
            </label>
            <select
              id={selectId}
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="mt-1.5 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base sm:text-sm"
            >
              <option value="">Chọn tài khoản Manager</option>
              {available.map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.displayName} ({manager.email})
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="secondary"
            disabled={!selected}
            loading={assign.isPending}
            loadingText="Đang gán…"
            onClick={() =>
              assign.mutate(
                { organizationId: organization.id, userId: selected },
                { onSuccess: () => setSelected('') },
              )
            }
          >
            Gán
          </Button>
        </div>
      )}
      {(assign.isError || remove.isError) && (
        <Alert tone="error">{errorMessage(assign.error ?? remove.error)}</Alert>
      )}
    </li>
  );
}

export function AdminOrganizationsPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.systemRole === 'super_admin';
  const organizations = useOrganizations();
  // Chỉ Super Admin cần danh sách Manager để gán; Manager không xem được tài khoản Manager khác.
  const managers = useAdminUsers(
    { systemRole: 'manager', pageSize: 100, page: 1 },
    { enabled: isSuperAdmin },
  );
  const managerList = isSuperAdmin ? (managers.data?.items ?? []) : [];

  return (
    <div className="flex flex-col gap-6">
      {isSuperAdmin && <CreateOrganizationForm />}
      <Card>
        <h2 className="text-lg font-semibold text-slate-900">
          {isSuperAdmin ? 'Tổ chức' : 'Tổ chức bạn quản lý'}
        </h2>
        {organizations.isPending ? (
          <Spinner label="Đang tải danh sách tổ chức…" />
        ) : organizations.isError ? (
          <div className="mt-4">
            <Alert tone="error">{errorMessage(organizations.error)}</Alert>
          </div>
        ) : organizations.data.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-600">Chưa có tổ chức nào.</p>
        ) : (
          <ul className="divide-y divide-slate-100" aria-label="Danh sách tổ chức">
            {organizations.data.map((organization) => (
              <OrganizationItem
                key={organization.id}
                organization={organization}
                managers={managerList}
                canEdit={isSuperAdmin}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
