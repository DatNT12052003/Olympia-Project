import { z } from 'zod';

/**
 * Video call và voice chat (đặc tả mục 11, DL-014, DL-019): audio/video đi qua SFU LiveKit, độc
 * lập với kênh trạng thái trận (BR-AV-02). Backend cấp token theo vai trò trong phòng và áp quyền
 * phát của Host (khóa mic/cam, chỉ người đến lượt được nói, tắt tiếng toàn phòng, DL-046).
 */

export const AvErrorCode = {
  /** Máy chủ video tạm thời không dùng được; trận đấu vẫn tiếp tục (BR-AV-02). */
  Unavailable: 'AV_UNAVAILABLE',
} as const;

/** Token kết nối LiveKit của người xem hiện tại. */
export const avTokenResponseSchema = z.object({
  /** URL WebSocket của LiveKit cho trình duyệt. */
  url: z.string().min(1),
  token: z.string().min(1),
  /** Danh tính trong phòng LiveKit (`u:<userId>` / `g:<guestId>`). */
  identity: z.string(),
  /** Được phát camera/micro hay chỉ xem/nghe (khán giả, BR-AV-04). */
  canPublish: z.boolean(),
});
export type AvTokenResponse = z.infer<typeof avTokenResponseSchema>;

/** Metadata gắn với người tham gia LiveKit, để client ghép video với ghế trong phòng. */
export const avParticipantMetadataSchema = z.object({
  role: z.enum(['host', 'player', 'spectator', 'monitor']),
  /** Id người tham gia phòng (`null` với Host). */
  participantId: z.uuid().nullable(),
});
export type AvParticipantMetadata = z.infer<typeof avParticipantMetadataSchema>;

/** Host khóa mic/cam của một Player (Player không tự bật lại được, 11.2). */
export const avLockSchema = z.object({ mic: z.boolean(), cam: z.boolean() });
export type AvLock = z.infer<typeof avLockSchema>;

/** Chính sách âm thanh/hình ảnh của phòng do Host đặt. */
export const avPolicySchema = z.object({
  /** Tắt tiếng toàn phòng: khóa mic mọi Player tới khi Host mở lại. */
  muteAll: z.boolean(),
  /** Chỉ Player đang đến lượt/đang trả lời được nói (khi trận đang diễn ra). */
  turnOnly: z.boolean(),
  /** Khóa theo id người tham gia. */
  locks: z.record(z.string(), avLockSchema),
});
export type AvPolicy = z.infer<typeof avPolicySchema>;

export const DEFAULT_AV_POLICY: AvPolicy = { muteAll: false, turnOnly: false, locks: {} };

export const updateAvPolicyRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('mute_all'), value: z.boolean() }),
  z.object({ type: z.literal('turn_only'), value: z.boolean() }),
  z.object({
    type: z.literal('lock'),
    participantId: z.uuid(),
    mic: z.boolean().optional(),
    cam: z.boolean().optional(),
  }),
]);
export type UpdateAvPolicyRequest = z.infer<typeof updateAvPolicyRequestSchema>;

export const avPolicyResponseSchema = z.object({ policy: avPolicySchema });

/** Nguồn được phép phát của một Player theo chính sách (dùng ở server và để hiển thị). */
export function allowedSources(input: {
  policy: AvPolicy;
  participantId: string;
  /** Trận đang diễn ra và người này không phải người đến lượt (khi bật "chỉ người đến lượt"). */
  outOfTurn: boolean;
}): { camera: boolean; microphone: boolean } {
  const lock = input.policy.locks[input.participantId];
  return {
    camera: !lock?.cam,
    microphone: !lock?.mic && !input.policy.muteAll && !(input.policy.turnOnly && input.outOfTurn),
  };
}
