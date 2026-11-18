import { Link } from 'react-router';

/** Hiển thị khi một route ném lỗi khi render hoặc tải dữ liệu. */
export function RouteErrorPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-bold text-slate-900">Đã có lỗi xảy ra</h1>
      <p className="mt-3 text-slate-600">Vui lòng tải lại trang hoặc quay về trang chủ.</p>
      <Link
        to="/"
        className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-5 font-medium text-white hover:bg-brand-700"
      >
        Về trang chủ
      </Link>
    </main>
  );
}
