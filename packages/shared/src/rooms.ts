import { z } from 'zod';
import { displayNameSchema, guestSessionResponseSchema } from './auth.js';

/** Hợp đồng REST và trạng thái realtime của phòng thi (đặc tả mục 4, 10, 12, 13). */

export const RoomErrorCode = {
  RoomNotOpen: 'ROOM_NOT_OPEN',
  RoomFull: 'ROOM_FULL',
  SpectatorsFull: 'SPECTATORS_FULL',
  SpectatorsNotAllowed: 'SPECTATORS_NOT_ALLOWED',
  GuestsNotAllowed: 'GUESTS_NOT_ALLOWED',
  WrongRoomPassword: 'WRONG_ROOM_PASSWORD',
  Banned: 'BANNED_FROM_ROOM',
  DisplayNameTaken: 'DISPLAY_NAME_TAKEN',
  HostCannotJoin: 'HOST_CANNOT_JOIN',
  RoomLimitReached: 'ROOM_LIMIT_REACHED',
  InvalidRoomState: 'INVALID_ROOM_STATE',
  NotInRoom: 'NOT_IN_ROOM',
  SeatUnavailable: 'SEAT_UNAVAILABLE',
} as const;

export const ROOM_CODE_LENGTH = 6;
/** Bỏ ký tự dễ nhầm: 0/O, 1/I/L (DL-027). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
/** Reaction được phép (mục 13). */
export const REACTIONS = ['👍', '❤️', '😂', '🔥'] as const;

export const roomStatusSchema = z.enum(['draft', 'open', 'in_match', 'closed']);
export const roomVisibilitySchema = z.enum(['public', 'private']);
export const controlModeSchema = z.enum(['manual', 'auto']);
export const participantRoleSchema = z.enum(['player', 'spectator']);
export const participantStatusSchema = z.enum(['pending', 'approved']);
export const connectionStatusSchema = z.enum(['online', 'disconnected', 'offline']);

