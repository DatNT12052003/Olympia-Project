/** Chỉ cho phép chuyển hướng nội bộ để tránh open redirect qua tham số `next`. */
export function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return '/';
  }
  return next;
}
