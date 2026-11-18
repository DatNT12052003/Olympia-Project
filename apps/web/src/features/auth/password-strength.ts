import { PASSWORD_MIN_LENGTH } from '@olympia/shared';

export interface PasswordStrength {
  /** 0–4 vạch. */
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
}

const LABELS = ['Quá ngắn', 'Yếu', 'Trung bình', 'Khá mạnh', 'Mạnh'] as const;

/**
 * Ước lượng độ mạnh để gợi ý khi đăng ký (thiết kế màn Register). Chỉ là gợi ý; quy tắc bắt buộc
 * vẫn là độ dài tối thiểu do backend kiểm tra.
 */
export function passwordStrength(password: string): PasswordStrength {
  if (password.length < PASSWORD_MIN_LENGTH) return { score: 0, label: LABELS[0] };
  let score = 1;
  if (password.length >= 12) score += 1;
  if (/[a-zA-ZÀ-ỹ]/.test(password) && /\d/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password) || (/[a-z]/.test(password) && /[A-Z]/.test(password))) {
    score += 1;
  }
  const clamped = Math.min(score, 4) as PasswordStrength['score'];
  return { score: clamped, label: LABELS[clamped] };
}
