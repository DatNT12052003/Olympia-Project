import { Link, NavLink, Outlet } from 'react-router';
import { Wordmark } from '../../components/Card';
import { MonitorIcon } from '../../components/icons';
import { roleLabel } from '../../features/auth/role-labels';
import { useAuth } from '../../features/auth/use-auth';
import { initials } from '../../features/rooms/room-format';

const itemClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 shrink-0 items-center gap-3 rounded-lg px-3 text-[15px] no-underline hover:no-underline ${
    isActive
      ? 'bg-stage-800 font-semibold text-white hover:text-white'
      : 'font-medium text-stage-200 hover:bg-white/5 hover:text-white'
  }`;

/**
 * Khung trang Host theo thiết kế (màn HostDashboard): sidebar navy, nội dung nền sáng. Ngân hàng
 * câu hỏi, Kịch bản, Lịch sử trận sẽ thêm vào sidebar khi có chức năng (P2, P4, P7).
 */
export function HostLayout() {
  const { user } = useAuth();

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-slate-900 lg:flex-row">
      <nav
        aria-label="Điều hướng chính"
        className="flex flex-col gap-4 bg-stage-900 px-4 py-4 text-white lg:w-60 lg:shrink-0 lg:gap-6 lg:py-6"
      >
        <Link to="/" className="mx-2 hover:no-underline" aria-label="Olympia Online – trang chủ">
          <Wordmark className="text-xl" />
        </Link>
        <div className="flex gap-1 overflow-x-auto lg:flex-col">
          <NavLink to="/phong-thi" end className={itemClass}>
            <MonitorIcon size={20} className="text-accent-400" />
            Phòng thi
          </NavLink>
        </div>
        {user && (
          <Link
            to="/tai-khoan"
            className="mt-auto hidden items-center gap-2.5 border-t border-stage-700 px-2 pt-3 text-white no-underline hover:text-white hover:no-underline lg:flex"
          >
            <span
              aria-hidden="true"
              className="flex size-9 items-center justify-center rounded-full bg-accent-400 text-sm font-extrabold text-stage-900"
            >
              {initials(user.displayName)}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold">{user.displayName}</span>
              <span className="text-xs text-stage-200">{roleLabel(user)}</span>
            </span>
          </Link>
        )}
      </nav>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-10 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
