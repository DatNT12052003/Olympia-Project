import { type AvPolicy, avPolicySchema, DEFAULT_AV_POLICY } from '@olympia/shared';
import type { Redis } from 'ioredis';

/**
 * Trạng thái âm thanh/hình ảnh của phòng ở Redis (dùng chung giữa các instance): chính sách của
 * Host và người đang được nói khi trận diễn ra (để áp "chỉ người đến lượt được nói").
 */

export interface AvSpeaker {
  /** Trận đang diễn ra (không tạm dừng/kết thúc). */
  running: boolean;
  /** Khóa danh tính của Player đang đến lượt/đang trả lời. */
  speakerKey: string | null;
}

export interface AvStore {
  getPolicy(roomId: string): Promise<AvPolicy>;
  setPolicy(roomId: string, policy: AvPolicy): Promise<void>;
  getSpeaker(roomId: string): Promise<AvSpeaker>;
  /** Ghi người đang nói; trả `true` nếu khác giá trị cũ. */
  setSpeaker(roomId: string, speaker: AvSpeaker): Promise<boolean>;
  clear(roomId: string): Promise<void>;
}

const NO_SPEAKER: AvSpeaker = { running: false, speakerKey: null };
/** Dữ liệu phòng tự hết hạn nếu phòng bị bỏ quên (phòng đóng thì xóa ngay). */
const TTL_SECONDS = 7 * 24 * 3600;

export function createRedisAvStore(redis: Redis, keyPrefix = ''): AvStore {
  const policyKey = (roomId: string) => `${keyPrefix}av:policy:${roomId}`;
  const speakerKey = (roomId: string) => `${keyPrefix}av:speaker:${roomId}`;

  return {
    async getPolicy(roomId) {
      const raw = await redis.get(policyKey(roomId));
      if (!raw) return structuredClone(DEFAULT_AV_POLICY);
      const parsed = avPolicySchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : structuredClone(DEFAULT_AV_POLICY);
    },
    async setPolicy(roomId, policy) {
      await redis.set(policyKey(roomId), JSON.stringify(policy), 'EX', TTL_SECONDS);
    },
    async getSpeaker(roomId) {
      const raw = await redis.get(speakerKey(roomId));
      return raw ? (JSON.parse(raw) as AvSpeaker) : NO_SPEAKER;
    },
    async setSpeaker(roomId, speaker) {
      const value = JSON.stringify(speaker);
      const previous = await redis.set(speakerKey(roomId), value, 'EX', TTL_SECONDS, 'GET');
      return previous !== value;
    },
    async clear(roomId) {
      await redis.del(policyKey(roomId), speakerKey(roomId));
    },
  };
}

/** Bản trong bộ nhớ (test). */
export function createMemoryAvStore(): AvStore {
  const policies = new Map<string, AvPolicy>();
  const speakers = new Map<string, AvSpeaker>();
  return {
    getPolicy: (roomId) =>
      Promise.resolve(structuredClone(policies.get(roomId) ?? DEFAULT_AV_POLICY)),
    setPolicy: (roomId, policy) => {
      policies.set(roomId, structuredClone(policy));
      return Promise.resolve();
    },
    getSpeaker: (roomId) => Promise.resolve(speakers.get(roomId) ?? NO_SPEAKER),
    setSpeaker: (roomId, speaker) => {
      const previous = JSON.stringify(speakers.get(roomId) ?? null);
      speakers.set(roomId, speaker);
      return Promise.resolve(previous !== JSON.stringify(speaker));
    },
    clear: (roomId) => {
      policies.delete(roomId);
      speakers.delete(roomId);
      return Promise.resolve();
    },
  };
}
