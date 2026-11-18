import type { ParticipantView, RoomStatus } from '@olympia/shared';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Badge } from '../../components/Card';
import { MoreIcon } from '../../components/icons';
import { SEAT_BG } from './room-format';

const STATUS_BADGES: Record<
  RoomStatus,
  { label: string; tone: 'green' | 'amber' | 'slate'; dot: string }
> = {
  open: { label: 'Đang mở', tone: 'green', dot: 'bg-green-600' },
  in_match: { label: 'Đang thi', tone: 'amber', dot: 'bg-amber-600' },
  draft: { label: 'Nháp', tone: 'slate', dot: 'bg-slate-500' },
  closed: { label: 'Đã đóng', tone: 'slate', dot: 'bg-slate-400' },
};

export function RoomStatusBadge({ status }: { status: RoomStatus }) {
  const badge = STATUS_BADGES[status];
  return (
    <Badge tone={badge.tone}>
      <span aria-hidden="true" className={`size-[7px] rounded-full ${badge.dot}`} />
      {badge.label}
    </Badge>
  );
}

/** Số ghế trên nền màu ghế; luôn đi kèm số (không dùng màu làm tín hiệu duy nhất). */
export function SeatChip({ seat, size = 'md' }: { seat: number; size?: 'sm' | 'md' }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center font-extrabold text-stage-900 ${
        size === 'sm' ? 'size-[26px] rounded-[7px] text-[13px]' : 'size-[30px] rounded-lg'
      } ${SEAT_BG[seat] ?? 'bg-stage-700'}`}
    >
      {seat}
    </span>
  );
}

/** Nhãn trạng thái người chơi trong sảnh chờ (nền sân khấu). */
export function PlayerStateLabel({ participant }: { participant: ParticipantView }) {
  if (participant.connection === 'disconnected') {
    return <span className="text-[13px] font-semibold text-orange-300">Mất kết nối</span>;
  }
  if (participant.connection === 'offline') {
    return <span className="text-[13px] font-semibold text-stage-200">Chưa vào phòng</span>;
  }
  if (participant.ready) {
    return <span className="text-[13px] font-semibold text-green-300">✓ Sẵn sàng</span>;
  }
  return <span className="text-[13px] font-semibold text-amber-300">Chưa sẵn sàng</span>;
}

export interface MenuItem {
  label: string;
  onSelect: () => void;
  tone?: 'danger';
  disabled?: boolean;
}

/**
 * Nút "Thêm thao tác" mở danh sách thao tác (menu). Esc hoặc bấm ra ngoài để đóng.
 * `theme="stage"` cho màn nền sân khấu.
 */
export function ActionMenu({
  label,
  items,
  theme = 'light',
  trigger,
  className = '',
}: {
  label: string;
  items: MenuItem[];
  theme?: 'light' | 'stage';
  trigger?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const buttonClass =
    theme === 'stage'
      ? 'border border-stage-700 bg-transparent text-white hover:bg-white/5'
      : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50';

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-label={trigger ? undefined : label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex h-10 min-w-10 items-center justify-center gap-2 rounded-lg px-2 text-[13px] font-semibold sm:h-11 sm:min-w-11 ${buttonClass} ${
          trigger ? 'w-full px-3' : ''
        }`}
      >
        {trigger ?? <MoreIcon />}
      </button>
      {open && (
        <ul
          id={menuId}
          role="menu"
          aria-label={label}
          className="absolute right-0 z-20 mt-1 min-w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-slate-900 shadow-lg"
        >
          {items.map((item) => (
            <li key={item.label} role="none">
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={`flex min-h-11 w-full items-center px-4 text-left text-sm font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 ${
                  item.tone === 'danger' ? 'text-red-700' : ''
                }`}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
