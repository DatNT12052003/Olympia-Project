import { useEffect, useState } from 'react';
import { MaximizeIcon, MinimizeIcon, MusicIcon, MusicOffIcon } from '../../components/icons';
import type { ResultFlash } from './match-cues';

const controlClass =
  'flex size-11 items-center justify-center rounded-full border border-stage-700 bg-stage-900/90 text-white shadow-lg hover:bg-stage-700';

function useFullscreen() {
  const [active, setActive] = useState(() => Boolean(document.fullscreenElement));
  useEffect(() => {
    const onChange = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const supported = typeof document.documentElement.requestFullscreen === 'function';
  const toggle = () => {
    const request = document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen();
    void request.catch(() => undefined);
  };
  return { active, supported, toggle };
}

/**
 * Nút nổi ở góc màn trận (11.4): bật/tắt hiệu ứng âm thanh trên máy mình và toàn màn hình. Âm
 * thanh video/giọng nói vẫn điều khiển riêng bằng nút loa.
 */
export function MatchFxControls({
  soundAvailable,
  muted,
  onMutedChange,
}: {
  soundAvailable: boolean;
  muted: boolean;
  onMutedChange: (muted: boolean) => void;
}) {
  const fullscreen = useFullscreen();
  if (!soundAvailable && !fullscreen.supported) return null;
  return (
    <div className="fixed right-3 bottom-3 z-30 flex gap-2 sm:right-4 sm:bottom-4">
      {soundAvailable && (
        <button
          type="button"
          aria-pressed={!muted}
          aria-label={muted ? 'Bật hiệu ứng âm thanh' : 'Tắt hiệu ứng âm thanh'}
          title={muted ? 'Bật hiệu ứng âm thanh' : 'Tắt hiệu ứng âm thanh'}
          onClick={() => onMutedChange(!muted)}
          className={controlClass}
        >
          {muted ? <MusicOffIcon size={20} /> : <MusicIcon size={20} />}
        </button>
      )}
      {fullscreen.supported && (
        <button
          type="button"
          aria-pressed={fullscreen.active}
          aria-label={fullscreen.active ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
          title={fullscreen.active ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
          onClick={fullscreen.toggle}
          className={controlClass}
        >
          {fullscreen.active ? <MinimizeIcon size={20} /> : <MaximizeIcon size={20} />}
        </button>
      )}
    </div>
  );
}

/** Viền sáng xanh/cam quanh màn hình khi kết quả của chính người chơi được công bố. */
export function ResultFlashOverlay({
  flash,
}: {
  flash: { result: ResultFlash; key: number } | null;
}) {
  if (!flash) return null;
  return (
    <div
      key={flash.key}
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 z-20 animate-result-flash motion-reduce:hidden ${
        flash.result === 'correct'
          ? 'shadow-[inset_0_0_80px_24px_rgba(34,197,94,0.55)]'
          : 'shadow-[inset_0_0_80px_24px_rgba(249,115,22,0.55)]'
      }`}
    />
  );
}

const CONFETTI_COLORS = ['bg-accent-400', 'bg-seat-2', 'bg-seat-3', 'bg-seat-4', 'bg-white'];

/** Pháo giấy khi trận kết thúc (hiệu ứng chiến thắng, 11.4); tắt khi người dùng giảm chuyển động. */
export function Confetti({ pieces = 60 }: { pieces?: number }) {
  const [items] = useState(() =>
    Array.from({ length: pieces }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.8,
      duration: 2 + Math.random() * 1.6,
      size: 6 + Math.round(Math.random() * 6),
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    })),
  );
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[60] overflow-hidden motion-reduce:hidden"
    >
      {items.map((p, i) => (
        <span
          key={i}
          className={`absolute top-0 block animate-confetti rounded-[2px] ${p.color}`}
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.6,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            opacity: 0,
          }}
        />
      ))}
    </div>
  );
}
