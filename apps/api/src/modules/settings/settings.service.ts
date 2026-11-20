import {
  DEFAULT_MEDIA_MAX_MB,
  DEFAULT_REACTIONS,
  mediaMaxBytes,
  type PublicSettings,
  type SystemSettings,
  type SystemSettingsResponse,
  systemSettingsSchema,
  type updateSystemSettingsSchema,
} from '@olympia/shared';
import type { Logger } from 'pino';
import type { DataSource } from 'typeorm';
import type { z } from 'zod';
import type { UserPrincipal } from '../../shared/auth/principal';
import { ForbiddenError } from '../../shared/errors/app-error';
import { writeAuditLog } from '../audit/audit-log';
import { SystemSettingEntity } from './system-setting.entity';

export interface SettingsServiceDeps {
  dataSource: DataSource;
  /** Giá trị mặc định (biến môi trường). */
  defaults: SystemSettings;
  logger: Logger;
  /** Chu kỳ nạp lại từ DB để các instance khác nhận thay đổi (mặc định 15 giây). */
  refreshMs?: number;
}

type SettingKey = keyof SystemSettings;
const KEYS = Object.keys(systemSettingsSchema.shape) as SettingKey[];

/**
 * Cấu hình hệ thống (mục 15.1, DL-049). Giá trị giữ trong bộ nhớ để đọc đồng bộ (giới hạn phòng,
 * thời gian chờ, media, reaction); instance sửa áp dụng ngay, instance khác nạp lại theo chu kỳ.
 */
export function createSettingsService(deps: SettingsServiceDeps) {
  const { dataSource, defaults, logger } = deps;
  let current: SystemSettings = { ...defaults };
  let updatedAt: Date | null = null;
  let timer: NodeJS.Timeout | undefined;

  /** Gộp giá trị đã lưu với mặc định; giá trị không hợp lệ (đổi luật) bị bỏ qua. */
  function merge(rows: SystemSettingEntity[]): SystemSettings {
    const next: Record<string, unknown> = { ...defaults };
    for (const row of rows) {
      const key = row.key as SettingKey;
      if (!KEYS.includes(key)) continue;
      const parsed = systemSettingsSchema.shape[key].safeParse(row.value);
      if (parsed.success) next[key] = parsed.data;
    }
    return next as SystemSettings;
  }

  async function load(): Promise<void> {
    const rows = await dataSource.getRepository(SystemSettingEntity).find();
    current = merge(rows);
    updatedAt = rows.reduce<Date | null>(
      (latest, row) => (!latest || row.updatedAt > latest ? row.updatedAt : latest),
      null,
    );
  }

  function response(): SystemSettingsResponse {
    return {
      settings: current,
      defaults,
      updatedAt: updatedAt?.toISOString() ?? null,
    };
  }

  return {
    load,

    start() {
      timer ??= setInterval(() => {
        load().catch((error: unknown) => {
          logger.error({ err: error }, 'Không nạp lại được cấu hình hệ thống');
        });
      }, deps.refreshMs ?? 15_000);
      timer.unref();
    },

    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
    },

    /** Cấu hình hiện tại (đọc đồng bộ). */
    get(): SystemSettings {
      return current;
    },

    publicSettings(): PublicSettings {
      return { reactions: current.reactions, mediaMaxBytes: mediaMaxBytes(current) };
    },

    async getForAdmin(actor: UserPrincipal): Promise<SystemSettingsResponse> {
      if (actor.systemRole !== 'super_admin') throw new ForbiddenError();
      await load();
      return response();
    },

    async update(
      actor: UserPrincipal,
      patch: z.output<typeof updateSystemSettingsSchema>,
    ): Promise<SystemSettingsResponse> {
      if (actor.systemRole !== 'super_admin') throw new ForbiddenError();
      const at = new Date();
      await dataSource.transaction(async (manager) => {
        const before = merge(await manager.find(SystemSettingEntity));
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        for (const key of KEYS) {
          const value = patch[key];
          if (value === undefined) continue;
          if (JSON.stringify(before[key]) === JSON.stringify(value)) continue;
          changes[key] = { from: before[key], to: value };
          await manager.upsert(
            SystemSettingEntity,
            { key, value: value as object, updatedAt: at, updatedBy: actor.userId },
            ['key'],
          );
        }
        if (Object.keys(changes).length > 0) {
          await writeAuditLog(manager, {
            actorUserId: actor.userId,
            action: 'system.settings_update',
            targetType: 'system_settings',
            targetId: null,
            details: changes,
          });
        }
      });
      await load();
      return response();
    },
  };
}

export type SettingsService = ReturnType<typeof createSettingsService>;

/** Giá trị mặc định của cấu hình hệ thống lấy từ biến môi trường. */
export function defaultSettingsFromEnv(env: {
  MAX_ACTIVE_ROOMS_PER_HOST: number;
  MAX_SPECTATORS_PER_ROOM: number;
  RECONNECT_GRACE_SECONDS: number;
  ROOM_IDLE_MINUTES: number;
  HOST_RECONNECT_MINUTES: number;
}): SystemSettings {
  return {
    maxActiveRoomsPerHost: env.MAX_ACTIVE_ROOMS_PER_HOST,
    maxSpectatorsPerRoom: env.MAX_SPECTATORS_PER_ROOM,
    reconnectGraceSeconds: env.RECONNECT_GRACE_SECONDS,
    roomIdleMinutes: env.ROOM_IDLE_MINUTES,
    hostReconnectMinutes: env.HOST_RECONNECT_MINUTES,
    ...DEFAULT_MEDIA_MAX_MB,
    reactions: [...DEFAULT_REACTIONS],
  };
}

/** Cấu hình phòng đọc động từ cấu hình hệ thống (Room Management đọc mỗi lần dùng). */
export function roomsConfigFrom(settings: Pick<SettingsService, 'get'>) {
  return {
    get maxActiveRoomsPerHost() {
      return settings.get().maxActiveRoomsPerHost;
    },
    get maxSpectatorsPerRoom() {
      return settings.get().maxSpectatorsPerRoom;
    },
    get reconnectGraceSeconds() {
      return settings.get().reconnectGraceSeconds;
    },
    get roomIdleMinutes() {
      return settings.get().roomIdleMinutes;
    },
  };
}
