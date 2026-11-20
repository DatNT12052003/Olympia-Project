import type { MatchRoundType } from '@olympia/shared';
import { accelerationPlugin } from '../rounds/acceleration.plugin';
import { finishPlugin } from '../rounds/finish.plugin';
import { obstaclePlugin } from '../rounds/obstacle.plugin';
import { tiebreakPlugin } from '../rounds/tiebreak.plugin';
import { warmupPlugin } from '../rounds/warmup.plugin';
import type { RoundPlugin } from './round-plugin';

/** Plugin của các loại vòng (DL-012). Thêm vòng/format mới chỉ cần đăng ký ở đây. */
const plugins: Record<MatchRoundType, RoundPlugin> = {
  warmup: warmupPlugin,
  obstacle: obstaclePlugin,
  acceleration: accelerationPlugin,
  finish: finishPlugin,
  tiebreak: tiebreakPlugin,
};

export function roundPlugin(type: MatchRoundType): RoundPlugin {
  const plugin = plugins[type];
  if (!plugin) throw new Error(`Chưa có plugin cho vòng ${type}`);
  return plugin;
}

export function isPlayableRound(type: string): type is MatchRoundType {
  return type in plugins;
}
