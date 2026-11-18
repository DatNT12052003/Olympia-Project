import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 ${className}`}>
      {children}
    </section>
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

type BadgeTone = 'green' | 'red' | 'amber' | 'slate' | 'brand' | 'orange';

const BADGE_TONES: Record<BadgeTone, string> = {
  green: 'bg-green-100 text-green-800',
  red: 'bg-red-100 text-red-800',
  amber: 'bg-amber-100 text-amber-800',
  slate: 'bg-slate-200 text-slate-700',
  brand: 'bg-brand-50 text-brand-700',
  orange: 'bg-orange-100 text-orange-800',
};

/** Nhãn trạng thái dạng viên thuốc (màn Main – Nhãn trạng thái). */
export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/** Logo chữ "Olympia Online" dùng trên nền navy. */
export function Wordmark({ className = 'text-[22px]' }: { className?: string }) {
  return (
    <span className={`font-extrabold text-white ${className}`}>
      Olympia <span className="text-accent-400">Online</span>
    </span>
  );
}
