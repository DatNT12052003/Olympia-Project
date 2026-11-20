import { Link } from 'react-router';
import { Card } from '../components/Card';

/** Trang tạm cho các chức năng đã có liên kết nhưng thuộc giai đoạn sau. */
export function ComingSoonPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="mx-auto w-full max-w-xl">
      <Card>
        <p className="text-[13px] font-semibold uppercase tracking-wider text-brand-600">
          Sắp ra mắt
        </p>
        <h1 className="mt-2 text-[28px] font-bold leading-tight">{title}</h1>
        <p className="mt-3 text-slate-600">{description}</p>
        <Link
          to="/"
          className="mt-6 inline-flex h-11 items-center rounded-lg bg-brand-600 px-5 text-[15px] font-semibold text-white hover:bg-brand-700 hover:text-white"
        >
          Về trang chủ
        </Link>
      </Card>
    </div>
  );
}
