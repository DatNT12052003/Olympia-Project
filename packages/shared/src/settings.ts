import { z } from 'zod';
import { type MediaKind, MEDIA_RULES } from './questions.js';

/**
 * Cấu hình hệ thống do Super Admin sửa trên web (mục 15.1, DL-049). Giá trị mặc định lấy từ biến
 * môi trường; giá trị đã lưu áp dụng ngay, không cần khởi động lại.
 */

/** Các reaction Super Admin chọn được (BR-SPEC-02); mặc định bật 4 cái đầu (mục 13). */
export const REACTION_PALETTE = ['👍', '❤️', '😂', '🔥', '👏', '😮', '🎉', '💯'] as const;
export type Reaction = (typeof REACTION_PALETTE)[number];

const MB = 1024 * 1024;

const int = (min: number, max: number, unit: string) =>
  z
    .number()
    .int('Cần là số nguyên.')
    .min(min, `Tối thiểu ${min} ${unit}.`)
    .max(max, `Tối đa ${max} ${unit}.`);

export const systemSettingsSchema = z.object({
  /** Số phòng đang mở cùng lúc của một Host (DL-031). */
  maxActiveRoomsPerHost: int(1, 100, 'phòng'),
  /** Số khán giả tối đa mỗi phòng. */
  maxSpectatorsPerRoom: int(1, 2000, 'khán giả'),
  /** Giữ chỗ khi mất kết nối (BR-RC-01). */
  reconnectGraceSeconds: int(10, 1800, 'giây'),
  /** Phòng mở không hoạt động thì tự đóng (BR-ROOM-02). */
  roomIdleMinutes: int(5, 1440, 'phút'),
  /** Host mất kết nối quá thời gian này thì trận kết thúc bất thường (4.5). */
  hostReconnectMinutes: int(1, 120, 'phút'),
  /** Dung lượng tối đa của media câu hỏi (BR-QB-02). */
  imageMaxMb: int(1, 20, 'MB'),
  videoMaxMb: int(1, 200, 'MB'),
  audioMaxMb: int(1, 200, 'MB'),
  /** Reaction được bật (mục 13). */
  reactions: z
    .array(z.enum(REACTION_PALETTE))
    .min(1, 'Cần bật ít nhất một reaction.')
    .refine((list) => new Set(list).size === list.length, 'Reaction bị trùng.'),
});
export type SystemSettings = z.infer<typeof systemSettingsSchema>;

export const updateSystemSettingsSchema = systemSettingsSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Cần ít nhất một thay đổi.');
export type UpdateSystemSettings = z.input<typeof updateSystemSettingsSchema>;

export const systemSettingsResponseSchema = z.object({
  settings: systemSettingsSchema,
  /** Giá trị mặc định (biến môi trường) để hiển thị "khôi phục mặc định". */
  defaults: systemSettingsSchema,
  updatedAt: z.iso.datetime().nullable(),
});
export type SystemSettingsResponse = z.infer<typeof systemSettingsResponseSchema>;

/** Cấu hình mà giao diện cần biết (không cần đăng nhập). */
export const publicSettingsSchema = z.object({
  reactions: z.array(z.enum(REACTION_PALETTE)),
  mediaMaxBytes: z.object({
    image: z.number().int(),
    video: z.number().int(),
    audio: z.number().int(),
  }),
});
export type PublicSettings = z.infer<typeof publicSettingsSchema>;

/** Dung lượng media tối đa theo cấu hình. */
export function mediaMaxBytes(
  settings: Pick<SystemSettings, 'imageMaxMb' | 'videoMaxMb' | 'audioMaxMb'>,
): Record<MediaKind, number> {
  return {
    image: settings.imageMaxMb * MB,
    video: settings.videoMaxMb * MB,
    audio: settings.audioMaxMb * MB,
  };
}

/** Giá trị mặc định khi chưa có biến môi trường tương ứng. */
export const DEFAULT_MEDIA_MAX_MB = {
  imageMaxMb: MEDIA_RULES.image.maxBytes / MB,
  videoMaxMb: MEDIA_RULES.video.maxBytes / MB,
  audioMaxMb: MEDIA_RULES.audio.maxBytes / MB,
} as const;

export const DEFAULT_REACTIONS: Reaction[] = ['👍', '❤️', '😂', '🔥'];
