import { Link, Outlet } from 'react-router';

export function AppLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-brand-900 text-white">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center px-4 sm:h-16 sm:px-6">
          <Link to="/" className="text-lg font-bold tracking-tight sm:text-xl">
            Olympia <span className="text-accent-400">Online</span>
          </Link>
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
