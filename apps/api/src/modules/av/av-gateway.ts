import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';

/**
 * Cổng tới SFU LiveKit (DL-019). Module AV chỉ dùng interface này để test thay bằng bản giả và để
 * đổi SFU sau này không ảnh hưởng phần còn lại (DL-014).
 */

export type AvSource = 'camera' | 'microphone';

export interface AvParticipant {
  identity: string;
  metadata: string;
  tracks: { sid: string; source: AvSource | 'other'; muted: boolean }[];
}

export interface AvTokenInput {
  room: string;
  identity: string;
  name: string;
  metadata: string;
  /** `null`: chỉ xem/nghe (khán giả). */
  sources: AvSource[] | null;
}

export interface AvGateway {
  createToken(input: AvTokenInput): Promise<string>;
  listParticipants(room: string): Promise<AvParticipant[]>;
  /** Đặt nguồn được phép phát (thay toàn bộ quyền phát). */
  setSources(room: string, identity: string, sources: AvSource[]): Promise<void>;
  muteTrack(room: string, identity: string, trackSid: string): Promise<void>;
  removeParticipant(room: string, identity: string): Promise<void>;
  deleteRoom(room: string): Promise<void>;
}

const TO_LIVEKIT: Record<AvSource, TrackSource> = {
  camera: TrackSource.CAMERA,
  microphone: TrackSource.MICROPHONE,
};

function fromLivekit(source: TrackSource): AvSource | 'other' {
  if (source === TrackSource.CAMERA) return 'camera';
  if (source === TrackSource.MICROPHONE) return 'microphone';
  return 'other';
}

/** Thời hạn token kết nối; client LiveKit tự gia hạn khi đã vào phòng. */
const TOKEN_TTL = '6h';

export function createLivekitGateway(config: {
  apiUrl: string;
  apiKey: string;
  apiSecret: string;
}): AvGateway {
  const rooms = new RoomServiceClient(config.apiUrl, config.apiKey, config.apiSecret);
  // Danh sách nguồn rỗng nghĩa là "mọi nguồn" với LiveKit: khóa hết thì tắt quyền phát.
  const permission = (sources: AvSource[]) => ({
    canSubscribe: true,
    canPublish: sources.length > 0,
    canPublishData: false,
    canUpdateMetadata: false,
    canPublishSources: sources.map((s) => TO_LIVEKIT[s]),
  });

  return {
    async createToken(input) {
      const token = new AccessToken(config.apiKey, config.apiSecret, {
        identity: input.identity,
        name: input.name,
        metadata: input.metadata,
        ttl: TOKEN_TTL,
      });
      token.addGrant({
        roomJoin: true,
        room: input.room,
        canSubscribe: true,
        canPublish: input.sources !== null && input.sources.length > 0,
        canPublishData: false,
        canUpdateOwnMetadata: false,
        ...(input.sources?.length
          ? { canPublishSources: input.sources.map((s) => TO_LIVEKIT[s]) }
          : {}),
      });
      return token.toJwt();
    },

    async listParticipants(room) {
      const list = await rooms.listParticipants(room);
      return list.map((p) => ({
        identity: p.identity,
        metadata: p.metadata,
        tracks: p.tracks.map((t) => ({
          sid: t.sid,
          source: fromLivekit(t.source),
          muted: t.muted,
        })),
      }));
    },

    async setSources(room, identity, sources) {
      await rooms.updateParticipant(room, identity, { permission: permission(sources) });
    },

    async muteTrack(room, identity, trackSid) {
      await rooms.mutePublishedTrack(room, identity, trackSid, true);
    },

    async removeParticipant(room, identity) {
      await rooms.removeParticipant(room, identity);
    },

    async deleteRoom(room) {
      await rooms.deleteRoom(room);
    },
  };
}
