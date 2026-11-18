import { SystemPermission } from '@olympia/shared';
import { Link, NavLink, Outlet } from 'react-router';
import { userHasPermission, useAuth } from '../features/auth/use-auth';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium ${
    isActive ? 'bg-white/15 text-white' : 'text-white/85 hover:bg-white/10 hover:text-white'
  }`;

function UserNav() {
  const { status, user } = useAuth();

  if (status === 'loading') return null;

  if (!user) {
    return (
      <nav aria-label="Tài khoản" className="flex items-center gap-1">
        <NavLink to="/dang-nhap" className={navClass}>
          Đăng nhập
        </NavLink>
        <Link
          to="/dang-ky"
          className="inline-flex min-h-11 items-center rounded-lg bg-accent-400 px-3 text-sm font-semibold text-brand-900 hover:bg-accent-500"
        >
          Đăng ký
        </Link>
      </nav>
    );
  }

  return (
    <nav aria-label="Tài khoản" className="flex min-w-0 items-center gap-1">
      {userHasPermission(user, SystemPermission.ManageUsers) && (
        <NavLink to="/quan-tri" className={navClass}>
          Quản trị
        </NavLink>
      )}
      <NavLink to="/tai-khoan" className={navClass} title="Tài khoản của bạn">
        <span className="max-w-36 truncate sm:max-w-56">{user.displayName}</span>
      </NavLink>
    </nav>
  );
}

export function AppLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-brand-900 text-white">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
          <Link to="/" className="shrink-0 text-lg font-bold tracking-tight sm:text-xl">
            Olympia <span className="text-accent-400">Online</span>
          </Link>
          <UserNav />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200">
        <div className="mx-auto w-full max-w-6xl px-4 py-4 text-sm text-slate-500 sm:px-6">
          © {new Date().getFullYear()} Olympia Online
        </div>
      </footer>
    </div>
  );
}
