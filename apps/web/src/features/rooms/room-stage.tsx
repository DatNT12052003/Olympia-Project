import { usePublicSettings } from '../system/use-public-settings';
import { type ReactNode, useEffect, useState } from 'react';
import { WifiOffIcon } from '../../components/icons';
import type { FloatingReaction } from './use-room-channel';

/** Khung trang nền sân khấu cho sảnh chờ / trận đấu. */
export function StagePage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-stage-900 font-sans text-white">{children}</div>
  );
}

/** Thông báo giữa màn hình sân khấu (đang tải, lỗi, đã rời phòng...). */
export function StageMessage({
  title,
  children,
  actions,
}: {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <StagePage>
      <main className="flex flex-1 items-center justify-center p-4">
        <section className="flex w-full max-w-md flex-col items-center gap-4 rounded-[20px] bg-stage-800 px-6 py-8 text-center">
          <h1 className="text-[22px] font-extrabold">{title}</h1>
          {children && <div className="text-[15px] leading-normal text-stage-200">{children}</div>}
          {actions && <div className="flex w-full flex-col gap-2.5">{actions}</div>}
        </section>
      </main>
    </StagePage>
  );
}

/** Cảm xúc nổi trên màn hình (mục 13). Chỉ trang trí nên ẩn khỏi trình đọc màn hình. */
export function ReactionLayer({ reactions }: { reactions: FloatingReaction[] }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed bottom-24 right-4 z-30 h-72 w-40 sm:right-8"
    >
      {reactions.map((reaction) => (
        <span
          key={reaction.key}
          className="absolute bottom-0 flex flex-col items-center motion-safe:animate-reaction motion-reduce:opacity-90"
          style={{ left: `${(reaction.key * 37) % 100}px` }}
        >
          <span className="text-4xl">{reaction.emoji}</span>
          <span className="max-w-28 truncate rounded bg-stage-900/70 px-1.5 text-[11px] text-stage-200">
            {reaction.from.displayName}
          </span>
        </span>
      ))}
    </div>
  );
}

/** Thanh gửi cảm xúc 👍 ❤️ 😂 🔥; server giới hạn 1 lần/giây (BR-SPEC-02). */
export function ReactionBar({
  enabled,
  onSend,
}: {
  enabled: boolean;
  onSend: (emoji: string) => Promise<string | null>;
}) {
  const [error, setError] = useState<string | null>(null);
  const { reactions } = usePublicSettings();

  if (!enabled) {
    return <p className="text-[13px] text-stage-200">Host đã tắt gửi cảm xúc trong phòng này.</p>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div role="group" aria-label="Gửi cảm xúc" className="flex gap-2">
        {reactions.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={`Gửi ${emoji}`}
            onClick={() => {
              void onSend(emoji).then(setError);
            }}
            className="flex size-11 items-center justify-center rounded-full border border-stage-700 bg-stage-800 text-xl hover:border-accent-400"
          >
            {emoji}
          </button>
        ))}
      </div>
      <p aria-live="polite" className="min-h-4 text-xs text-orange-300">
        {error}
      </p>
    </div>
  );
}

function formatRemaining(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function remainingLabel(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `Còn ${m} phút ${s} giây` : `Còn ${s} giây`;
}

/**
 * Mất kết nối (màn Reconnect, BR-RC-01/02): socket tự kết nối lại; vị trí được giữ trong thời gian
 * chờ do server cấu hình. Đếm từ lúc máy này mất kết nối.
 */
export function ReconnectOverlay({
  offlineSince,
  graceSeconds,
  seatLabel,
  holdsSpot,
  onRetry,
}: {
  offlineSince: number;
  graceSeconds: number;
  seatLabel: string | null;
  /** Người chơi/khán giả được giữ chỗ; Host chỉ cần kết nối lại. */
  holdsSpot: boolean;
  onRetry: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);
  const remaining = Math.max(0, graceSeconds - Math.floor((now - offlineSince) / 1_000));

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-stage-900/65 p-4">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="reconnect-heading"
        aria-describedby="reconnect-description"
        className="flex w-full max-w-sm flex-col items-center gap-4 rounded-[20px] border-2 border-orange-400 bg-stage-800 px-5 py-7 text-center"
      >
        <WifiOffIcon size={56} className="text-orange-300" />
        <h2 id="reconnect-heading" className="text-[22px] font-extrabold">
          Mất kết nối với phòng thi
        </h2>
        <p id="reconnect-description" className="text-[15px] leading-normal text-stage-200">
          Đang thử kết nối lại…
          {holdsSpot &&
            (remaining > 0
              ? ' Vị trí của bạn được giữ trong'
              : ' Đã hết thời gian giữ chỗ, bạn có thể phải vào lại phòng.')}
        </p>
        {holdsSpot && remaining > 0 && (
          <div
            role="timer"
            aria-label={remainingLabel(remaining)}
            className="text-[40px] font-extrabold tabular-nums text-accent-400"
          >
            {formatRemaining(remaining)}
          </div>
        )}
        {seatLabel && (
          <p className="flex w-full justify-between text-sm text-stage-200">
            <span>Vị trí</span>
            <b className="text-white">{seatLabel}</b>
          </p>
        )}
        <button
          type="button"
          onClick={onRetry}
          className="h-[52px] w-full rounded-[14px] bg-accent-400 text-[17px] font-extrabold text-stage-900 hover:bg-accent-500"
        >
          Thử kết nối lại ngay
        </button>
        <p className="text-[13px] leading-normal text-stage-200">
          Khi kết nối lại, bạn nhận đầy đủ trạng thái hiện tại của phòng.
        </p>
      </section>
    </div>
  );
}
