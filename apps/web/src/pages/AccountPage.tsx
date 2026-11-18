import {
  type CurrentUser,
  changePasswordRequestSchema,
  DISPLAY_NAME_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  updateProfileRequestSchema,
} from '@olympia/shared';
import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { TextField } from '../components/TextField';
import { changePassword, resendVerification, updateProfile } from '../features/auth/auth-api';
import { roleLabel } from '../features/auth/role-labels';
import { useAuth } from '../features/auth/use-auth';
import { errorMessage } from '../lib/api-client';
import { logout } from '../lib/auth-session';
import { type FieldErrors, validate } from '../lib/form-errors';

function VerificationNotice() {
  const mutation = useMutation({ mutationFn: resendVerification });
  return (
    <Alert tone="warning">
      <p className="font-medium">Email chưa được xác minh.</p>
      <p className="mt-1">
        Bạn vẫn tham gia phòng thi được, nhưng cần xác minh email để tạo phòng và câu hỏi. Kiểm tra
        hộp thư (kể cả thư rác) để lấy liên kết xác minh.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          onClick={() => mutation.mutate()}
          loading={mutation.isPending}
          loadingText="Đang gửi…"
          disabled={mutation.isSuccess}
        >
          Gửi lại email xác minh
        </Button>
        {mutation.isSuccess && <span>Đã gửi. Liên kết có hiệu lực 24 giờ.</span>}
        {mutation.isError && <span className="text-red-700">{errorMessage(mutation.error)}</span>}
      </div>
    </Alert>
  );
}

function ProfileForm({ user }: { user: CurrentUser }) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [error, setError] = useState<string>();
  const mutation = useMutation({ mutationFn: updateProfile });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const result = validate(updateProfileRequestSchema, { displayName });
    setError(result.errors?.displayName);
    if (result.data) mutation.mutate(result.data);
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-slate-900">Hồ sơ</h2>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-[8rem_1fr]">
        <dt className="text-slate-500">Email</dt>
        <dd className="break-all text-slate-900">{user.email}</dd>
        <dt className="text-slate-500">Vai trò</dt>
        <dd className="text-slate-900">
          {roleLabel(user)}
          {!user.canHost && user.systemRole === 'member' && ' (đã bị thu hồi quyền Host)'}
        </dd>
      </dl>
      <form noValidate onSubmit={onSubmit} className="mt-5 flex flex-col gap-4">
        {mutation.isSuccess && <Alert tone="success">Đã lưu hồ sơ.</Alert>}
        {mutation.isError && <Alert tone="error">{errorMessage(mutation.error)}</Alert>}
        <TextField
          label="Tên hiển thị"
          autoComplete="nickname"
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          value={displayName}
          onChange={(e) => {
            setDisplayName(e.target.value);
            mutation.reset();
          }}
          error={error}
        />
        <Button
          type="submit"
          className="self-start"
          loading={mutation.isPending}
          loadingText="Đang lưu…"
        >
          Lưu hồ sơ
        </Button>
      </form>
    </Card>
  );
}

function ChangePasswordForm() {
  const empty = { currentPassword: '', newPassword: '', confirm: '' };
  const [values, setValues] = useState(empty);
  const [errors, setErrors] = useState<FieldErrors>({});
  const mutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => setValues(empty),
  });

  function set(field: keyof typeof values) {
    return (event: { target: { value: string } }) => {
      setValues((current) => ({ ...current, [field]: event.target.value }));
      mutation.reset();
    };
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const result = validate(changePasswordRequestSchema, values);
    const next: FieldErrors = { ...result.errors };
    if (values.newPassword !== values.confirm) next.confirm = 'Mật khẩu nhập lại không khớp.';
    setErrors(next);
    if (result.data && !next.confirm) mutation.mutate(result.data);
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-slate-900">Đổi mật khẩu</h2>
      <p className="mt-1 text-sm text-slate-600">
        Sau khi đổi, các thiết bị khác sẽ bị đăng xuất; thiết bị này vẫn giữ đăng nhập.
      </p>
      <form noValidate onSubmit={onSubmit} className="mt-5 flex flex-col gap-4">
        {mutation.isSuccess && <Alert tone="success">Đã đổi mật khẩu.</Alert>}
        {mutation.isError && <Alert tone="error">{errorMessage(mutation.error)}</Alert>}
        <TextField
          label="Mật khẩu hiện tại"
          type="password"
          autoComplete="current-password"
          value={values.currentPassword}
          onChange={set('currentPassword')}
          error={errors.currentPassword ? 'Vui lòng nhập mật khẩu hiện tại.' : undefined}
        />
        <TextField
          label="Mật khẩu mới"
          type="password"
          autoComplete="new-password"
          value={values.newPassword}
          onChange={set('newPassword')}
          error={errors.newPassword}
          hint={`Tối thiểu ${PASSWORD_MIN_LENGTH} ký tự.`}
        />
        <TextField
          label="Nhập lại mật khẩu mới"
          type="password"
          autoComplete="new-password"
          value={values.confirm}
          onChange={set('confirm')}
          error={errors.confirm}
        />
        <Button
          type="submit"
          className="self-start"
          loading={mutation.isPending}
          loadingText="Đang lưu…"
        >
          Đổi mật khẩu
        </Button>
      </form>
    </Card>
  );
}

export function AccountPage() {
  const { user } = useAuth();
  const logoutMutation = useMutation({ mutationFn: logout });
  // RequireAuth đảm bảo đã đăng nhập.
  if (!user) return null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[28px] font-bold leading-tight">Tài khoản</h1>
        <Button
          variant="secondary"
          onClick={() => logoutMutation.mutate()}
          loading={logoutMutation.isPending}
          loadingText="Đang đăng xuất…"
        >
          Đăng xuất
        </Button>
      </div>
      {!user.emailVerified && <VerificationNotice />}
      {/* key: nạp lại giá trị form khi tài khoản thay đổi. */}
      <ProfileForm key={user.id} user={user} />
      <ChangePasswordForm />
    </div>
  );
}
