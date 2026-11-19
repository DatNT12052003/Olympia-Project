import {
  DEFAULT_SCRIPT_SETTINGS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYABLE_ROUNDS,
  type QuestionSource,
  ROUND_KEYS,
  ROUND_TITLES,
  type RoundKey,
  roundRequirement,
  type ScriptDetail,
  type ScriptInput,
  scriptInputSchema,
  type ScriptRound,
  type ScriptSettings,
  type SourceInfo,
  supportedPlayersFor,
  type AccelerationRules,
  type FinishRules,
  obstacleKeywordPoints,
  type ObstacleRules,
  ROUND_PRESETS,
  type RoundPreset,
  type WarmupRules,
} from '@olympia/shared';
import { type ReactNode, useId, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Alert } from '../../components/Alert';
import { Spinner, Wordmark } from '../../components/Card';
import {
  AlertTriangleIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronUpIcon,
  PlusIcon,
} from '../../components/icons';
import { useScript, useDuplicateScript, useSaveScript } from '../../features/match/match-api';
import { usePublicSets, useQuestionSets } from '../../features/question-bank/qb-api';
import { ActionMenu } from '../../features/rooms/room-ui';
import { errorMessage } from '../../lib/api-client';

interface Draft {
  name: string;
  settings: ScriptSettings;
  rounds: ScriptRound[];
}

const BREAK_OPTIONS = [0, 15, 30, 60, 120];

function newRound(type: RoundKey): ScriptRound {
  const preset = ROUND_PRESETS[type][0]!;
  return {
    type,
    preset: preset.id,
    source: null,
    rules: structuredClone(preset.rules),
  } as ScriptRound;
}

function sameSource(a: QuestionSource | null, b: QuestionSource | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sourceValue(source: QuestionSource | null): string {
  if (!source) return '';
  return source.kind === 'set' ? `set:${source.setId}` : `public:${source.versionId}`;
}

function parseSource(value: string): QuestionSource | null {
  const [kind, id] = value.split(':');
  if (kind === 'set' && id) return { kind: 'set', setId: id };
  if (kind === 'public' && id) return { kind: 'public', versionId: id };
  return null;
}

function roundSummary(round: ScriptRound): string {
  const parts: string[] = [];
  switch (round.type) {
    case 'warmup': {
      const r = round.rules;
      if (r.individual.enabled)
        parts.push(
          `${r.individual.questionsPerPlayer} câu/người · ${r.individual.timeSeconds} giây`,
        );
      if (r.shared.enabled) parts.push(`thi chung ${r.shared.questionCount} câu`);
      if (r.answerMode === 'verbal') parts.push('trả lời bằng lời');
      break;
    }
    case 'obstacle': {
      const r = round.rules;
      parts.push(`${r.rowCount} hàng${r.centerEnabled ? ' + ô trung tâm' : ''}`);
      parts.push(`${r.rowSeconds} giây/hàng`);
      break;
    }
    case 'acceleration': {
      const r = round.rules;
      parts.push(`${r.questionCount} câu · ${r.timeSeconds} giây`, r.rankPoints.join('/'));
      break;
    }
    case 'finish': {
      const r = round.rules;
      parts.push(`${r.questionsPerPlayer} câu/người`, r.levels.map((l) => l.points).join('/'));
      if (r.answerMode === 'verbal') parts.push('trả lời bằng lời');
      break;
    }
  }
  return parts.join(' · ');
}

/** Hướng dẫn xếp câu hỏi của vòng trong bộ đề (DL-040…DL-043). */
const SOURCE_HINTS: Record<RoundKey, string> = {
  warmup:
    'Vòng dùng các câu được xếp vào nhóm “Khởi động” trong bộ đề, theo thứ tự. Câu dư làm câu dự phòng.',
  obstacle:
    'Theo thứ tự trong nhóm “Vượt chướng ngại vật”: câu 1 là từ khóa CNV (media của câu là ảnh nền), tiếp theo là các hàng ngang, cuối cùng là ô trung tâm. Mọi câu là trả lời ngắn.',
  acceleration: 'Vòng dùng các câu trong nhóm “Tăng tốc”, theo thứ tự. Câu dư làm câu dự phòng.',
  finish:
    'Câu trong nhóm “Về đích” được xếp theo “Điểm mặc định” của câu (ví dụ 20, 30); câu chưa có điểm mặc định dùng cho mọi mức.',
};

/** Lỗi zod theo đường dẫn "rounds.0.rules.individual.timeSeconds". */
function issuesByPath(input: unknown): Map<string, string> {
  const result = new Map<string, string>();
  const parsed = scriptInputSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.');
      if (!result.has(key)) result.set(key, issue.message);
    }
  }
  return result;
}

