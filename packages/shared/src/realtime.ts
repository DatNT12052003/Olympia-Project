/**
 * Hợp đồng sự kiện realtime giữa client và server (Socket.IO).
 * Tên sự kiện dùng dạng `<miền>:<hành động>`.
 */

export interface ServerTimeAck {
  /** Thời điểm server (epoch ms), dùng để client hiệu chỉnh độ lệch đồng hồ (BR-RT-02). */
  serverTime: number;
}

export interface ClientToServerEvents {
  'system:ping': (ack: (response: ServerTimeAck) => void) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- sự kiện server → client được bổ sung từ P3
export interface ServerToClientEvents {}

/** Lỗi trả về khi handshake bị từ chối (đọc qua `connect_error.message`). */
export const RealtimeConnectError = {
  Unauthenticated: 'UNAUTHENTICATED',
} as const;
