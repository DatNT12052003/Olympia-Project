import type { SystemPermission } from '@olympia/shared';
import { Link, Navigate, Outlet, useLocation } from 'react-router';
import { Spinner } from '../../components/Card';
import { safeNextPath } from './next-path';
import { userHasPermission, useAuth } from './use-auth';

/**
 * Chặn route khi chưa đăng nhập (chuyển tới trang đăng nhập, quay lại sau khi đăng nhập)
 * hoặc khi thiếu quyền. Chỉ hỗ trợ trải nghiệm; backend vẫn kiểm tra quyền.
 */
export function RequireAuth({ permission }: { permission?: SystemPermission }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <Spinner label="Đang kiểm tra phiên đăng nhập…" />;

  if (status === 'anonymous' || !user) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/dang-nhap?next=${encodeURIComponent(next)}`} replace />;
  }

  if (permission && !userHasPermission(user, permission)) {
    return (
      <section aria-labelledby="forbidden-heading" className="py-12 text-center">
        <p className="text-sm font-semibold text-brand-600">403</p>
        <h1 id="forbidden-heading" className="mt-2 text-2xl font-bold text-slate-900">
          Bạn không có quyền truy cập trang này
        </h1>
        <Link to="/" className="mt-6 inline-block font-medium text-brand-700 underline">
          Về trang chủ
        </Link>
      </section>
    );
  }

  return <Outlet />;
}

/**
 * Trang chỉ dành cho người chưa đăng nhập (đăng nhập, đăng ký). Khi đăng nhập xong, chuyển tới
 * `to` hoặc tham số `next` (đăng nhập thành công cũng đi qua nhánh này).
 */
export function RedirectIfAuthenticated({ to }: { to?: string }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Spinner />;
  if (status === 'authenticated') {
    const target = to ?? safeNextPath(new URLSearchParams(location.search).get('next'));
    return <Navigate to={target} replace />;
  }
  return <Outlet />;
}
