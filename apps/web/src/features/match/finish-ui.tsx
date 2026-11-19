import type { FinishPackItemView, FinishView } from '@olympia/shared';
import { useState } from 'react';
import { StarIcon } from '../../components/icons';

/** Thành phần vòng Về đích (màn FinishPick, HostControlFinish). */

const ITEM_STATE: Record<FinishPackItemView['state'], { text: string; tone: string }> = {
  pending: { text: '', tone: 'border border-stage-700 text-stage-200' },
  current: { text: 'đang thi', tone: 'bg-accent-400 text-stage-900' },
  correct: { text: '✓ đúng', tone: 'border border-green-500 bg-[#0F3B2A]' },
  wrong: { text: '✕ sai', tone: 'border border-orange-500 bg-[#3B1D24]' },
  stolen: { text: 'bị giành điểm', tone: 'border border-orange-500 bg-[#3B1D24]' },
  skipped: { text: 'bỏ qua', tone: 'border border-stage-700 text-stage-200' },
  voided: { text: 'đã hủy', tone: 'border border-stage-700 text-stage-200' },
};

/** Gói câu hỏi đã chọn: mức điểm, sao, kết quả từng câu. */
export function PackChips({ pack, title }: { pack: FinishPackItemView[]; title: string }) {
  return (
    <section
      aria-label={title}
      className="flex flex-wrap items-center gap-3 rounded-[18px] bg-stage-800 px-5 py-4"
    >
      <h2 className="w-40 text-sm font-semibold text-stage-200">{title}</h2>
      {pack.map((item, i) => {
        const state = ITEM_STATE[item.state];
        return (
          <span
            key={i}
            className={`inline-flex h-9 items-center gap-1.5 rounded-[10px] px-3.5 text-sm font-bold ${state.tone}`}
          >
            {item.star && <StarIcon size={14} filled />}
            Câu {i + 1} · {item.points}
            {state.text && <span className="text-xs font-semibold">{state.text}</span>}
          </span>
        );
      })}
    </section>
  );
}

/** Chọn mức điểm cho từng câu và Ngôi sao hy vọng (tối đa 1). */
export function PackPicker({
  round,
  submitLabel,
  onSubmit,
}: {
  round: FinishView;
  submitLabel: (levels: number[]) => string;
  onSubmit: (levels: number[], star: number | null) => Promise<string | null>;
}) {
  const lowest = Math.min(...round.levels.map((l) => l.points));
  const [levels, setLevels] = useState<number[]>(() =>
    Array.from({ length: round.questionsPerPlayer }, () => lowest),
  );
  const [star, setStar] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const secondsOf = (points: number) => round.levels.find((l) => l.points === points)?.seconds ?? 0;
  const max = levels.reduce((sum, points, i) => sum + (i === star ? points * 2 : points), 0);

  async function submit() {
    setPending(true);
    setError(await onSubmit(levels, star));
    setPending(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-normal text-stage-200">
        Chọn mức điểm cho {round.questionsPerPlayer} câu.{' '}
        {round.levels.map((l) => `Câu ${l.points} điểm có ${l.seconds} giây`).join(', ')}.
      </p>
      <ol className="flex flex-col gap-3">
        {levels.map((points, i) => (
          <li
            key={i}
            className={`flex flex-col gap-3 rounded-2xl bg-stage-800 p-3.5 ${
              star === i ? 'border-2 border-accent-400' : 'border border-stage-700'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-[15px] font-bold">Câu {i + 1}</span>
              {round.starEnabled && (
                <button
                  type="button"
                  aria-pressed={star === i}
                  onClick={() => setStar(star === i ? null : i)}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold ${
                    star === i
                      ? 'bg-accent-400 text-stage-900'
                      : 'border border-stage-700 text-stage-200'
                  }`}
                >
                  <StarIcon size={16} filled={star === i} />
                  Ngôi sao hy vọng
                </button>
              )}
            </div>
            <div
              role="radiogroup"
              aria-label={`Mức điểm câu ${i + 1}`}
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${round.levels.length}, minmax(0, 1fr))` }}
            >
              {round.levels.map((level) => {
                const active = level.points === points;
                return (
                  <button
                    key={level.points}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setLevels(levels.map((v, j) => (j === i ? level.points : v)))}
                    className={`h-[52px] rounded-xl text-xl font-extrabold ${
                      active
                        ? 'border-[3px] border-accent-400 bg-accent-400 text-stage-900'
                        : 'border-2 border-stage-700 bg-stage-900 text-white'
                    }`}
                  >
                    {level.points}
                  </button>
                );
              })}
            </div>
            <span className={`text-xs ${star === i ? 'text-amber-200' : 'text-stage-200'}`}>
              {star === i
                ? `Đúng: ×2 = ${points * 2} điểm · Sai: −${points} điểm`
                : `${secondsOf(points)} giây`}
            </span>
          </li>
        ))}
      </ol>
      <p className="flex justify-between text-sm text-stage-200">
        <span>Điểm tối đa có thể đạt</span>
        <b className="text-base text-white">+{max}</b>
      </p>
      <p role="alert" className="min-h-5 text-sm text-orange-300">
        {error}
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() => void submit()}
        className="h-14 rounded-[14px] bg-accent-400 text-lg font-extrabold text-stage-900 hover:bg-accent-500 disabled:opacity-60"
      >
        {pending ? 'Đang gửi…' : submitLabel(levels)}
      </button>
    </div>
  );
}
