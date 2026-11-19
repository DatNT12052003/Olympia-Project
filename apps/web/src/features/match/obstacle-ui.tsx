import type { ObstacleRowView, ObstacleView } from '@olympia/shared';

/** Bảng chướng ngại vật và ảnh gợi ý (màn ObstacleSpectator, PlayerDesktopObstacle). */

function Tiles({
  count,
  text,
  tone,
  label,
}: {
  count: number;
  text: string | null;
  tone: 'hidden' | 'active' | 'solved' | 'unsolved' | 'keyword';
  label: string;
}) {
  const letters = text ? [...text.replace(/\s+/g, '')] : [];
  const bg =
    tone === 'solved'
      ? 'bg-green-700'
      : tone === 'unsolved'
        ? 'bg-orange-800'
        : tone === 'active'
          ? 'bg-[#2A3F7A]'
          : tone === 'keyword'
            ? 'border border-stage-700 bg-stage-800 text-stage-200'
            : 'bg-stage-900';
  return (
    <div className="flex flex-wrap gap-1.5" aria-label={label}>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`flex h-10 w-8 items-center justify-center rounded-lg text-lg font-extrabold sm:h-11 sm:w-9 ${bg}`}
        >
          {letters[i] ?? (tone === 'keyword' ? '?' : '')}
        </span>
      ))}
    </div>
  );
}

const ROW_STATUS: Record<ObstacleRowView['status'], { text: string; tone: string }> = {
  closed: { text: 'Chưa mở', tone: 'text-stage-200' },
  active: { text: 'Đang thi', tone: 'text-amber-200' },
  solved: { text: 'Đã giải', tone: 'text-green-300' },
  unsolved: { text: 'Không ai giải được', tone: 'text-orange-300' },
  voided: { text: 'Đã hủy', tone: 'text-stage-200' },
};

function rowLabel(row: ObstacleRowView): string {
  return row.kind === 'center' ? 'Ô trung tâm' : `Hàng ${row.index}`;
}

export function ObstacleBoard({
  round,
  remainingSeconds,
}: {
  round: ObstacleView;
  remainingSeconds?: number | null;
}) {
  const keyword = round.keyword;
  return (
    <section
      aria-label="Bảng chướng ngại vật"
      className="flex flex-col gap-3 rounded-[18px] bg-stage-800 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-3 rounded-[14px] border-2 border-dashed border-accent-400 bg-stage-900 p-3">
        <span className="w-36 text-[13px] font-bold text-accent-400">
          Chướng ngại vật · {keyword.letters} ký tự
        </span>
        <Tiles
          count={keyword.letters}
          text={keyword.revealed ? keyword.answer : null}
          tone={keyword.revealed ? (keyword.solvedBy !== null ? 'solved' : 'unsolved') : 'keyword'}
          label={keyword.revealed ? `Từ khóa: ${keyword.answer ?? ''}` : 'Từ khóa chưa được giải'}
        />
      </div>
      {round.rows.map((row) => {
        const status = ROW_STATUS[row.status];
        const active = row.status === 'active';
        return (
          <div
            key={row.index}
            className={`flex flex-wrap items-center gap-3 rounded-xl px-3 py-2.5 ${
              active ? 'border-2 border-accent-400 bg-[#1B3170]' : 'border border-stage-700'
            }`}
          >
            <span className="flex w-36 flex-col gap-0.5">
              <span className="text-sm font-bold">{rowLabel(row)}</span>
              <span className={`text-xs font-semibold ${status.tone}`}>
                {active && remainingSeconds != null
                  ? `Đang trả lời · còn ${String(remainingSeconds).padStart(2, '0')} giây`
                  : row.status === 'solved'
                    ? `✓ Đã giải · ${row.correctCount} người đúng`
                    : status.text}
              </span>
            </span>
            <Tiles
              count={row.letters}
              text={row.answer}
              tone={
                row.status === 'solved'
                  ? 'solved'
                  : row.status === 'unsolved' || row.status === 'voided'
                    ? row.answer
                      ? 'unsolved'
                      : 'hidden'
                    : active
                      ? 'active'
                      : 'hidden'
              }
              label={`${rowLabel(row)}: ${row.letters} chữ cái${row.answer ? `, đáp án ${row.answer}` : ''}`}
            />
          </div>
        );
      })}
    </section>
  );
}

/** Ảnh nền chia mảnh: mỗi hàng được công bố mở một mảnh (BR-R2-03); ô trung tâm ở giữa. */
export function ObstacleImage({ round }: { round: ObstacleView }) {
  const center = round.rows.findIndex((r) => r.kind === 'center');
  const corners = round.rows
    .map((row, i) => ({ row, open: round.pieces[i] ?? false }))
    .filter(({ row }) => row.kind === 'row');
  const cols = corners.length <= 4 ? 2 : 3;
  const centerOpen = center >= 0 ? (round.pieces[center] ?? false) : true;
  return (
    <section
      aria-labelledby="obstacle-image"
      className="flex flex-col gap-3 rounded-[18px] bg-stage-800 p-4 sm:p-5"
    >
      <h2 id="obstacle-image" className="text-base font-bold">
        Hình ảnh gợi ý
      </h2>
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-stage-900">
        {round.image?.kind === 'image' && (
          <img
            src={round.image.url}
            alt={
              round.keyword.revealed
                ? `Ảnh chướng ngại vật: ${round.keyword.answer ?? ''}`
                : 'Ảnh chướng ngại vật, đang được che một phần'
            }
            className="absolute inset-0 size-full object-cover"
          />
        )}
        <div
          className="absolute inset-0 grid gap-1"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {corners.map(({ row, open }) => (
            <div
              key={row.index}
              className={`flex items-center justify-center text-[28px] font-extrabold text-stage-200 ${
                open ? 'bg-transparent' : 'bg-[#1E3A75]'
              }`}
            >
              {!open && row.index}
            </div>
          ))}
        </div>
        {center >= 0 && !centerOpen && (
          <div className="absolute left-[30%] top-[30%] flex h-[40%] w-[40%] items-center justify-center rounded-[10px] border-[3px] border-stage-900 bg-stage-800 text-[13px] font-bold text-stage-200">
            Trung tâm
          </div>
        )}
      </div>
      <p className="text-[13px] leading-normal text-stage-200">
        {round.keyword.revealed
          ? `Từ khóa: ${round.keyword.answer ?? ''}`
          : `Mỗi hàng ngang được công bố mở một mảnh ảnh. Giải chướng ngại vật lúc này được ${round.keyword.points} điểm.`}
      </p>
    </section>
  );
}
