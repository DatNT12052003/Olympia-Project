import { type InputHTMLAttributes, useId } from 'react';

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  error?: string | undefined;
  hint?: string;
}

/** Ô nhập có label, gợi ý và lỗi gắn với input qua `aria-describedby`. */
export function TextField({ label, error, hint, className = '', ...props }: TextFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`mt-1.5 block min-h-11 w-full rounded-lg border bg-white px-3 text-base text-slate-900 placeholder:text-slate-400 sm:text-sm ${
          error ? 'border-red-500' : 'border-slate-300'
        }`}
        {...props}
      />
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
