import type { ReactNode } from 'react';

type Tone = 'error' | 'success' | 'info' | 'warning';

const TONES: Record<Tone, string> = {
  error: 'border-red-200 bg-red-50 text-red-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  info: 'border-brand-100 bg-brand-50 text-brand-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
};

/** Thông báo; lỗi dùng `role="alert"` để trình đọc màn hình đọc ngay. */
export function Alert({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-lg border px-4 py-3 text-sm ${TONES[tone]}`}
    >
      {children}
    </div>
  );
}
