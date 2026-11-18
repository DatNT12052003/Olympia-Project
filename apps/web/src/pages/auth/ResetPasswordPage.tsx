import { PASSWORD_MIN_LENGTH, passwordSchema } from '@olympia/shared';
import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { resetPassword } from '../../features/auth/auth-api';
import { AuthLayout } from '../../features/auth/AuthLayout';
import { errorMessage } from '../../lib/api-client';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const mutation = useMutation({ mutationFn: resetPassword });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = passwordSchema.safeParse(password);
    const next = {
      ...(parsed.success ? {} : { password: parsed.error.issues[0]?.message }),
      ...(password === confirm ? {} : { confirm: 'Mật khẩu nhập lại không khớp.' }),
    };
    setErrors(next);
    if (!next.password && !next.confirm) mutation.mutate({ token, password });
  }

  const backTo = { to: '/dang-nhap', label: 'Quay lại đăng nhập' };

  if (!token) {
    return (
      <AuthLayout title="Đặt lại mật khẩu" backTo={backTo}>
        <Alert tone="error">
          Liên kết không hợp lệ. Vui lòng mở lại liên kết trong email hoặc{' '}
          <Link to="/quen-mat-khau" className="font-semibold">
            gửi lại link
          </Link>
          .
        </Alert>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Đặt lại mật khẩu"
      backTo={backTo}
      subtitle="Chọn mật khẩu mới cho tài khoản."
    >
      {mutation.isSuccess ? (
        <>
          <Alert tone="success" title="Đã đặt lại mật khẩu">
            Mọi thiết bị đã được đăng xuất; hãy đăng nhập bằng mật khẩu mới.
          </Alert>
          <Link to="/dang-nhap" className="text-sm font-semibold">
            Đăng nhập
          </Link>
        </>
      ) : (
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
          <TextField
            label="Mật khẩu mới"
            type="password"
            size="lg"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            hint={`Tối thiểu ${PASSWORD_MIN_LENGTH} ký tự.`}
            required
          />
          <TextField
            label="Nhập lại mật khẩu mới"
            type="password"
            size="lg"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={errors.confirm}
            required
          />
          {mutation.isError && (
            <Alert tone="error">
              {errorMessage(mutation.error)}{' '}
              <Link to="/quen-mat-khau" className="font-semibold">
                Gửi lại link
              </Link>
            </Alert>
          )}
          <Button type="submit" size="lg" loading={mutation.isPending} loadingText="Đang lưu…">
            Đặt lại mật khẩu
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
