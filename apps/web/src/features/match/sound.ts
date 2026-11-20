/**
 * Hiệu ứng âm thanh trận đấu (11.4) tổng hợp bằng Web Audio API: không cần tệp âm thanh, không
 * vướng bản quyền. Trình duyệt chỉ cho phát sau thao tác của người dùng, nên AudioContext được
 * tạo/mở lại ở lần phát đầu tiên sau một cú chạm/bấm.
 */

export type MatchCue = 'correct' | 'wrong' | 'buzz' | 'tick' | 'win' | 'question';

const MUTED_KEY = 'olympia.soundMuted';

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  if (context.state === 'suspended') void context.resume().catch(() => undefined);
  return context;
}

/** Một nốt có bao âm (attack ngắn, tắt dần) để tránh tiếng "bụp". */
function tone(
  ctx: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  { type = 'sine', volume = 0.2 }: { type?: OscillatorType; volume?: number } = {},
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

const CUES: Record<MatchCue, (ctx: AudioContext, t: number) => void> = {
  // Hai nốt đi lên (Đô – Sol).
  correct: (ctx, t) => {
    tone(ctx, 523.25, t, 0.18, { type: 'triangle' });
    tone(ctx, 783.99, t + 0.12, 0.32, { type: 'triangle' });
  },
  // Tiếng "rè" trầm đi xuống.
  wrong: (ctx, t) => {
    tone(ctx, 220, t, 0.22, { type: 'sawtooth', volume: 0.12 });
    tone(ctx, 164.81, t + 0.18, 0.38, { type: 'sawtooth', volume: 0.12 });
  },
  // Chuông giành quyền: nốt cao, ngân.
  buzz: (ctx, t) => {
    tone(ctx, 1046.5, t, 0.5, { type: 'sine', volume: 0.25 });
    tone(ctx, 1568, t, 0.35, { type: 'sine', volume: 0.08 });
  },
  // Tích tắc 5 giây cuối.
  tick: (ctx, t) => tone(ctx, 1200, t, 0.06, { type: 'square', volume: 0.05 }),
  // Câu hỏi mới hiện ra.
  question: (ctx, t) => tone(ctx, 659.25, t, 0.2, { type: 'triangle', volume: 0.12 }),
  // Kèn chiến thắng: hợp âm rải Đô trưởng.
  win: (ctx, t) => {
    [523.25, 659.25, 783.99].forEach((f, i) =>
      tone(ctx, f, t + i * 0.12, 0.3, { type: 'triangle' }),
    );
    tone(ctx, 1046.5, t + 0.36, 0.7, { type: 'triangle', volume: 0.22 });
  },
};

export function playCue(cue: MatchCue): void {
  try {
    const ctx = audioContext();
    if (!ctx) return;
    CUES[cue](ctx, ctx.currentTime + 0.01);
  } catch {
    // Âm thanh là phụ: lỗi trình duyệt không được ảnh hưởng trận đấu.
  }
}

/** Người xem tự tắt âm thanh trên máy mình (lưu trong trình duyệt). */
export function readSoundMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeSoundMuted(muted: boolean): void {
  try {
    if (muted) localStorage.setItem(MUTED_KEY, '1');
    else localStorage.removeItem(MUTED_KEY);
  } catch {
    // Bỏ qua: chế độ riêng tư có thể chặn localStorage.
  }
}
