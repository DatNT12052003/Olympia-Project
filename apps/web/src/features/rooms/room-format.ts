import type { ControlMode, RoomVisibility } from '@olympia/shared';

export { initials } from '../admin/format-activity';

/** Lớp Tailwind theo ghế (viết đủ tên lớp để Tailwind sinh CSS). */
export const SEAT_BG = ['', 'bg-seat-1', 'bg-seat-2', 'bg-seat-3', 'bg-seat-4'] as const;
export const SEAT_BORDER = [
  '',
  'border-seat-1',
  'border-seat-2',
  'border-seat-3',
  'border-seat-4',
] as const;

export const VISIBILITY_LABELS: Record<RoomVisibility, string> = {
  public: 'Công khai',
  private: 'Riêng tư',
};

export const CONTROL_MODE_LABELS: Record<ControlMode, string> = {
  manual: 'Thủ công',
  auto: 'Tự động',
};

/** Đường dẫn link mời theo DL-027. */
export function inviteLink(code: string): string {
  return `${window.location.origin}/vao-phong/${code}`;
}
