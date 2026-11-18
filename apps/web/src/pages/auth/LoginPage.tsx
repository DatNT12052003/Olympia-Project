import { loginRequestSchema } from '@olympia/shared';
import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { FormPage } from '../../components/Card';
import { TextField } from '../../components/TextField';
import { login } from '../../features/auth/auth-api';
import { errorMessage } from '../../lib/api-client';
import { type FieldErrors, validate } from '../../lib/form-errors';

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
    <FormPage
      title="Đăng nhập"
      description={
        <>
          Chưa có tài khoản?{' '}
          <Link to={registerLink} className="font-medium text-brand-700 underline">
            Đăng ký
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        {mutation.isError && <Alert tone="error">{errorMessage(mutation.error)}</Alert>}
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          required
        />
        <TextField
          label="Mật khẩu"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password ? 'Vui lòng nhập mật khẩu.' : undefined}
          required
        />
        <div className="text-right text-sm">
          <Link to="/quen-mat-khau" className="font-medium text-brand-700 underline">
            Quên mật khẩu?
          </Link>
        </div>
        <Button type="submit" loading={mutation.isPending} loadingText="Đang đăng nhập…">
          Đăng nhập
        </Button>
      </form>
    </FormPage>
  );
}
