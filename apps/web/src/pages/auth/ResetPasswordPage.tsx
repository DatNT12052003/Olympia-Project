import { PASSWORD_MIN_LENGTH, passwordSchema } from '@olympia/shared';
import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { FormPage } from '../../components/Card';
import { TextField } from '../../components/TextField';
import { resetPassword } from '../../features/auth/auth-api';
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

  if (!token) {
    return (
      <FormPage title="Đặt lại mật khẩu">
        <Alert tone="error">Liên kết không hợp lệ. Vui lòng mở lại liên kết trong email.</Alert>
      </FormPage>
    );
  }

  return (
    <FormPage title="Đặt lại mật khẩu">
      {mutation.isSuccess ? (
        <div className="flex flex-col gap-4">
          <Alert tone="success">
            Đã đặt lại mật khẩu. Mọi thiết bị đã được đăng xuất; hãy đăng nhập bằng mật khẩu mới.
          </Alert>
          <Link to="/dang-nhap" className="text-sm font-medium text-brand-700 underline">
            Đăng nhập
          </Link>
        </div>
      ) : (
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
          {mutation.isError && (
            <Alert tone="error">
              {errorMessage(mutation.error)}{' '}
              <Link to="/quen-mat-khau" className="font-medium underline">
                Gửi lại liên kết
              </Link>
            </Alert>
          )}
          <TextField
            label="Mật khẩu mới"
            type="password"
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
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={errors.confirm}
            required
          />
          <Button type="submit" loading={mutation.isPending} loadingText="Đang lưu…">
            Đặt lại mật khẩu
          </Button>
        </form>
      )}
    </FormPage>
  );
}
