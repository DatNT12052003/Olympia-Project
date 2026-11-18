import type { Redis } from 'ioredis';

/**
 * Trạng thái kết nối của người trong phòng, lưu ở Redis (dùng chung giữa các instance).
 *
 * Mỗi phòng một hash: field là khóa danh tính (`u:<userId>` hoặc `g:<guestId>`), value là kết nối
 * hiện hành. Một danh tính chỉ có một kết nối hoạt động trong phòng (BR-RC-05).
 */

export interface PresenceEntry {
  socketId: string;
  status: 'online' | 'disconnected';
  /** Epoch ms của lần đổi trạng thái gần nhất. */
  since: number;
}

export interface PresenceStore {
  /** Đặt kết nối hiện hành; trả kết nối cũ (nếu có) để ngắt khi khác socket. */
  connect(
    roomId: string,
    key: string,
    socketId: string,
    now: number,
  ): Promise<PresenceEntry | null>;
  /** Đánh dấu mất kết nối nếu `socketId` vẫn là kết nối hiện hành. */
  disconnect(roomId: string, key: string, socketId: string, now: number): Promise<boolean>;
  remove(roomId: string, key: string): Promise<void>;
  clearRoom(roomId: string): Promise<void>;
  get(roomId: string): Promise<Map<string, PresenceEntry>>;
  /** Các phòng đang có dữ liệu kết nối (để quét hết thời gian giữ chỗ). */
  rooms(): Promise<string[]>;
  /** Khóa phân tán ngắn hạn; trả `true` nếu giành được. */
  tryLock(name: string, ttlMs: number): Promise<boolean>;
}

export function presenceKey(
  principal: { kind: 'user'; userId: string } | { kind: 'guest'; guestId: string },
): string {
  return principal.kind === 'user' ? `u:${principal.userId}` : `g:${principal.guestId}`;
}

const CONNECT_SCRIPT = `
local old = redis.call('HGET', KEYS[1], ARGV[1])
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
redis.call('SADD', KEYS[2], ARGV[3])
return old
`;

const DISCONNECT_SCRIPT = `
local current = redis.call('HGET', KEYS[1], ARGV[1])
if not current then return 0 end
local entry = cjson.decode(current)
if entry.socketId ~= ARGV[2] then return 0 end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
return 1
`;

const REMOVE_SCRIPT = `
redis.call('HDEL', KEYS[1], ARGV[1])
if redis.call('HLEN', KEYS[1]) == 0 then
  redis.call('DEL', KEYS[1])
  redis.call('SREM', KEYS[2], ARGV[2])
end
return 1
`;

function parseEntry(raw: string | null): PresenceEntry | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PresenceEntry;
  } catch {
    return null;
  }
}

/** `prefix` tách không gian khóa (mỗi bộ test một tiền tố riêng). */
export function createRedisPresenceStore(redis: Redis, prefix = 'olympia:'): PresenceStore {
  const roomKey = (roomId: string) => `${prefix}presence:${roomId}`;
  const roomsKey = `${prefix}presence:rooms`;

  return {
    async connect(roomId, key, socketId, now) {
      const entry: PresenceEntry = { socketId, status: 'online', since: now };
      const old = (await redis.eval(
        CONNECT_SCRIPT,
        2,
        roomKey(roomId),
        roomsKey,
        key,
        JSON.stringify(entry),
        roomId,
      )) as string | null;
      return parseEntry(old);
    },

    async disconnect(roomId, key, socketId, now) {
      const entry: PresenceEntry = { socketId, status: 'disconnected', since: now };
      const changed = await redis.eval(
        DISCONNECT_SCRIPT,
        1,
        roomKey(roomId),
        key,
        socketId,
        JSON.stringify(entry),
      );
      return changed === 1;
    },

    async remove(roomId, key) {
      await redis.eval(REMOVE_SCRIPT, 2, roomKey(roomId), roomsKey, key, roomId);
    },

    async clearRoom(roomId) {
      await redis.multi().del(roomKey(roomId)).srem(roomsKey, roomId).exec();
    },

    async get(roomId) {
      const raw = await redis.hgetall(roomKey(roomId));
      const result = new Map<string, PresenceEntry>();
      for (const [key, value] of Object.entries(raw)) {
        const entry = parseEntry(value);
        if (entry) result.set(key, entry);
      }
      return result;
    },

    rooms() {
      return redis.smembers(roomsKey);
    },

    async tryLock(name, ttlMs) {
      return (await redis.set(`${prefix}lock:${name}`, '1', 'PX', ttlMs, 'NX')) === 'OK';
    },
  };
}