function NumberField({
  label,
  value,
  onChange,
  error,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  error?: string | undefined;
  suffix?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold">
        {label}
        {suffix && <span className="font-normal text-slate-600"> ({suffix})</span>}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        value={Number.isNaN(value) ? '' : value}
        onChange={(event) => onChange(Number.parseInt(event.target.value, 10))}
        aria-invalid={error ? true : undefined}
        className={`h-11 rounded-lg bg-white px-3 text-[15px] ${error ? 'border-2 border-orange-700' : 'border border-slate-300'}`}
      />
      {error && <p className="text-[13px] text-orange-800">{error}</p>}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px] font-semibold">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-[18px] accent-brand-600"
      />
      {label}
    </label>
  );
}

function Group({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3 border-t border-slate-100 pt-4">
      <legend className="float-left mb-1 w-full text-[15px] font-bold">{title}</legend>
      {children}
    </fieldset>
  );
}

interface RulesProps<R> {
  rules: R;
  setRules: (patch: (draft: R) => void) => void;
  err: (path: string) => string | undefined;
}

function AnswerModeField({
  value,
  onChange,
}: {
  value: 'device' | 'verbal';
  onChange: (value: 'device' | 'verbal') => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold">Hình thức trả lời (phần thi theo lượt)</legend>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {(
          [
            ['device', 'Nhập trên thiết bị (chấm tự động gợi ý)'],
            ['verbal', 'Trả lời bằng lời (Host chấm)'],
          ] as const
        ).map(([mode, label]) => (
          <label key={mode} className="flex min-h-11 items-center gap-2 text-[15px]">
            <input
              type="radio"
              name="answerMode"
              checked={value === mode}
              onChange={() => onChange(mode)}
              className="size-[18px] accent-brand-600"
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SelectBox({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"
      >
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}

const fieldGrid = 'grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3.5';

function WarmupRulesFields({ rules, setRules, err }: RulesProps<WarmupRules>) {
  return (
    <>
      <AnswerModeField
        value={rules.answerMode}
        onChange={(v) => setRules((r) => (r.answerMode = v))}
      />
      <Group
        title={
          <Toggle
            label="Phần thi riêng"
            checked={rules.individual.enabled}
            onChange={(v) => setRules((r) => (r.individual.enabled = v))}
          />
        }
      >
        {rules.individual.enabled && (
          <div className={fieldGrid}>
            <NumberField
              label="Số câu mỗi người"
              value={rules.individual.questionsPerPlayer}
              onChange={(v) => setRules((r) => (r.individual.questionsPerPlayer = v))}
              error={err('individual.questionsPerPlayer')}
            />
            <NumberField
              label="Thời gian mỗi câu"
              suffix="giây"
              value={rules.individual.timeSeconds}
              onChange={(v) => setRules((r) => (r.individual.timeSeconds = v))}
              error={err('individual.timeSeconds')}
            />
            <NumberField
              label="Điểm khi đúng"
              value={rules.individual.pointsCorrect}
              onChange={(v) => setRules((r) => (r.individual.pointsCorrect = v))}
              error={err('individual.pointsCorrect')}
            />
          </div>
        )}
        {err('individual.enabled') && (
          <p className="text-[13px] text-orange-800">{err('individual.enabled')}</p>
        )}
      </Group>
      <Group
        title={
          <Toggle
            label="Phần thi chung (giành quyền bằng chuông)"
            checked={rules.shared.enabled}
            onChange={(v) => setRules((r) => (r.shared.enabled = v))}
          />
        }
      >
        {rules.shared.enabled && (
          <div className={fieldGrid}>
            <NumberField
              label="Số câu"
              value={rules.shared.questionCount}
              onChange={(v) => setRules((r) => (r.shared.questionCount = v))}
              error={err('shared.questionCount')}
            />
            <NumberField
              label="Thời gian mở chuông"
              suffix="giây"
              value={rules.shared.buzzSeconds}
              onChange={(v) => setRules((r) => (r.shared.buzzSeconds = v))}
              error={err('shared.buzzSeconds')}
            />
            <NumberField
              label="Thời gian trả lời"
              suffix="giây"
              value={rules.shared.answerSeconds}
              onChange={(v) => setRules((r) => (r.shared.answerSeconds = v))}
              error={err('shared.answerSeconds')}
            />
            <NumberField
              label="Điểm khi đúng"
              value={rules.shared.pointsCorrect}
              onChange={(v) => setRules((r) => (r.shared.pointsCorrect = v))}
              error={err('shared.pointsCorrect')}
            />
            <NumberField
              label="Điểm trừ khi sai"
              value={rules.shared.pointsWrong}
              onChange={(v) => setRules((r) => (r.shared.pointsWrong = v))}
              error={err('shared.pointsWrong')}
            />
            <SelectBox
              label="Khi trả lời sai"
              value={rules.shared.afterWrong}
              onChange={(v) => setRules((r) => (r.shared.afterWrong = v as 'reopen' | 'next'))}
              options={[
                ['reopen', 'Mở chuông cho người khác'],
                ['next', 'Chuyển câu'],
              ]}
            />
          </div>
        )}
      </Group>
    </>
  );
}

function ObstacleRulesFields({ rules, setRules, err }: RulesProps<ObstacleRules>) {
  const examples = Array.from({ length: Math.max(0, rules.rowCount || 0) }, (_, i) =>
    obstacleKeywordPoints(rules, i + 1, false),
  );
  return (
    <>
      <Group title="Bảng chướng ngại vật">
        <div className={fieldGrid}>
          <NumberField
            label="Số hàng ngang"
            value={rules.rowCount}
            onChange={(v) => setRules((r) => (r.rowCount = v))}
            error={err('rowCount')}
          />
          <NumberField
            label="Thời gian mỗi hàng"
            suffix="giây"
            value={rules.rowSeconds}
            onChange={(v) => setRules((r) => (r.rowSeconds = v))}
            error={err('rowSeconds')}
          />
          <NumberField
            label="Điểm hàng ngang"
            value={rules.rowPoints}
            onChange={(v) => setRules((r) => (r.rowPoints = v))}
            error={err('rowPoints')}
          />
          <SelectBox
            label="Chọn hàng"
            value={rules.rowSelection}
            onChange={(v) => setRules((r) => (r.rowSelection = v as 'player' | 'order'))}
            options={[
              ['player', 'Lần lượt từng người chơi chọn'],
              ['order', 'Mở theo thứ tự hàng'],
            ]}
          />
        </div>
        <Toggle
          label="Có ô trung tâm (gợi ý cuối)"
          checked={rules.centerEnabled}
          onChange={(v) => setRules((r) => (r.centerEnabled = v))}
        />
      </Group>
      <Group title="Điểm chướng ngại vật">
        <div className={fieldGrid}>
          <NumberField
            label="Sau 1 hàng"
            value={rules.keywordStartPoints}
            onChange={(v) => setRules((r) => (r.keywordStartPoints = v))}
            error={err('keywordStartPoints')}
          />
          <NumberField
            label="Giảm mỗi hàng mở thêm"
            value={rules.keywordStep}
            onChange={(v) => setRules((r) => (r.keywordStep = v))}
            error={err('keywordStep')}
          />
          <NumberField
            label="Sau ô trung tâm"
            value={rules.keywordCenterPoints}
            onChange={(v) => setRules((r) => (r.keywordCenterPoints = v))}
            error={err('keywordCenterPoints')}
          />
        </div>
        <p className="text-[13px] text-slate-600">
          Điểm theo số hàng đã mở: {examples.join(' / ')}
          {rules.centerEnabled ? ` / ô trung tâm ${rules.keywordCenterPoints}` : ''}. Đoán sai bị
          loại khỏi phần còn lại của vòng.
        </p>
      </Group>
    </>
  );
}

function AccelerationRulesFields({ rules, setRules, err }: RulesProps<AccelerationRules>) {
  return (
    <Group title="Luật vòng">
      <div className={fieldGrid}>
        <NumberField
          label="Số câu"
          value={rules.questionCount}
          onChange={(v) => setRules((r) => (r.questionCount = v))}
          error={err('questionCount')}
        />
        <NumberField
          label="Thời gian mỗi câu"
          suffix="giây"
          value={rules.timeSeconds}
          onChange={(v) => setRules((r) => (r.timeSeconds = v))}
          error={err('timeSeconds')}
        />
      </div>
      <div className={fieldGrid}>
        {rules.rankPoints.map((value, i) => (
          <NumberField
            key={i}
            label={`Điểm người đúng thứ ${i + 1}`}
            value={value}
            onChange={(v) => setRules((r) => (r.rankPoints[i] = v))}
            error={err(`rankPoints.${i}`)}
          />
        ))}
      </div>
      <Toggle
        label="Cho gửi lại để sửa đáp án (thời gian tính theo lần gửi cuối)"
        checked={rules.allowResubmit}
        onChange={(v) => setRules((r) => (r.allowResubmit = v))}
      />
    </Group>
  );
}

function FinishRulesFields({ rules, setRules, err }: RulesProps<FinishRules>) {
  return (
    <>
      <AnswerModeField
        value={rules.answerMode}
        onChange={(v) => setRules((r) => (r.answerMode = v))}
      />
      <Group title="Gói câu hỏi">
        <div className={fieldGrid}>
          <NumberField
            label="Số câu mỗi người"
            value={rules.questionsPerPlayer}
            onChange={(v) => setRules((r) => (r.questionsPerPlayer = v))}
            error={err('questionsPerPlayer')}
          />
          <SelectBox
            label="Thứ tự thi"
            value={rules.order}
            onChange={(v) => setRules((r) => (r.order = v as 'score_asc' | 'seat'))}
            options={[
              ['score_asc', 'Điểm thấp thi trước'],
              ['seat', 'Theo vị trí'],
            ]}
          />
        </div>
        {rules.levels.map((level, i) => (
          <div key={i} className={fieldGrid}>
            <NumberField
              label={`Mức ${i + 1}: điểm`}
              value={level.points}
              onChange={(v) => setRules((r) => (r.levels[i]!.points = v))}
              error={err(`levels.${i}.points`)}
            />
            <NumberField
              label={`Mức ${i + 1}: thời gian`}
              suffix="giây"
              value={level.seconds}
              onChange={(v) => setRules((r) => (r.levels[i]!.seconds = v))}
              error={err(`levels.${i}.seconds`)}
            />
          </div>
        ))}
        {err('levels') && <p className="text-[13px] text-orange-800">{err('levels')}</p>}
        <Toggle
          label="Ngôi sao hy vọng (đúng ×2, sai trừ điểm câu)"
          checked={rules.starEnabled}
          onChange={(v) => setRules((r) => (r.starEnabled = v))}
        />
      </Group>
      <Group
        title={
          <Toggle
            label="Giành quyền khi Player chính sai/hết giờ"
            checked={rules.steal.enabled}
            onChange={(v) => setRules((r) => (r.steal.enabled = v))}
          />
        }
      >
        {rules.steal.enabled && (
          <>
            <div className={fieldGrid}>
              <NumberField
                label="Thời gian bấm chuông"
                suffix="giây"
                value={rules.steal.buzzSeconds}
                onChange={(v) => setRules((r) => (r.steal.buzzSeconds = v))}
                error={err('steal.buzzSeconds')}
              />
              <NumberField
                label="Thời gian trả lời"
                suffix="giây"
                value={rules.steal.answerSeconds}
                onChange={(v) => setRules((r) => (r.steal.answerSeconds = v))}
                error={err('steal.answerSeconds')}
              />
              <NumberField
                label="Sai bị trừ"
                suffix="% điểm câu"
                value={rules.steal.wrongPenaltyPercent}
                onChange={(v) => setRules((r) => (r.steal.wrongPenaltyPercent = v))}
                error={err('steal.wrongPenaltyPercent')}
              />
            </div>
            <Toggle
              label="Đúng thì lấy điểm từ Player chính"
              checked={rules.steal.takeFromMain}
              onChange={(v) => setRules((r) => (r.steal.takeFromMain = v))}
            />
          </>
        )}
      </Group>
    </>
  );
}

function RoundConfig({
  round,
  index,
  onChange,
  errors,
  sourceInfo,
}: {
  round: ScriptRound;
  index: number;
  onChange: (round: ScriptRound) => void;
  errors: Map<string, string>;
  sourceInfo: SourceInfo | null | undefined;
}) {
  const sets = useQuestionSets();
  const publicSets = usePublicSets('');
  const err = (path: string) => errors.get(`rounds.${index}.rules.${path}`);
  const presets: readonly RoundPreset<unknown>[] = ROUND_PRESETS[round.type];
  const preset = presets.find(
    (p) => p.id === round.preset && JSON.stringify(p.rules) === JSON.stringify(round.rules),
  );

  function setRules<R>(patch: (draft: R) => void) {
    const next = structuredClone(round.rules) as R;
    patch(next);
    onChange({ ...round, rules: next } as ScriptRound);
  }

  // Số câu hiện có: bộ đề của mình lấy từ danh sách bộ đề; bộ public lấy từ lần lưu gần nhất.
  let available: number | null = null;
  if (round.source?.kind === 'set') {
    const setId = round.source.setId;
    const set = sets.data?.find((s) => s.id === setId);
    available = set ? (set.roundCounts[round.type] ?? 0) : (sourceInfo?.available ?? null);
  } else if (round.source && sourceInfo) {
    available = sourceInfo.available;
  }
  const requirement = roundRequirement(round);
  const supported =
    available === null ? null : supportedPlayersFor(available, requirement, MAX_PLAYERS);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] font-semibold text-slate-600">Vòng {index + 1}</p>
          <h2 id="round-config-heading" className="mt-0.5 text-[22px] font-bold">
            {ROUND_TITLES[round.type]}
          </h2>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="round-preset" className="text-[13px] font-semibold">
            Bộ luật (preset)
          </label>
          <select
            id="round-preset"
            value={preset?.id ?? 'custom'}
            onChange={(event) => {
              const chosen = presets.find((p) => p.id === event.target.value);
              if (chosen)
                onChange({
                  ...round,
                  preset: chosen.id,
                  rules: structuredClone(chosen.rules),
                } as ScriptRound);
            }}
            className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            {!preset && <option value="custom">Tùy chỉnh</option>}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="round-source" className="text-sm font-semibold">
          Nguồn câu hỏi
        </label>
        <select
          id="round-source"
          value={sourceValue(round.source)}
          onChange={(event) => onChange({ ...round, source: parseSource(event.target.value) })}
          className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-[15px]"
        >
          <option value="">Chọn bộ đề…</option>
          <optgroup label="Bộ đề của tôi">
            {sets.data?.map((set) => (
              <option key={set.id} value={`set:${set.id}`}>
                {set.name} ({set.roundCounts[round.type] ?? 0} câu {ROUND_TITLES[round.type]})
              </option>
            ))}
          </optgroup>
          <optgroup label="Bộ câu hỏi public">
            {publicSets.data?.map((set) => (
              <option key={set.versionId} value={`public:${set.versionId}`}>
                {set.name} · {set.ownerName}
              </option>
            ))}
            {round.source?.kind === 'public' &&
              !publicSets.data?.some(
                (s) => round.source?.kind === 'public' && s.versionId === round.source.versionId,
              ) && (
                <option value={sourceValue(round.source)}>
                  {sourceInfo?.name ?? 'Bộ public đã chọn'}
                </option>
              )}
          </optgroup>
        </select>
        <p className="text-[13px] text-slate-600">{SOURCE_HINTS[round.type]}</p>
      </div>

      {round.type === 'warmup' && (
        <WarmupRulesFields rules={round.rules} setRules={setRules<WarmupRules>} err={err} />
      )}
      {round.type === 'obstacle' && (
        <ObstacleRulesFields rules={round.rules} setRules={setRules<ObstacleRules>} err={err} />
      )}
      {round.type === 'acceleration' && (
        <AccelerationRulesFields
          rules={round.rules}
          setRules={setRules<AccelerationRules>}
          err={err}
        />
      )}
      {round.type === 'finish' && (
        <FinishRulesFields rules={round.rules} setRules={setRules<FinishRules>} err={err} />
      )}

      <div className="flex flex-col gap-1 border-t border-slate-100 pt-4">
        <h3 className="text-[15px] font-bold">Câu hỏi của vòng</h3>
        <p className="text-sm text-slate-700">
          Cần {requirement.fixed > 0 && `${requirement.fixed} câu`}
          {requirement.fixed > 0 && requirement.perPlayer > 0 && ' + '}
          {requirement.perPlayer > 0 && `${requirement.perPlayer} câu cho mỗi người chơi`}
          {requirement.perPlayer > 0 &&
            ` (4 người: ${requirement.fixed + requirement.perPlayer * MAX_PLAYERS} câu)`}
          .
        </p>
        {!round.source ? (
          <p className="text-sm font-semibold text-orange-800">Chưa chọn nguồn câu hỏi.</p>
        ) : supported === null ? (
          <p className="text-sm text-slate-600">Lưu kịch bản để kiểm tra số câu của bộ public.</p>
        ) : supported >= MAX_PLAYERS ? (
          <p className="text-sm font-semibold text-green-800">✓ Đủ câu hỏi ({available} câu).</p>
        ) : supported >= MIN_PLAYERS ? (
          <p className="text-sm font-semibold text-amber-800">
            Nguồn có {available} câu: đủ cho tối đa {supported} người chơi.
          </p>
        ) : (
          <p className="text-sm font-semibold text-orange-800">
            Thiếu câu hỏi: nguồn có {available} câu, cần ít nhất{' '}
            {requirement.fixed + requirement.perPlayer * MIN_PLAYERS} câu cho {MIN_PLAYERS} người
            chơi.
          </p>
        )}
      </div>
    </>
  );
}

function Builder({ script }: { script?: ScriptDetail }) {
  const navigate = useNavigate();
  const save = useSaveScript(script?.id);
  const duplicate = useDuplicateScript();
  const [draft, setDraft] = useState<Draft>(() =>
    script
      ? { name: script.name, settings: script.settings, rounds: script.rounds.map((r) => r.round) }
      : { name: '', settings: DEFAULT_SCRIPT_SETTINGS, rounds: [newRound('warmup')] },
  );
  const [active, setActive] = useState(0);
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const savedSources = new Map(
    (script?.rounds ?? []).map((r) => [r.round.type, { source: r.round.source, info: r.source }]),
  );
  const savedIssues = (script?.rounds ?? []).flatMap((r) =>
    r.check.issues.map((issue) => `${ROUND_TITLES[r.round.type]}: ${issue}`),
  );
  const unchanged =
    script !== undefined &&
    JSON.stringify(draft.rounds) === JSON.stringify(script.rounds.map((r) => r.round));

  function setRound(index: number, round: ScriptRound) {
    setDraft((d) => ({ ...d, rounds: d.rounds.map((r, i) => (i === index ? round : r)) }));
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= draft.rounds.length) return;
    setDraft((d) => {
      const rounds = [...d.rounds];
      [rounds[index], rounds[target]] = [rounds[target]!, rounds[index]!];
      return { ...d, rounds };
    });
    setActive(target);
  }

  async function submit() {
    setNotice(null);
    const input: ScriptInput = draft;
    const found = issuesByPath(input);
    setErrors(found);
    if (found.size > 0) {
      setNotice({
        tone: 'error',
        text:
          found.get('name') ?? found.get('rounds') ?? 'Kiểm tra lại các thông số được đánh dấu.',
      });
      return;
    }
    try {
      const saved = await save.mutateAsync(input);
      setNotice({ tone: 'success', text: 'Đã lưu kịch bản.' });
      if (!script) await navigate(`/kich-ban/${saved.id}`, { replace: true });
    } catch (error) {
      setNotice({ tone: 'error', text: errorMessage(error) });
    }
  }

  async function saveAsTemplate() {
    if (!script) return;
    setNotice(null);
    try {
      const copy = await duplicate.mutateAsync({ id: script.id });
      await navigate(`/kich-ban/${copy.id}`);
      setNotice({ tone: 'success', text: `Đã tạo “${copy.name}” từ kịch bản đã lưu.` });
    } catch (error) {
      setNotice({ tone: 'error', text: errorMessage(error) });
    }
  }

  const current = draft.rounds[active];
  const used = new Set<RoundKey>(draft.rounds.map((r) => r.type));

  return (
    <div className="min-h-dvh bg-canvas text-slate-900">
      <header className="bg-stage-900 text-white">
        <div className="mx-auto flex min-h-16 max-w-[1280px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <Link to="/" className="hover:no-underline" aria-label="Olympia Online – trang chủ">
            <Wordmark className="text-xl" />
          </Link>
          <Link
            to="/kich-ban"
            className="inline-flex items-center gap-1.5 text-sm text-stage-200 no-underline hover:text-white"
          >
            <ChevronLeftIcon size={16} />
            Kịch bản
          </Link>
          <div className="ml-auto flex flex-wrap gap-2.5">
            {script && (
              <button
                type="button"
                disabled={duplicate.isPending}
                onClick={() => void saveAsTemplate()}
                title="Tạo một kịch bản mới từ bản đã lưu"
                className="h-10 rounded-lg border border-stage-700 px-4 text-sm font-semibold hover:bg-white/5 disabled:opacity-50"
              >
                Lưu thành mẫu
              </button>
            )}
            <button
              type="button"
              disabled={save.isPending}
              onClick={() => void submit()}
              className="h-10 rounded-lg bg-accent-400 px-[18px] text-sm font-bold text-stage-900 hover:bg-accent-500 disabled:opacity-60"
            >
              {save.isPending ? 'Đang lưu…' : 'Lưu kịch bản'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-[1280px] flex-col gap-5 px-4 pb-12 pt-7 sm:px-6">
        <h1 className="sr-only">{script ? `Sửa kịch bản ${script.name}` : 'Tạo kịch bản'}</h1>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-1.5">
            <label htmlFor="script-name" className="text-sm font-semibold">
              Tên kịch bản
            </label>
            <input
              id="script-name"
              value={draft.name}
              maxLength={100}
              onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))}
              placeholder="Ví dụ: Khởi động – Toán 11"
              aria-invalid={errors.has('name') ? true : undefined}
              className={`h-11 rounded-lg bg-white px-3.5 text-base font-semibold ${
                errors.has('name') ? 'border-2 border-orange-700' : 'border border-slate-300'
              }`}
            />
            {errors.get('name') && (
              <p className="text-[13px] text-orange-800">{errors.get('name')}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="script-break" className="text-sm font-semibold">
              Nghỉ giữa vòng
            </label>
            <select
              id="script-break"
              value={draft.settings.breakSeconds}
              onChange={(event) =>
                setDraft((d) => ({
                  ...d,
                  settings: { ...d.settings, breakSeconds: Number(event.target.value) },
                }))
              }
              className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-[15px]"
            >
              {BREAK_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value === 0 ? 'Không nghỉ' : `${value} giây`}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="script-disconnect" className="text-sm font-semibold">
              Người đến lượt mất kết nối
            </label>
            <select
              id="script-disconnect"
              value={draft.settings.onTurnDisconnect}
              onChange={(event) =>
                setDraft((d) => ({
                  ...d,
                  settings: {
                    ...d.settings,
                    onTurnDisconnect: event.target.value as 'pause' | 'skip',
                  },
                }))
              }
              className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-[15px]"
            >
              <option value="pause">Tạm dừng trận</option>
              <option value="skip">Tính là bỏ qua</option>
            </select>
          </div>
          <Toggle
            label="Hiệu ứng âm thanh"
            checked={draft.settings.soundEffects}
            onChange={(v) =>
              setDraft((d) => ({ ...d, settings: { ...d.settings, soundEffects: v } }))
            }
          />
          <Toggle
            label="Cho phép điểm âm"
            checked={draft.settings.allowNegativeScore}
            onChange={(v) =>
              setDraft((d) => ({ ...d, settings: { ...d.settings, allowNegativeScore: v } }))
            }
          />
          <Toggle
            label="Câu hỏi phụ khi hòa điểm"
            checked={draft.settings.tiebreakEnabled}
            onChange={(v) =>
              setDraft((d) => ({ ...d, settings: { ...d.settings, tiebreakEnabled: v } }))
            }
          />
        </div>
        <details className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold">
            Chế độ tự động: thời gian hiển thị câu hỏi và đáp án
          </summary>
          <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
            <NumberField
              label="Hiển thị câu hỏi trước khi tính giờ"
              suffix="giây"
              value={draft.settings.autoReadSeconds}
              onChange={(v) =>
                setDraft((d) => ({ ...d, settings: { ...d.settings, autoReadSeconds: v } }))
              }
              error={errors.get('settings.autoReadSeconds')}
            />
            <NumberField
              label="Hiển thị đáp án trước khi chuyển câu"
              suffix="giây"
              value={draft.settings.autoRevealSeconds}
              onChange={(v) =>
                setDraft((d) => ({ ...d, settings: { ...d.settings, autoRevealSeconds: v } }))
              }
              error={errors.get('settings.autoRevealSeconds')}
            />
          </div>
          <p className="mt-2 text-[13px] text-slate-600">
            Áp dụng khi phòng chọn “Tự động theo kịch bản”. Câu cần chấm thủ công (trả lời ngắn
            không khớp, đáp án chướng ngại vật, trả lời bằng lời) luôn chờ Host xác nhận.
          </p>
        </details>

        {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
        {unchanged && savedIssues.length > 0 && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-800"
          >
            <AlertTriangleIcon className="mt-0.5 shrink-0" />
            <span>Chưa thể bắt đầu trận: {savedIssues.join(' ')}</span>
          </div>
        )}

        <div className="flex flex-wrap items-start gap-6">
          <section
            aria-labelledby="rounds-heading"
            className="flex min-w-0 flex-[1_1_340px] flex-col gap-2.5"
          >
            <h2 id="rounds-heading" className="mb-1 text-base font-bold">
              Thứ tự vòng thi
            </h2>
            <ol className="flex flex-col gap-2.5">
              {draft.rounds.map((round, index) => {
                const selected = index === active;
                return (
                  <li
                    key={round.type}
                    className={`flex items-center gap-3 rounded-[14px] p-3.5 ${
                      selected
                        ? 'border-2 border-accent-400 bg-stage-900 text-white'
                        : 'border border-slate-200 bg-white'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setActive(index)}
                      aria-current={selected ? 'step' : undefined}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span
                        className={`flex size-8 shrink-0 items-center justify-center rounded-lg font-extrabold ${
                          selected ? 'bg-accent-400 text-stage-900' : 'bg-brand-50 text-brand-700'
                        }`}
                      >
                        {index + 1}
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-[15px] font-bold">{ROUND_TITLES[round.type]}</span>
                        <span className="text-[13px] opacity-85">{roundSummary(round)}</span>
                      </span>
                    </button>
                    <span className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        aria-label={`Đưa ${ROUND_TITLES[round.type]} lên`}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                        className="flex h-[22px] w-8 items-center justify-center rounded-md disabled:opacity-30"
                      >
                        <ChevronUpIcon size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Đưa ${ROUND_TITLES[round.type]} xuống`}
                        disabled={index === draft.rounds.length - 1}
                        onClick={() => move(index, 1)}
                        className="flex h-[22px] w-8 items-center justify-center rounded-md disabled:opacity-30"
                      >
                        <ChevronDownIcon size={14} />
                      </button>
                    </span>
                  </li>
                );
              })}
            </ol>
            <ActionMenu
              label="Thêm vòng"
              className="w-full"
              trigger={
                <span className="inline-flex items-center gap-1.5 text-brand-600">
                  <PlusIcon size={16} />
                  Thêm vòng
                </span>
              }
              items={ROUND_KEYS.map((key: RoundKey) => {
                const playable = (PLAYABLE_ROUNDS as readonly string[]).includes(key);
                return {
                  label: `${ROUND_TITLES[key]}${playable ? (used.has(key) ? ' (đã có)' : '') : ' – sắp có'}`,
                  disabled: !playable || used.has(key),
                  onSelect: () => {
                    setDraft((d) => ({ ...d, rounds: [...d.rounds, newRound(key)] }));
                    setActive(draft.rounds.length);
                  },
                };
              })}
            />
            {errors.get('rounds') && (
              <p className="text-[13px] text-orange-800">{errors.get('rounds')}</p>
            )}
          </section>

          <section
            aria-labelledby="round-config-heading"
            className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
          >
            {current ? (
              <>
                <RoundConfig
                  round={current}
                  index={active}
                  errors={errors}
                  onChange={(round) => setRound(active, round)}
                  sourceInfo={
                    sameSource(savedSources.get(current.type)?.source ?? null, current.source)
                      ? savedSources.get(current.type)?.info
                      : undefined
                  }
                />
                <div className="flex justify-end border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setDraft((d) => ({ ...d, rounds: d.rounds.filter((_, i) => i !== active) }));
                      setActive(0);
                    }}
                    className="h-10 rounded-lg px-3 text-sm font-semibold text-red-700 hover:bg-red-50"
                  >
                    Bỏ vòng này khỏi kịch bản
                  </button>
                </div>
              </>
            ) : (
              <p id="round-config-heading" className="py-8 text-center text-slate-600">
                Kịch bản chưa có vòng thi. Bấm “Thêm vòng” để bắt đầu.
              </p>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

/** Tạo (`/kich-ban/moi`) hoặc sửa (`/kich-ban/:scriptId`) kịch bản, theo màn ScriptBuilder. */
export function ScriptBuilderPage() {
  const { scriptId } = useParams();
  const script = useScript(scriptId);

  if (scriptId && script.isPending) {
    return (
      <div className="min-h-dvh bg-canvas p-8">
        <Spinner />
      </div>
    );
  }
  if (scriptId && script.isError) {
    return (
      <div className="min-h-dvh bg-canvas p-8">
        <Alert tone="error">{errorMessage(script.error)}</Alert>
      </div>
    );
  }
  return <Builder key={script.data?.id ?? 'new'} script={script.data} />;
}
