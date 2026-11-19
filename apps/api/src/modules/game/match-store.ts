import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { MatchState, ScriptSnapshot } from './engine/match-state';

/**
 * Trạng thái nóng của trận trong Redis (DL-013):
 * - `state`: bản trạng thái mới nhất (kèm version), ghi sau mỗi chuyển trạng thái;
 * - `snapshot`: kịch bản + câu hỏi đã chốt (bất biến);
 * - `lock`: mutex theo trận để mọi instance xử lý đầu vào tuần tự;
 * - `lease`: instance sở hữu trận (chạy đồng hồ dự phòng, kiểm tra Host quá hạn), có hạn và gia hạn;
 * - `act:<id>`: kết quả hành động đã xử lý, chống gửi trùng (BR-GAME-03).
 */

export interface StoredReply {
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string };
}

export interface MatchStore {
  getState(matchId: string): Promise<MatchState | null>;
  setState(state: MatchState): Promise<void>;
  getSnapshot(matchId: string): Promise<ScriptSnapshot | null>;
  setSnapshot(matchId: string, snapshot: ScriptSnapshot): Promise<void>;
  /** Trận đang diễn ra của phòng. */
  activeMatchOf(roomId: string): Promise<string | null>;
  activate(roomId: string, matchId: string): Promise<void>;
  /** Bỏ đánh dấu đang diễn ra; giữ trạng thái cuối một thời gian để client xem kết quả. */
  deactivate(roomId: string, matchId: string): Promise<void>;
  activeMatches(): Promise<string[]>;
  /** Chạy `work` khi giữ mutex của trận (chờ tối đa `waitMs`). */
  withLock<T>(matchId: string, work: () => Promise<T>, waitMs?: number): Promise<T>;
  /** Giành hoặc gia hạn quyền sở hữu trận; trả `true` nếu instance này đang sở hữu. */
  claimLease(matchId: string, owner: string, ttlMs: number): Promise<boolean>;
  releaseLease(matchId: string, owner: string): Promise<void>;
  getReply(matchId: string, actionId: string): Promise<StoredReply | null>;
  setReply(matchId: string, actionId: string, reply: StoredReply): Promise<void>;
}

export class MatchBusyError extends Error {
  constructor() {
    super('Không giành được khóa trận.');
    this.name = 'MatchBusyError';
  }
}

const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0
`;

/** Giữ lease nếu chưa ai giữ hoặc chính mình đang giữ (gia hạn). */
const CLAIM_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if (not current) or current == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
  return 1
end
return 0
`;

const LOCK_TTL_MS = 10_000;
const FINISHED_TTL_SECONDS = 3600;
const REPLY_TTL_SECONDS = 600;

export function createRedisMatchStore(redis: Redis, prefix = 'olympia:'): MatchStore {
  const key = {
    state: (id: string) => `${prefix}match:${id}:state`,
    snapshot: (id: string) => `${prefix}match:${id}:snapshot`,
    lock: (id: string) => `${prefix}match:${id}:lock`,
    lease: (id: string) => `${prefix}match:${id}:lease`,
    reply: (id: string, action: string) => `${prefix}match:${id}:act:${action}`,
    room: (roomId: string) => `${prefix}room:${roomId}:match`,
    active: `${prefix}matches:active`,
  };

  return {
    async getState(matchId) {
      const raw = await redis.get(key.state(matchId));
      return raw ? (JSON.parse(raw) as MatchState) : null;
    },

    async setState(state) {
      const raw = JSON.stringify(state);
      if (state.status === 'finished') {
        await redis.set(key.state(state.matchId), raw, 'EX', FINISHED_TTL_SECONDS);
      } else {
        await redis.set(key.state(state.matchId), raw);
      }
    },

    async getSnapshot(matchId) {
      const raw = await redis.get(key.snapshot(matchId));
      return raw ? (JSON.parse(raw) as ScriptSnapshot) : null;
    },

    async setSnapshot(matchId, snapshot) {
      await redis.set(key.snapshot(matchId), JSON.stringify(snapshot));
    },

    activeMatchOf(roomId) {
      return redis.get(key.room(roomId));
    },

    async activate(roomId, matchId) {
      await redis.multi().set(key.room(roomId), matchId).sadd(key.active, matchId).exec();
    },

    async deactivate(roomId, matchId) {
      await redis
        .multi()
        .srem(key.active, matchId)
        .expire(key.snapshot(matchId), FINISHED_TTL_SECONDS)
        .exec();
      // Chỉ xóa liên kết phòng nếu vẫn trỏ tới trận này.
      await redis.eval(RELEASE_SCRIPT, 1, key.room(roomId), matchId);
    },

    activeMatches() {
      return redis.smembers(key.active);
    },

    async withLock(matchId, work, waitMs = 5_000) {
      const token = randomUUID();
      const deadline = Date.now() + waitMs;
      let delay = 5;
      for (;;) {
        if ((await redis.set(key.lock(matchId), token, 'PX', LOCK_TTL_MS, 'NX')) === 'OK') break;
        if (Date.now() >= deadline) throw new MatchBusyError();
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * 2, 50);
      }
      try {
        return await work();
      } finally {
        await redis.eval(RELEASE_SCRIPT, 1, key.lock(matchId), token);
      }
    },

    async claimLease(matchId, owner, ttlMs) {
      return (await redis.eval(CLAIM_SCRIPT, 1, key.lease(matchId), owner, ttlMs)) === 1;
    },

    async releaseLease(matchId, owner) {
      await redis.eval(RELEASE_SCRIPT, 1, key.lease(matchId), owner);
    },

    async getReply(matchId, actionId) {
      const raw = await redis.get(key.reply(matchId, actionId));
      return raw ? (JSON.parse(raw) as StoredReply) : null;
    },

    async setReply(matchId, actionId, reply) {
      await redis.set(key.reply(matchId, actionId), JSON.stringify(reply), 'EX', REPLY_TTL_SECONDS);
    },
  };
}
