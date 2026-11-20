import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Alert } from '../../components/Alert';
import { Spinner } from '../../components/Card';
import { verifyEmail } from '../../features/auth/auth-api';
import { AuthLayout } from '../../features/auth/AuthLayout';
import { useAuth } from '../../features/auth/use-auth';
import { errorMessage } from '../../lib/api-client';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const { status } = useAuth();
  const mutation = useMutation({ mutationFn: verifyEmail });
  const { mutate } = mutation;
  // Token chỉ dùng được một lần: không gửi lại khi StrictMode chạy effect hai lần.
  const submitted = useRef(false);

  useEffect(() => {
    if (!token || submitted.current) return;
    submitted.current = true;
    mutate(token);
  }, [token, mutate]);

  const nextLink =
    status === 'authenticated' ? (
      <Link to="/tai-khoan" className="text-sm font-semibold">
        Về trang tài khoản
      </Link>
    ) : (
      <Link to="/dang-nhap" className="text-sm font-semibold">
        Đăng nhập
      </Link>
    );

  return (
    <AuthLayout title="Xác minh email">
      {!token ? (
        <Alert tone="error">Liên kết không hợp lệ. Vui lòng mở lại liên kết trong email.</Alert>
      ) : mutation.isSuccess ? (
        <>
          <Alert tone="success" title="Email đã được xác minh">
            Bạn có thể tạo phòng thi và ngân hàng câu hỏi.
          </Alert>
          {nextLink}
        </>
      ) : mutation.isError ? (
        <>
          <Alert tone="error">
            {errorMessage(mutation.error)} Bạn có thể gửi lại email xác minh trong trang tài khoản.
          </Alert>
          {nextLink}
        </>
      ) : (
        <Spinner label="Đang xác minh email…" />
      )}
    </AuthLayout>
  );
}
