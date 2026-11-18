import { NavLink, Outlet } from 'react-router';

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium ${
    isActive
      ? 'border-brand-600 text-brand-700'
      : 'border-transparent text-slate-600 hover:text-slate-900'
  }`;

export function AdminLayout() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-brand-900 sm:text-3xl">Quản trị</h1>
        <nav aria-label="Quản trị" className="mt-4 flex gap-2 border-b border-slate-200">
          <NavLink to="/quan-tri" end className={tabClass}>
            Tài khoản
          </NavLink>
          <NavLink to="/quan-tri/to-chuc" className={tabClass}>
            Tổ chức
          </NavLink>
        </nav>
      </div>
      <Outlet />
    </div>
  );
}
