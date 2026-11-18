import { Link, NavLink, Outlet } from 'react-router';
import { Wordmark } from '../../components/Card';
import { useOrganizations } from '../../features/admin/admin-api';
import { useAuth } from '../../features/auth/use-auth';

/**
 * Khung trang quản trị theo thiết kế (màn UserManagement): sidebar navy bên trái, nội dung bên
 * phải; trên mobile sidebar thành thanh điều hướng phía trên. Các mục Duyệt nội dung, Báo cáo vi
 * phạm, Phòng đang hoạt động (P7) sẽ thêm khi có chức năng.
 */
const itemClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 items-center rounded-lg px-3 text-[15px] no-underline hover:no-underline ${
    isActive
      ? 'bg-stage-800 font-semibold text-white hover:text-white'
      : 'font-medium text-stage-200 hover:bg-white/5 hover:text-white'
  }`;

function useScopeLabel(): string {
  const { user } = useAuth();
  const organizations = useOrganizations();
  if (user?.systemRole === 'super_admin') return 'Toàn hệ thống';
  const names = organizations.data?.map((org) => org.name) ?? [];
  return names.length > 0 ? names.join(', ') : 'Tổ chức được gán';
}

export function AdminLayout() {
  const { user } = useAuth();
  const scope = useScopeLabel();

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-slate-900 lg:flex-row">
      <nav
        aria-label="Quản trị"
        className="flex flex-col gap-4 bg-stage-900 px-4 py-4 text-white lg:w-60 lg:shrink-0 lg:gap-6 lg:py-6"
      >
        <div className="mx-2">
          <Link to="/" className="hover:no-underline" aria-label="Olympia Online – trang chủ">
            <Wordmark className="text-xl" />
          </Link>
          <p className="mt-1 text-xs text-stage-200">Quản trị · {scope}</p>
        </div>
        <div className="flex gap-1 overflow-x-auto lg:flex-col">
          <NavLink to="/quan-tri" end className={itemClass}>
            Người dùng
          </NavLink>
          <NavLink to="/quan-tri/to-chuc" className={itemClass}>
            Tổ chức
          </NavLink>
        </div>
        <div className="mx-2 hidden flex-col gap-1 border-t border-stage-800 pt-4 text-sm lg:mt-auto lg:flex">
          <Link to="/tai-khoan" className="truncate text-stage-200 hover:text-white">
            {user?.displayName ?? 'Tài khoản'}
          </Link>
          <Link to="/" className="text-stage-200 hover:text-white">
            Về trang chủ
          </Link>
        </div>
      </nav>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-10 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
