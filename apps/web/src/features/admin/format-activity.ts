const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Thời điểm hoạt động gần nhất theo cách viết của thiết kế (màn UserManagement):
 * "Hôm nay, 20:52", "Hôm qua", "2 ngày trước", "12/11/2026", "Chưa đăng nhập".
 */
export function formatLastActive(iso: string | null, now = new Date()): string {
  if (!iso) return 'Chưa đăng nhập';
  const date = new Date(iso);
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
  if (days <= 0) {
    const time = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    return `Hôm nay, ${time}`;
  }
  if (days === 1) return 'Hôm qua';
  if (days < 7) return `${days} ngày trước`;
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Chữ cái đầu của hai từ cuối tên (tên tiếng Việt: "Nguyễn Thu Hà" → "TH"). */
export function initials(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  const picked = words.length > 1 ? words.slice(-2) : words;
  return picked
    .map((word) => word.charAt(0))
    .join('')
    .toLocaleUpperCase('vi-VN');
}
