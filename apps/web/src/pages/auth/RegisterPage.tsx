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
import { TextField } from '../../components/TextField';
import { register } from '../../features/auth/auth-api';
import { AuthLayout } from '../../features/auth/AuthLayout';
import { passwordStrength } from '../../features/auth/password-strength';
import { errorMessage } from '../../lib/api-client';
import { apiFieldErrors, type FieldErrors, validate } from '../../lib/form-errors';

const STRENGTH_COLORS = [
  'bg-red-600',
  'bg-orange-600',
  'bg-amber-500',
  'bg-green-700',
  'bg-green-700',
];
const STRENGTH_TEXT = [
  'text-red-700',
  'text-orange-800',
  'text-amber-800',
  'text-green-800',
  'text-green-800',
];

function StrengthMeter({ password }: { password: string }) {
  const { score, label } = passwordStrength(password);
  return (
    <span className="flex flex-col gap-1.5">
      <span className="grid grid-cols-4 gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((bar) => (
          <span
            key={bar}
            className={`h-1 rounded-sm ${bar <= score ? STRENGTH_COLORS[score] : 'bg-slate-200'}`}
          />
        ))}
      </span>
      <span className={password ? STRENGTH_TEXT[score] : ''}>
        {password
          ? `Mật khẩu ${label.toLowerCase()} · tối thiểu ${PASSWORD_MIN_LENGTH} ký tự`
          : `Tối thiểu ${PASSWORD_MIN_LENGTH} ký tự`}
      </span>
    </span>
  );
}

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
    <AuthLayout
      title="Đăng ký"
      pitch="register"
      subtitle={
        <>
          Đã có tài khoản?{' '}
          <Link to="/dang-nhap" className="font-semibold">
            Đăng nhập
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-[18px]">
        <TextField
          label="Tên hiển thị"
          size="lg"
          autoComplete="nickname"
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          value={values.displayName}
          onChange={set('displayName')}
          error={fieldErrors.displayName}
          required
        />
        <TextField
          label="Email"
          type="email"
          size="lg"
          autoComplete="email"
          value={values.email}
          onChange={set('email')}
          error={fieldErrors.email}
          required
        />
        <TextField
          label="Mật khẩu"
          type="password"
          size="lg"
          autoComplete="new-password"
          value={values.password}
          onChange={set('password')}
          error={fieldErrors.password}
          hint={<StrengthMeter password={values.password} />}
          required
        />
        <div>
          <label className="flex items-start gap-2.5 text-sm leading-normal text-slate-700">
            <input
              type="checkbox"
              checked={acceptPrivacyPolicy}
              onChange={(e) => setAcceptPrivacyPolicy(e.target.checked)}
              aria-invalid={fieldErrors.acceptPrivacyPolicy ? true : undefined}
              aria-describedby={fieldErrors.acceptPrivacyPolicy ? 'privacy-error' : undefined}
              className="mt-0.5 size-[18px] shrink-0 accent-brand-600"
            />
            <span>
              Tôi đồng ý với <Link to="/dieu-khoan">Điều khoản sử dụng</Link> và{' '}
              <Link to="/chinh-sach-quyen-rieng-tu">Chính sách quyền riêng tư</Link>.
            </span>
          </label>
          {fieldErrors.acceptPrivacyPolicy && (
            <p id="privacy-error" className="mt-1.5 text-[13px] text-orange-800">
              {fieldErrors.acceptPrivacyPolicy}
            </p>
          )}
        </div>
        {mutation.isError && <Alert tone="error">{errorMessage(mutation.error)}</Alert>}
        <Button
          type="submit"
          size="lg"
          loading={mutation.isPending}
          loadingText="Đang tạo tài khoản…"
        >
          Tạo tài khoản
        </Button>
        <Alert tone="info">
          Sau khi đăng ký, kiểm tra email để xác minh tài khoản trước khi tạo phòng thi.
        </Alert>
      </form>
    </AuthLayout>
  );
}
