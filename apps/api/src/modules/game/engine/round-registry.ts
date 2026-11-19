import type { RoundType } from '@olympia/shared';
import { warmupPlugin } from '../rounds/warmup.plugin';
import type { RoundPlugin } from './round-plugin';

/** Plugin của các loại vòng đã hỗ trợ (DL-012). P5 đăng ký thêm ba vòng còn lại ở đây. */
const plugins: Partial<Record<RoundType, RoundPlugin>> = {
  warmup: warmupPlugin,
};

export function roundPlugin(type: RoundType): RoundPlugin {
  const plugin = plugins[type];
  if (!plugin) throw new Error(`Chưa có plugin cho vòng ${type}`);
  return plugin;
}

export function isPlayableRound(type: string): type is RoundType {
  return type in plugins;
}
