import {
  allowedSources,
  AvErrorCode,
  type AvParticipantMetadata,
  avParticipantMetadataSchema,
  type AvPolicy,
  type AvTokenResponse,
  hasRoomPermission,
  RoomErrorCode,
  RoomPermission,
  type UpdateAvPolicyRequest,
} from '@olympia/shared';
import type { Logger } from 'pino';
import type { Principal } from '../../shared/auth/principal';
import { AppError, ForbiddenError } from '../../shared/errors/app-error';
import type { LobbyService } from '../rooms/lobby.service';
import type { AvGateway, AvSource } from './av-gateway';
import type { AvSpeaker, AvStore } from './av-store';

/**
 * Module âm thanh/hình ảnh (mục 11, DL-014, DL-046): cấp token LiveKit theo vai trò trong phòng
 * (khán giả chỉ nhận, BR-AV-04), giữ chính sách của Host và áp quyền phát xuống SFU.
 *
 * Mọi lỗi khi gọi SFU chỉ được ghi log, không ném ra luồng phòng/trận (BR-AV-02); riêng cấp token
 * trả lỗi `AV_UNAVAILABLE` để client hiện "không kết nối được video".
 */

export interface AvServiceDeps {
  gateway: AvGateway;
  store: AvStore;
  lobby: Pick<LobbyService, 'resolveViewer'>;
  logger: Logger;
  /** URL WebSocket LiveKit cho trình duyệt. */
  publicUrl: string;
}

/** Tên phòng LiveKit của một phòng thi. */
export function avRoomName(roomId: string): string {
  return `room-${roomId}`;
}

