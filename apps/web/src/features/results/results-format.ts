import type { MatchOutcome, MatchResult } from '@olympia/shared';

/** Tên ngắn của vòng cho cột bảng điểm (màn MatchResult). */
export const ROUND_SHORT_TITLES: Record<MatchResult['rounds'][number]['type'], string> = {
  warmup: 'Khởi động',
  obstacle: 'Vượt CNV',
  acceleration: 'Tăng tốc',
  finish: 'Về đích',
  tiebreak: 'Câu hỏi phụ',
};

/** Màu nhãn trạng thái trận (màn MatchHistory). */
export const OUTCOME_TONES: Record<MatchOutcome, 'green' | 'orange' | 'amber' | 'slate'> = {
  completed: 'green',
  ended_early: 'amber',
  abnormal: 'orange',
  voided: 'slate',
};

/** "20:52 · 18/11/2026" */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const day = date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  return `${time} · ${day}`;
}

/** "38 phút", "1 giờ 5 phút", "45 giây" */
export function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds} giây`;
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} giờ ${rest} phút` : `${hours} giờ`;
}

/** "3,1 giây" hoặc "—" */
export function formatAverage(ms: number | null): string {
  if (ms === null) return '—';
  return `${(ms / 1000).toFixed(1).replace('.', ',')} giây`;
}

/** "68%" hoặc "—" khi chưa có câu nào. */
export function formatPercent(correct: number, total: number): string {
  if (total === 0) return '—';
  return `${Math.round((correct / total) * 100)}%`;
}

/** Tiêu đề tổng kết: người thắng, đồng hạng hoặc kết quả đã hủy. */
export function resultHeadline(result: MatchResult): string {
  if (result.outcome === 'voided') return 'Kết quả trận đã bị hủy';
  const winners = result.players.filter((p) => p.winner);
  if (winners.length === 0) return 'Trận đấu đã kết thúc';
  if (winners.length > 1) {
    return `Đồng hạng nhất: ${winners.map((w) => w.displayName).join(', ')}`;
  }
  return `${winners[0]!.displayName} về đích đầu tiên`;
}
