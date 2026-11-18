import type { RoomRemovedReason } from '@olympia/shared';

/**
 * Sự kiện phòng phát ra sau khi transaction đã commit. Module Room Management chỉ phát sự kiện;
 * tầng realtime quyết định gửi cho ai (DL-010, DL-026).
 */
export interface RoomEvents {
  /** Trạng thái phòng đổi: gửi lại bản trạng thái mới cho mọi người đang theo dõi. */
  stateChanged(roomId: string): void;
  /** Một người không còn ở trong phòng (khóa danh tính `u:`/`g:`). */
  removed(roomId: string, presenceKey: string, reason: RoomRemovedReason): void;
  /** Phòng đóng: mọi người bị đưa ra khỏi phòng. */
  closed(roomId: string): void;
}

export const noopRoomEvents: RoomEvents = {
  stateChanged: () => undefined,
  removed: () => undefined,
  closed: () => undefined,
};

/** Cho phép gắn bộ phát sự kiện sau khi realtime server được tạo. */
export function createRoomEventsRelay(): RoomEvents & { attach(target: RoomEvents): void } {
  let target: RoomEvents = noopRoomEvents;
  return {
    attach(next) {
      target = next;
    },
    stateChanged: (roomId) => target.stateChanged(roomId),
    removed: (roomId, key, reason) => target.removed(roomId, key, reason),
    closed: (roomId) => target.closed(roomId),
  };
}
