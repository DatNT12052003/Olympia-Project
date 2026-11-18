import { type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, useId } from 'react';
import { AlertCircleIcon } from './icons';

type FieldSize = 'md' | 'lg';

const CONTROL_SIZES: Record<FieldSize, string> = {
  md: 'h-11 text-[15px]',
  lg: 'h-12 text-base sm:text-[15px]',
};

function controlClass(size: FieldSize, invalid: boolean) {
  return `block w-full rounded-lg bg-white px-3.5 text-slate-900 placeholder:text-slate-400 disabled:bg-slate-100 ${CONTROL_SIZES[size]} ${
    invalid ? 'border-2 border-orange-700' : 'border border-slate-300'
  }`;
}

interface FieldShellProps {
  id: string;
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
  /** Nội dung đặt cùng hàng với label (ví dụ link "Quên mật khẩu?"). */
  labelAside?: ReactNode;
  compactLabel?: boolean;
  className?: string;
  children: ReactNode;
}

function FieldShell({
  id,
  label,
  error,
  hint,
  labelAside,
  compactLabel,
  className = '',
  children,
}: FieldShellProps) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={id}
          className={`font-semibold ${compactLabel ? 'text-[13px] text-slate-700' : 'text-sm text-slate-900'}`}
        >
          {label}
        </label>
        {labelAside}
      </div>
      {children}
      {hint && (
        <div id={`${id}-hint`} className="text-[13px] text-slate-600">
          {hint}
        </div>
      )}
      {error && (
        <p id={`${id}-error`} className="flex items-center gap-1.5 text-[13px] text-orange-800">
          <AlertCircleIcon size={16} className="shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

function describedBy(id: string, hint: unknown, error: unknown): string | undefined {
  return (
    [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined
  );
}

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'size'> {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
  labelAside?: ReactNode;
  size?: FieldSize;
  compactLabel?: boolean;
}

/** Ô nhập có label, gợi ý và lỗi gắn với input qua `aria-describedby` (màn Main – Ô nhập). */
export function TextField({
  label,
  error,
  hint,
  labelAside,
  size = 'md',
  compactLabel,
  className,
  ...props
}: TextFieldProps) {
  const id = useId();
  return (
    <FieldShell
      id={id}
      label={label}
      error={error}
      hint={hint}
      labelAside={labelAside}
      compactLabel={compactLabel ?? false}
      {...(className ? { className } : {})}
    >
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={controlClass(size, Boolean(error))}
        {...props}
      />
    </FieldShell>
  );
}

export interface SelectFieldProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'id' | 'size'
> {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
  size?: FieldSize;
  compactLabel?: boolean;
}

export function SelectField({
  label,
  error,
  hint,
  size = 'md',
  compactLabel,
  className,
  children,
  ...props
}: SelectFieldProps) {
  const id = useId();
  return (
    <FieldShell
      id={id}
      label={label}
      error={error}
      hint={hint}
      compactLabel={compactLabel ?? false}
      {...(className ? { className } : {})}
    >
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={controlClass(size, Boolean(error))}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  );
}