function parseMetadata(raw: string): AvParticipantMetadata | null {
  try {
    const parsed = avParticipantMetadataSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function sourcesOf(allowed: { camera: boolean; microphone: boolean }): AvSource[] {
  const result: AvSource[] = [];
  if (allowed.camera) result.push('camera');
  if (allowed.microphone) result.push('microphone');
  return result;
}

function outOfTurn(speaker: AvSpeaker, identity: string): boolean {
  return speaker.running && speaker.speakerKey !== identity;
}

export function createAvService({ gateway, store, lobby, logger, publicUrl }: AvServiceDeps) {
  async function requireHost(roomId: string, principal: Principal): Promise<void> {
    const viewer = await lobby.resolveViewer(roomId, principal);
    const role = viewer && viewer.role !== 'pending' ? viewer.role : null;
    if (!viewer) throw new ForbiddenError('Bạn không ở trong phòng này.', RoomErrorCode.NotInRoom);
    if (!hasRoomPermission(role, RoomPermission.ControlMatch)) {
      throw new ForbiddenError('Chỉ Host của phòng được điều khiển âm thanh và hình ảnh.');
    }
  }

  /** Áp chính sách hiện tại cho mọi Player đang kết nối LiveKit. */
  async function enforce(roomId: string): Promise<void> {
    const room = avRoomName(roomId);
    try {
      const [participants, policy, speaker] = await Promise.all([
        gateway.listParticipants(room),
        store.getPolicy(roomId),
        store.getSpeaker(roomId),
      ]);
      for (const p of participants) {
        const meta = parseMetadata(p.metadata);
        if (meta?.role !== 'player' || !meta.participantId) continue;
        const allowed = allowedSources({
          policy,
          participantId: meta.participantId,
          outOfTurn: outOfTurn(speaker, p.identity),
        });
        await gateway.setSources(room, p.identity, sourcesOf(allowed));
        // Tắt luôn track đang phát của nguồn vừa bị khóa (11.2).
        for (const track of p.tracks) {
          const blocked =
            (track.source === 'microphone' && !allowed.microphone) ||
            (track.source === 'camera' && !allowed.camera);
          if (blocked && !track.muted) await gateway.muteTrack(room, p.identity, track.sid);
        }
      }
    } catch (error) {
      logger.warn({ err: error, roomId }, 'Không áp được quyền âm thanh/hình ảnh');
    }
  }

  return {
    /** Token kết nối LiveKit của người xem trong phòng (BR-AV-01: không bắt buộc bật thiết bị). */
    async token(roomId: string, principal: Principal): Promise<AvTokenResponse> {
      const viewer = await lobby.resolveViewer(roomId, principal);
      if (!viewer || viewer.role === 'pending') {
        throw new ForbiddenError('Bạn không ở trong phòng này.', RoomErrorCode.NotInRoom);
      }
      if (!hasRoomPermission(viewer.role, RoomPermission.SubscribeMedia)) {
        throw new ForbiddenError('Bạn không xem được video của phòng này.');
      }
      let sources: AvSource[] | null = null;
      if (viewer.role === 'host') {
        sources = ['camera', 'microphone'];
      } else if (viewer.role === 'player') {
        const [policy, speaker] = await Promise.all([
          store.getPolicy(roomId),
          store.getSpeaker(roomId),
        ]);
        sources = sourcesOf(
          allowedSources({
            policy,
            participantId: viewer.participant.id,
            outOfTurn: outOfTurn(speaker, viewer.key),
          }),
        );
      }
      const metadata: AvParticipantMetadata = {
        role: viewer.role,
        participantId: viewer.participant?.id ?? null,
      };
      try {
        const token = await gateway.createToken({
          room: avRoomName(roomId),
          identity: viewer.key,
          name: viewer.displayName,
          metadata: JSON.stringify(metadata),
          sources,
        });
        return { url: publicUrl, token, identity: viewer.key, canPublish: sources !== null };
      } catch (error) {
        logger.error({ err: error, roomId }, 'Không tạo được token LiveKit');
        throw new AppError(503, AvErrorCode.Unavailable, 'Máy chủ video tạm thời không dùng được.');
      }
    },

    async getPolicy(roomId: string, principal: Principal): Promise<AvPolicy> {
      await requireHost(roomId, principal);
      return store.getPolicy(roomId);
    },

    async updatePolicy(
      roomId: string,
      principal: Principal,
      request: UpdateAvPolicyRequest,
    ): Promise<AvPolicy> {
      await requireHost(roomId, principal);
      const policy = await store.getPolicy(roomId);
      switch (request.type) {
        case 'mute_all':
          policy.muteAll = request.value;
          break;
        case 'turn_only':
          policy.turnOnly = request.value;
          break;
        case 'lock': {
          const current = policy.locks[request.participantId] ?? { mic: false, cam: false };
          const next = {
            mic: request.mic ?? current.mic,
            cam: request.cam ?? current.cam,
          };
          if (next.mic || next.cam) policy.locks[request.participantId] = next;
          else delete policy.locks[request.participantId];
          break;
        }
      }
      await store.setPolicy(roomId, policy);
      await enforce(roomId);
      return policy;
    },

    /** Trận thay đổi người đang nói (từ Game Engine qua tầng ghép module). */
    async onSpeaker(roomId: string, speaker: AvSpeaker): Promise<void> {
      try {
        if (!(await store.setSpeaker(roomId, speaker))) return;
        if ((await store.getPolicy(roomId)).turnOnly) await enforce(roomId);
      } catch (error) {
        logger.warn({ err: error, roomId }, 'Không cập nhật được người đang nói');
      }
    },

    /** Người rời phòng/bị kick/ban: ngắt khỏi phòng LiveKit. */
    async onRemoved(roomId: string, key: string): Promise<void> {
      try {
        await gateway.removeParticipant(avRoomName(roomId), key);
      } catch (error) {
        // Không ở trong phòng LiveKit (chưa bật video) là bình thường.
        logger.debug({ err: error, roomId }, 'Không ngắt được người khỏi phòng video');
      }
    },

    /** Phòng đóng: đóng phòng LiveKit và xóa chính sách. */
    async onClosed(roomId: string): Promise<void> {
      try {
        await store.clear(roomId);
        await gateway.deleteRoom(avRoomName(roomId));
      } catch (error) {
        logger.debug({ err: error, roomId }, 'Không đóng được phòng video');
      }
    },

    enforce,
  };
}

export type AvService = ReturnType<typeof createAvService>;
