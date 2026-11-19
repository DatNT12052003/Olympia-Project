import type { HostCommand, MatchView, PlayerAnswer } from './match.js';
import type { RoomRemovedReason, RoomState } from './rooms.js';

/**
 * Hợp đồng sự kiện realtime giữa client và server (Socket.IO).
 * Tên sự kiện dùng dạng `<miền>:<hành động>`.
 */

export interface ServerTimeAck {
  /** Thời điểm server (epoch ms), dùng để client hiệu chỉnh độ lệch đồng hồ (BR-RT-02). */
  serverTime: number;
}

/** Kết quả ack chung: thành công kèm dữ liệu, hoặc lỗi theo mã giống REST. */
export type Ack<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: { code: string; message: string } };

export interface RoomReaction {
  roomId: string;
  emoji: string;
  from: { displayName: string; seat: number | null };
}

export interface ClientToServerEvents {
  'system:ping': (ack: (response: ServerTimeAck) => void) => void;
  /** Theo dõi phòng: nhận ngay trạng thái hiện tại; đánh dấu online (BR-RC-02, BR-RC-05). */
  'room:subscribe': (payload: { roomId: string }, ack: (result: Ack<RoomState>) => void) => void;
  'room:unsubscribe': (payload: { roomId: string }) => void;
  'reaction:send': (payload: { roomId: string; emoji: string }, ack: (result: Ack) => void) => void;
  /** Trạng thái trận hiện tại của phòng (`null` khi không có trận), dùng khi kết nối lại (BR-RC-02). */
  'match:sync': (payload: { roomId: string }, ack: (result: Ack<MatchView | null>) => void) => void;
  /** Lệnh của Host (8.3); `actionId` chống gửi trùng (BR-GAME-03). */
  'match:command': (
    payload: { roomId: string; actionId: string; command: HostCommand },
    ack: (result: Ack) => void,
  ) => void;
  /** Player gửi đáp án; server ghi thời điểm nhận (BR-R3-01). */
  'match:answer': (
    payload: { roomId: string; actionId: string; questionRef: string; answer: PlayerAnswer },
    ack: (result: Ack<{ elapsedMs: number }>) => void,
  ) => void;
  /** Player bấm chuông; `won` cho biết có giành được quyền trả lời không. */
  'match:buzz': (
    payload: { roomId: string; actionId: string; questionRef: string },
    ack: (result: Ack<{ won: boolean }>) => void,
  ) => void;
}

export interface ServerToClientEvents {
  'room:state': (state: RoomState) => void;
  /** Người dùng không còn ở trong phòng (bị kick/ban, phòng đóng, kết nối khác thay thế...). */
  'room:removed': (payload: { roomId: string; reason: RoomRemovedReason }) => void;
  'room:reaction': (reaction: RoomReaction) => void;
  /** Trạng thái trận theo đối tượng xem (BR-RT-01). */
  'match:state': (state: MatchView) => void;
}

/** Lỗi trả về khi handshake bị từ chối (đọc qua `connect_error.message`). */
export const RealtimeConnectError = {
  Unauthenticated: 'UNAUTHENTICATED',
} as const;
