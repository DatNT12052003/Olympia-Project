import type { ReactNode } from 'react';
import { AlertCircleIcon, CheckCircleIcon, MailIcon } from './icons';

type Tone = 'error' | 'success' | 'info' | 'warning';

/** Theo thiết kế: lỗi nền cam nhạt, thành công nền xanh lá nhạt, thông tin nền xanh brand nhạt. */
const TONES: Record<Tone, string> = {
  error: 'border border-orange-300 bg-orange-50 text-orange-800',
  success: 'border border-green-300 bg-green-50 text-green-900',
  info: 'bg-brand-50 text-brand-700',
  warning: 'border border-amber-300 bg-amber-50 text-amber-900',
};

const ICONS: Record<Tone, ReactNode> = {
  error: <AlertCircleIcon className="mt-0.5 shrink-0" />,
  success: <CheckCircleIcon className="mt-0.5 shrink-0" />,
  info: <MailIcon className="mt-0.5 shrink-0" />,
  warning: <AlertCircleIcon className="mt-0.5 shrink-0" />,
};

/** Thông báo; lỗi dùng `role="alert"` để trình đọc màn hình đọc ngay. */
export function Alert({
  tone,
  title,
  children,
}: {
  tone: Tone;
  title?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex gap-2.5 rounded-lg px-3.5 py-3 text-sm leading-normal ${TONES[tone]}`}
    >
      {ICONS[tone]}
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-1' : ''}>{children}</div>}
      </div>
    </div>
  );
}
