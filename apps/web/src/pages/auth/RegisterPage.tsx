import {
  DISPLAY_NAME_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  registerRequestSchema,
} from '@olympia/shared';
import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { FormPage } from '../../components/Card';
import { TextField } from '../../components/TextField';
import { register } from '../../features/auth/auth-api';
import { errorMessage } from '../../lib/api-client';
import { apiFieldErrors, type FieldErrors, validate } from '../../lib/form-errors';

export function RegisterPage() {
  const [values, setValues] = useState({ email: '', displayName: '', password: '' });
  const [acceptPrivacyPolicy, setAcceptPrivacyPolicy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  // Đăng ký xong được đăng nhập luôn; RedirectIfAuthenticated chuyển tới trang tài khoản.
  const mutation = useMutation({
    mutationFn: register,
    onError: (error) => setFieldErrors(apiFieldErrors(error)),
  });

  function set(field: keyof typeof values) {
    return (event: { target: { value: string } }) =>
      setValues((current) => ({ ...current, [field]: event.target.value }));
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const result = validate(registerRequestSchema, { ...values, acceptPrivacyPolicy });
    setFieldErrors(result.errors ?? {});
    if (result.data) mutation.mutate(result.data);
  }

  return (
    <FormPage
      title="Tạo tài khoản"
      description={
        <>
          Đã có tài khoản?{' '}
          <Link to="/dang-nhap" className="font-medium text-brand-700 underline">
            Đăng nhập
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
          value={values.email}
          onChange={set('email')}
          error={fieldErrors.email}
          required
        />
        <TextField
          label="Tên hiển thị"
          autoComplete="nickname"
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          value={values.displayName}
          onChange={set('displayName')}
          error={fieldErrors.displayName}
          hint="Tên mọi người thấy khi bạn tham gia phòng thi."
          required
        />
        <TextField
          label="Mật khẩu"
          type="password"
          autoComplete="new-password"
          value={values.password}
          onChange={set('password')}
          error={fieldErrors.password}
          hint={`Tối thiểu ${PASSWORD_MIN_LENGTH} ký tự.`}
          required
        />
        <div>
          <label className="flex items-start gap-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={acceptPrivacyPolicy}
              onChange={(e) => setAcceptPrivacyPolicy(e.target.checked)}
              aria-invalid={fieldErrors.acceptPrivacyPolicy ? true : undefined}
              aria-describedby={fieldErrors.acceptPrivacyPolicy ? 'privacy-error' : undefined}
              className="mt-0.5 size-5 shrink-0 accent-brand-600"
            />
            <span>Tôi đồng ý với chính sách quyền riêng tư của Olympia Online.</span>
          </label>
          {fieldErrors.acceptPrivacyPolicy && (
            <p id="privacy-error" className="mt-1 text-sm text-red-700">
              {fieldErrors.acceptPrivacyPolicy}
            </p>
          )}
        </div>
        <Button type="submit" loading={mutation.isPending} loadingText="Đang tạo tài khoản…">
          Đăng ký
        </Button>
      </form>
    </FormPage>
  );
}
