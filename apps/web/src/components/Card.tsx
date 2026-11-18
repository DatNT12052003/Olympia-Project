import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 ${className}`}
    >
      {children}
    </section>
  );
}

/** Khung trang hẹp cho form (đăng nhập, đăng ký...). */
export function FormPage({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-md">
      <h1 className="text-2xl font-bold tracking-tight text-brand-900 sm:text-3xl">{title}</h1>
      {description && <div className="mt-2 text-slate-600">{description}</div>}
      <Card className="mt-6">{children}</Card>
    </div>
  );
}

export function Spinner({ label = 'Đang tải…' }: { label?: string }) {
  return (
    <p role="status" className="flex items-center gap-2 py-8 text-sm text-slate-600">
      <span
        aria-hidden="true"
        className="size-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600"
      />
      {label}
    </p>
  );
}
