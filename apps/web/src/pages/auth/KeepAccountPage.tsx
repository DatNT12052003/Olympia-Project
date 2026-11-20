import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Alert } from '../../components/Alert';
import { Spinner } from '../../components/Card';
import { cancelDeletion } from '../../features/auth/auth-api';
import { AuthLayout } from '../../features/auth/AuthLayout';
import { errorMessage } from '../../lib/api-client';

/** Giữ lại tài khoản `/giu-tai-khoan?token=` (hủy yêu cầu xóa, DL-008). */
export function KeepAccountPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const mutation = useMutation({ mutationFn: cancelDeletion });
  const { mutate } = mutation;
  // Token chỉ dùng được một lần: không gửi lại khi StrictMode chạy effect hai lần.
  const submitted = useRef(false);

  useEffect(() => {
    if (!token || submitted.current) return;
    submitted.current = true;
    mutate(token);
  }, [token, mutate]);

  return (
    <AuthLayout title="Giữ lại tài khoản">
      {!token ? (
        <Alert tone="error">Liên kết không hợp lệ. Vui lòng mở lại liên kết trong email.</Alert>
      ) : mutation.isSuccess ? (
        <>
          <Alert tone="success" title="Đã hủy yêu cầu xóa tài khoản">
            Tài khoản của bạn hoạt động bình thường trở lại. Hãy đăng nhập; nếu bạn không yêu cầu
            xóa, hãy đổi mật khẩu ngay.
          </Alert>
          <Link to="/dang-nhap" className="text-sm font-semibold">
            Đăng nhập
          </Link>
        </>
      ) : mutation.isError ? (
        <Alert tone="error">{errorMessage(mutation.error)}</Alert>
      ) : (
        <Spinner label="Đang khôi phục tài khoản…" />
      )}
    </AuthLayout>
  );
}