export type RoomStatus = z.infer<typeof roomStatusSchema>;
export type RoomVisibility = z.infer<typeof roomVisibilitySchema>;
export type ControlMode = z.infer<typeof controlModeSchema>;
export type ParticipantRole = z.infer<typeof participantRoleSchema>;
export type ConnectionStatus = z.infer<typeof connectionStatusSchema>;

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`),
    `Mã phòng gồm ${ROOM_CODE_LENGTH} ký tự chữ và số.`,
  );

const roomNameSchema = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, ' '))
  .pipe(z.string().min(3, 'Tên phòng tối thiểu 3 ký tự.').max(100, 'Tên phòng tối đa 100 ký tự.'));

const roomPasswordSchema = z
  .string()
  .min(4, 'Mật khẩu phòng tối thiểu 4 ký tự.')
  .max(64, 'Mật khẩu phòng tối đa 64 ký tự.');

const roomConfigShape = {
  name: roomNameSchema,
  description: z
    .string()
    .trim()
    .max(500, 'Mô tả tối đa 500 ký tự.')
    .transform((value) => (value.length > 0 ? value : null))
    .nullable(),
  maxPlayers: z.number().int().min(MIN_PLAYERS).max(MAX_PLAYERS),
  visibility: roomVisibilitySchema,
  /** Chỉ cho phòng riêng tư; `null` để bỏ mật khẩu. */
  password: roomPasswordSchema.nullable(),
  allowSpectators: z.boolean(),
  maxSpectators: z.number().int().min(1, 'Tối thiểu 1 khán giả.'),
  allowGuests: z.boolean(),
  autoApprove: z.boolean(),
  controlMode: controlModeSchema,
  reactionsEnabled: z.boolean(),
};

export const createRoomRequestSchema = z
  .object({
    ...roomConfigShape,
    description: roomConfigShape.description.optional().default(null),
    password: roomConfigShape.password.optional().default(null),
    allowSpectators: z.boolean().default(true),
    maxSpectators: roomConfigShape.maxSpectators.default(50),
    allowGuests: z.boolean().default(true),
    autoApprove: z.boolean().default(false),
    controlMode: controlModeSchema.default('manual'),
    reactionsEnabled: z.boolean().default(true),
    /** `true`: tạo và mở sảnh chờ luôn; `false`: lưu nháp. */
    open: z.boolean().default(false),
  })
  .refine((room) => room.visibility === 'private' || room.password === null, {
    path: ['password'],
    message: 'Chỉ phòng riêng tư mới đặt mật khẩu.',
  });

export const updateRoomRequestSchema = z
  .object(roomConfigShape)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Cần ít nhất một thay đổi.');

export type CreateRoomRequest = z.input<typeof createRoomRequestSchema>;
export type UpdateRoomRequest = z.input<typeof updateRoomRequestSchema>;

/** Phòng nhìn từ phía Host (danh sách và cấu hình). */
export const hostRoomSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  maxPlayers: z.number().int(),
  visibility: roomVisibilitySchema,
  hasPassword: z.boolean(),
  allowSpectators: z.boolean(),
  maxSpectators: z.number().int(),
  allowGuests: z.boolean(),
  autoApprove: z.boolean(),
  controlMode: controlModeSchema,
  reactionsEnabled: z.boolean(),
  status: roomStatusSchema,
  code: z.string().nullable(),
  playerCount: z.number().int(),
  spectatorCount: z.number().int(),
  createdAt: z.iso.datetime(),
  openedAt: z.iso.datetime().nullable(),
});
export type HostRoom = z.infer<typeof hostRoomSchema>;

export const hostRoomListSchema = z.object({
  items: z.array(hostRoomSchema),
  /** Số phòng đang mở/đang thi và giới hạn (BR-ROOM-03). */
  activeCount: z.number().int(),
  activeLimit: z.number().int(),
});
export type HostRoomList = z.infer<typeof hostRoomListSchema>;

/** Thông tin công khai khi tra mã phòng hoặc xem danh sách phòng công khai. */
export const roomPreviewSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  hostName: z.string(),
  status: roomStatusSchema,
  visibility: roomVisibilitySchema,
  requiresPassword: z.boolean(),
  allowGuests: z.boolean(),
  allowSpectators: z.boolean(),
  players: z.object({ taken: z.number().int(), total: z.number().int() }),
  spectators: z.object({ taken: z.number().int(), total: z.number().int() }),
});
export type RoomPreview = z.infer<typeof roomPreviewSchema>;

export const publicRoomListSchema = z.object({ items: z.array(roomPreviewSchema) });

export const joinRoomRequestSchema = z.object({
  role: participantRoleSchema,
  password: z.string().max(64).optional(),
  /** Bắt buộc với khách; tài khoản có thể đổi tên trong phòng nếu bị trùng (BR-AUTH-04). */
  displayName: displayNameSchema.optional(),
});
export type JoinRoomRequest = z.input<typeof joinRoomRequestSchema>;

export const participantViewSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  kind: z.enum(['user', 'guest']),
  role: participantRoleSchema,
  status: participantStatusSchema,
  seat: z.number().int().min(1).max(MAX_PLAYERS).nullable(),
  ready: z.boolean(),
  connection: connectionStatusSchema,
  /** Thời điểm mất kết nối (để hiển thị đếm ngược giữ chỗ). */
  disconnectedAt: z.iso.datetime().nullable(),
});
export type ParticipantView = z.infer<typeof participantViewSchema>;

export const joinRoomResponseSchema = z.object({
  participant: participantViewSchema,
  /** Có khi người vào là khách: phiên khách mới gắn với phòng (DL-028). */
  guestSession: guestSessionResponseSchema.optional(),
});
export type JoinRoomResponse = z.infer<typeof joinRoomResponseSchema>;

export const assignSeatRequestSchema = z.object({
  seat: z.number().int().min(1).max(MAX_PLAYERS).nullable(),
});
export const changeRoleRequestSchema = z.object({ role: participantRoleSchema });
export const readyRequestSchema = z.object({ ready: z.boolean() });

/** Trạng thái phòng đẩy qua realtime (DL-026). */
export const roomStateSchema = z.object({
  /** Tăng dần; client bỏ qua bản cũ hơn (BR-RT-03). */
  version: z.number().int(),
  audience: z.enum(['host', 'member']),
  room: z.object({
    id: z.uuid(),
    name: z.string(),
    code: z.string().nullable(),
    status: roomStatusSchema,
    visibility: roomVisibilitySchema,
    controlMode: controlModeSchema,
    maxPlayers: z.number().int(),
    allowSpectators: z.boolean(),
    maxSpectators: z.number().int(),
    reactionsEnabled: z.boolean(),
  }),
  host: z.object({ displayName: z.string(), connection: connectionStatusSchema }),
  /** Người chơi đã được duyệt (có hoặc chưa có ghế). */
  players: z.array(participantViewSchema),
  /** Chỉ có trong bản cho Host. */
  pending: z.array(participantViewSchema),
  spectators: z.object({
    count: z.number().int(),
    /** Host thấy toàn bộ; người khác thấy tối đa 20 người. */
    items: z.array(participantViewSchema),
  }),
  /** Thời gian giữ chỗ khi mất kết nối (giây). */
  reconnectGraceSeconds: z.number().int(),
});
export type RoomState = z.infer<typeof roomStateSchema>;

export const roomRemovedReasonSchema = z.enum([
  'kicked',
  'banned',
  'rejected',
  'closed',
  'replaced',
  'left',
  'timeout',
]);
export type RoomRemovedReason = z.infer<typeof roomRemovedReasonSchema>;
