import { forgotPasswordRequestSchema, PASSWORD_RESET_TTL_MINUTES } from '@olympia/shared';
import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { forgotPassword } from '../../features/auth/auth-api';
import { AuthLayout } from '../../features/auth/AuthLayout';
import { errorMessage } from '../../lib/api-client';
import { validate } from '../../lib/form-errors';

/** Thời gian chờ trước khi cho gửi lại (thiết kế: "Gửi lại sau 0:45"). */
const RESEND_COOLDOWN_SECONDS = 45;

function formatCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string>();
  const [cooldown, setCooldown] = useState(0);
  const mutation = useMutation({
    mutationFn: forgotPassword,
    onSuccess: () => setCooldown(RESEND_COOLDOWN_SECONDS),
  });

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const result = validate(forgotPasswordRequestSchema, { email });
    setEmailError(result.errors?.email);
    if (result.data) mutation.mutate(result.data.email);
  }

  return (
    <AuthLayout
      title="Quên mật khẩu"
      backTo={{ to: '/dang-nhap', label: 'Quay lại đăng nhập' }}
      subtitle={`Nhập email đã đăng ký. Chúng tôi sẽ gửi link đặt lại mật khẩu, có hiệu lực trong ${PASSWORD_RESET_TTL_MINUTES} phút.`}
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <TextField
          label="Email"
          type="email"
          size="lg"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={emailError}
          required
        />
        {mutation.isError && <Alert tone="error">{errorMessage(mutation.error)}</Alert>}
        <Button
          type="submit"
          size="lg"
          loading={mutation.isPending}
          loadingText="Đang gửi…"
          disabled={cooldown > 0}
        >
          {cooldown > 0
            ? `Gửi lại sau ${formatCountdown(cooldown)}`
            : mutation.isSuccess
              ? 'Gửi lại link'
              : 'Gửi link đặt lại mật khẩu'}
        </Button>
      </form>

      {mutation.isSuccess && (
        // Cùng một thông báo dù email có tồn tại hay không.
        <Alert tone="success" title="Đã gửi email">
          Nếu email tồn tại trong hệ thống, bạn sẽ nhận được link trong vài phút. Nhớ kiểm tra cả
          thư mục Spam.
        </Alert>
      )}

      <p className="mt-2 text-center text-sm text-slate-600">
        Nhớ ra rồi?{' '}
        <Link to="/dang-nhap" className="font-semibold">
          Đăng nhập
        </Link>
      </p>
    </AuthLayout>
  );
}
