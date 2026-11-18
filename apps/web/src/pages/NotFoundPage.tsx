import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <section aria-labelledby="not-found-heading" className="py-12 text-center">
      <p className="text-sm font-semibold text-brand-600">404</p>
      <h1 id="not-found-heading" className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">
        Không tìm thấy trang
      </h1>
      <p className="mt-3 text-slate-600">Trang bạn tìm không tồn tại hoặc đã bị di chuyển.</p>
      <Link
        to="/"
        className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-5 font-medium text-white hover:bg-brand-700"
      >
        Về trang chủ
      </Link>
    </section>
  );
}
