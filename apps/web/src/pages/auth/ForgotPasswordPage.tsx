import { forgotPasswordRequestSchema } from '@olympia/shared';
import { useMutation } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { FormPage } from '../../components/Card';
import { TextField } from '../../components/TextField';
import { forgotPassword } from '../../features/auth/auth-api';
import { errorMessage } from '../../lib/api-client';
import { validate } from '../../lib/form-errors';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string>();
  const mutation = useMutation({ mutationFn: forgotPassword });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const result = validate(forgotPasswordRequestSchema, { email });
    setEmailError(result.errors?.email);
    if (result.data) mutation.mutate(result.data.email);
  }

  return (
    <FormPage
      title="Quên mật khẩu"
      description="Nhập email đã đăng ký, chúng tôi sẽ gửi liên kết đặt lại mật khẩu."
    >
      {mutation.isSuccess ? (
        <div className="flex flex-col gap-4">
          {/* Cùng một thông báo dù email có tồn tại hay không. */}
          <Alert tone="success">
            Nếu email này đã đăng ký, bạn sẽ nhận được liên kết đặt lại mật khẩu trong vài phút.
            Liên kết có hiệu lực trong 1 giờ.
          </Alert>
          <Link to="/dang-nhap" className="text-sm font-medium text-brand-700 underline">
            Quay lại đăng nhập
          </Link>
        </div>
      ) : (
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
          {mutation.isError && <Alert tone="error">{errorMessage(mutation.error)}</Alert>}
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={emailError}
            required
          />
          <Button type="submit" loading={mutation.isPending} loadingText="Đang gửi…">
            Gửi liên kết
          </Button>
        </form>
      )}
    </FormPage>
  );
}
