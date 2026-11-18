import type { ButtonHTMLAttributes } from 'react';

type Variant =
  | 'primary'
  | 'secondary'
  | 'secondary-warning'
  | 'secondary-success'
  | 'stage'
  | 'danger'
  | 'ghost';
type Size = 'sm' | 'md' | 'lg';

/** Theo màn Main: nút chính xanh, nút phụ viền xám, nút sân khấu vàng, nút nguy hiểm nền đỏ nhạt. */
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700',
  secondary: 'border border-slate-300 bg-white text-slate-900 hover:bg-slate-50',
  /** Thao tác cần cân nhắc trong bảng (Khóa) – viền cam theo màn UserManagement. */
  'secondary-warning': 'border border-orange-300 bg-white text-orange-800 hover:bg-orange-50',
  /** Thao tác khôi phục trong bảng (Mở khóa) – viền xanh lá. */
  'secondary-success': 'border border-green-300 bg-white text-green-800 hover:bg-green-50',
  stage: 'bg-accent-400 font-bold text-stage-900 hover:bg-accent-500',
  danger: 'bg-red-100 text-red-700 hover:bg-red-200',
  ghost: 'text-slate-700 hover:bg-slate-100',
};

/** `md` 44px (vùng bấm tối thiểu), `lg` 48px cho form xác thực, `sm` 36px cho thao tác trong bảng. */
const SIZES: Record<Size, string> = {
  sm: 'h-9 rounded-lg px-3 text-[13px]',
  md: 'h-11 rounded-lg px-5 text-[15px]',
  lg: 'h-12 rounded-lg px-5 text-base',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Hiển thị trạng thái đang xử lý và chặn bấm lặp. */
  loading?: boolean;
  loadingText?: string;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingText,
  disabled,
  className = '',
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex shrink-0 items-center justify-center gap-2 font-semibold transition-colors disabled:cursor-not-allowed disabled:border-transparent disabled:bg-slate-200 disabled:text-slate-500 ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {loading ? (loadingText ?? children) : children}
    </button>
  );
}
