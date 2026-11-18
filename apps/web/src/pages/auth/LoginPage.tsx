import { AuthErrorCode, loginFailureDetailsSchema, loginRequestSchema } from '@olympia/shared';
import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { login } from '../../features/auth/auth-api';
import { AuthLayout } from '../../features/auth/AuthLayout';
import { ApiError, errorMessage } from '../../lib/api-client';
import { type FieldErrors, validate } from '../../lib/form-errors';

/** Thông báo lỗi kèm số lần thử còn lại (BR-AUTH-03) như thiết kế màn Login. */
function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === AuthErrorCode.InvalidCredentials) {
    const details = loginFailureDetailsSchema.safeParse(error.details);
    if (details.success) {
      const { remainingAttempts, lockoutMinutes } = details.data;
      return remainingAttempts > 0
        ? `${error.message.replace(/\.$/, '')}. Còn ${remainingAttempts} lần thử trước khi tạm khóa ${lockoutMinutes} phút.`
        : `${error.message.replace(/\.$/, '')}. Đăng nhập tạm khóa ${lockoutMinutes} phút.`;
    }
  }
  return errorMessage(error);
}

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  // Chuyển hướng sau khi đăng nhập do RedirectIfAuthenticated xử lý (theo tham số `next`).
  const mutation = useMutation({ mutationFn: login });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const result = validate(loginRequestSchema, { email, password });
    setFieldErrors(result.errors ?? {});
    if (result.data) mutation.mutate(result.data);
  }

  const next = searchParams.get('next');
  const registerLink = next ? `/dang-ky?next=${encodeURIComponent(next)}` : '/dang-ky';

  return (
    <AuthLayout
      title="Đăng nhập"
      subtitle={
        <>
          Chưa có tài khoản?{' '}
          <Link to={registerLink} className="font-semibold">
            Đăng ký
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        <TextField
          label="Email"
          type="email"
          size="lg"
          autoComplete="email"
          placeholder="ban@truonghoc.edu.vn"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          required
        />
        <TextField
          label="Mật khẩu"
          type="password"
          size="lg"
          autoComplete="current-password"
          labelAside={
            <Link to="/quen-mat-khau" className="text-sm font-medium">
              Quên mật khẩu?
            </Link>
          }
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password ? 'Vui lòng nhập mật khẩu.' : undefined}
          required
        />
        {mutation.isError && <Alert tone="error">{loginErrorMessage(mutation.error)}</Alert>}
        <Button type="submit" size="lg" loading={mutation.isPending} loadingText="Đang đăng nhập…">
          Đăng nhập
        </Button>
        <p className="text-[13px] leading-normal text-slate-600">
          Tài khoản mới cần xác minh email trước khi tạo phòng thi.
        </p>
      </form>
    </AuthLayout>
  );
}
