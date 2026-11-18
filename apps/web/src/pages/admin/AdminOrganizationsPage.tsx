import { type AdminUser, type Organization, organizationRequestSchema } from '@olympia/shared';
import { type FormEvent, useState } from 'react';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Card, Spinner } from '../../components/Card';
import { CloseIcon } from '../../components/icons';
import { SelectField, TextField } from '../../components/TextField';
import {
  useAdminUsers,
  useAssignManager,
  useCreateOrganization,
  useOrganizations,
  useRemoveManager,
} from '../../features/admin/admin-api';
import { useAuth } from '../../features/auth/use-auth';
import { errorMessage } from '../../lib/api-client';

/** Chưa có màn riêng trong thiết kế: theo nền tảng giao diện (màn Main) và khung quản trị. */

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
      <h2 className="text-xl font-semibold">Thêm tổ chức</h2>
      <form noValidate onSubmit={onSubmit} className="mt-4 flex flex-wrap items-start gap-2.5">
        <TextField
          className="min-w-0 flex-[1_1_280px]"
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
          className="sm:mt-[30px]"
          loading={create.isPending}
          loadingText="Đang thêm…"
        >
          Thêm tổ chức
        </Button>
      </form>
    </Card>
  );
}

function OrganizationCard({
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
  const nameOf = (userId: string) =>
    managers.find((m) => m.id === userId)?.displayName ?? 'Manager';
  const available = managers.filter((m) => !organization.managerIds.includes(m.id));

  return (
    <li className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div>
        <h3 className="text-lg font-semibold">{organization.name}</h3>
        <p className="text-sm text-slate-600">{organization.memberCount} thành viên</p>
      </div>
      <div>
        <p className="text-[13px] font-semibold uppercase tracking-wider text-slate-600">Manager</p>
        {organization.managerIds.length === 0 ? (
          <p className="mt-1 text-sm text-slate-600">Chưa có Manager.</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {organization.managerIds.map((userId) => (
              <li
                key={userId}
                className="flex h-9 items-center gap-1 rounded-full bg-brand-50 pl-3 pr-1 text-sm font-medium text-brand-700"
              >
                {nameOf(userId)}
                {canEdit && (
                  <button
                    type="button"
                    aria-label={`Gỡ ${nameOf(userId)} khỏi ${organization.name}`}
                    className="inline-flex size-8 items-center justify-center rounded-full hover:bg-brand-100"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ organizationId: organization.id, userId })}
                  >
                    <CloseIcon size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {canEdit && available.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <SelectField
            className="min-w-0 flex-[1_1_220px]"
            label={`Gán Manager cho ${organization.name}`}
            compactLabel
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Chọn tài khoản Manager</option>
            {available.map((manager) => (
              <option key={manager.id} value={manager.id}>
                {manager.displayName} ({manager.email})
              </option>
            ))}
          </SelectField>
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
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-[28px] font-bold leading-tight">Tổ chức</h1>
        <p className="mt-1.5 text-[15px] text-slate-600">
          {isSuperAdmin
            ? 'Trường học, câu lạc bộ và Manager phụ trách.'
            : 'Các tổ chức bạn được gán quản lý.'}
        </p>
      </header>

      {isSuperAdmin && <CreateOrganizationForm />}

      {organizations.isPending ? (
        <Spinner label="Đang tải danh sách tổ chức…" />
      ) : organizations.isError ? (
        <Alert tone="error">{errorMessage(organizations.error)}</Alert>
      ) : organizations.data.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white py-10 text-center text-sm text-slate-600">
          Chưa có tổ chức nào.
        </p>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2" aria-label="Danh sách tổ chức">
          {organizations.data.map((organization) => (
            <OrganizationCard
              key={organization.id}
              organization={organization}
              managers={managerList}
              canEdit={isSuperAdmin}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
