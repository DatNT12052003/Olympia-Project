import {
  type CreateRoomRequest,
  type HostRoom,
  hostRoomListSchema,
  hostRoomSchema,
  type JoinRoomRequest,
  type JoinRoomResponse,
  joinRoomResponseSchema,
  type ParticipantRole,
  participantViewSchema,
  publicRoomListSchema,
  roomPreviewSchema,
  type UpdateRoomRequest,
} from '@olympia/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiPut,
  type TokenSource,
  userTokenSource,
} from '../../lib/api-client';
import { waitForAuth } from '../../lib/auth-session';
import { applyGuestSession, guestTokenSource } from '../../lib/guest-session';

const roomEnvelope = z.object({ room: hostRoomSchema });
const previewEnvelope = z.object({ room: roomPreviewSchema });
const participantEnvelope = z.object({ participant: participantViewSchema });

export const roomKeys = {
  mine: ['rooms', 'mine'] as const,
  detail: (roomId: string) => ['rooms', 'detail', roomId] as const,
  public: ['rooms', 'public'] as const,
  lookup: (code: string) => ['rooms', 'lookup', code] as const,
  me: (roomId: string) => ['rooms', 'me', roomId] as const,
};

/**
 * Token dùng trong một phòng: phiên tài khoản nếu đã đăng nhập, ngược lại phiên khách của
 * đúng phòng đó (DL-028).
 */
export function roomTokenSource(roomId: string): TokenSource {
  const guest = guestTokenSource(roomId);
  return {
    async get() {
      const { status } = await waitForAuth();
      return status === 'authenticated' ? userTokenSource.get() : guest.get();
    },
    async refresh() {
      const { status } = await waitForAuth();
      return status === 'authenticated' ? userTokenSource.refresh() : guest.refresh();
    },
  };
}

// --- Host ---

export function useMyRooms() {
  return useQuery({
    queryKey: roomKeys.mine,
    queryFn: () => apiGet('/rooms', { schema: hostRoomListSchema, auth: true }),
  });
}

export function useHostRoom(roomId: string | undefined) {
  return useQuery({
    queryKey: roomKeys.detail(roomId ?? ''),
    queryFn: async () =>
      (await apiGet(`/rooms/${roomId}`, { schema: roomEnvelope, auth: true })).room,
    enabled: Boolean(roomId),
  });
}

/** Mutation của Host trên phòng; cập nhật cache danh sách và chi tiết phòng. */
function useRoomMutation<V>(fn: (variables: V) => Promise<HostRoom | undefined>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (room) => {
      if (room) queryClient.setQueryData(roomKeys.detail(room.id), room);
      await queryClient.invalidateQueries({ queryKey: roomKeys.mine });
    },
  });
}

export function useCreateRoom() {
  return useRoomMutation(
    async (input: CreateRoomRequest) =>
      (await apiPost('/rooms', input, { schema: roomEnvelope, auth: true })).room,
  );
}

export function useUpdateRoom(roomId: string) {
  return useRoomMutation(
    async (input: UpdateRoomRequest) =>
      (await apiPatch(`/rooms/${roomId}`, input, { schema: roomEnvelope, auth: true })).room,
  );
}

/** Thao tác trạng thái phòng: mở, đóng, đổi mã (tạo link mời mới). */
export function useRoomAction() {
  return useRoomMutation(
    async ({ roomId, action }: { roomId: string; action: 'open' | 'close' | 'code' }) =>
      (await apiPost(`/rooms/${roomId}/${action}`, undefined, { schema: roomEnvelope, auth: true }))
        .room,
  );
}

export function useDeleteRoom() {
  return useRoomMutation(async (roomId: string) => {
    await apiDelete(`/rooms/${roomId}`, { auth: true });
    return undefined;
  });
}

export type ParticipantAction =
  | { type: 'approve' | 'reject' | 'kick' | 'ban' }
  | { type: 'seat'; seat: number | null }
  | { type: 'role'; role: ParticipantRole };

/** Host quản lý người tham gia trong sảnh chờ (BR-JOIN-03). Trạng thái mới đến qua realtime. */
export function participantAction(
  roomId: string,
  participantId: string,
  action: ParticipantAction,
): Promise<undefined> {
  const base = `/rooms/${roomId}/participants/${participantId}`;
  switch (action.type) {
    case 'seat':
      return apiPut(`${base}/seat`, { seat: action.seat }, { auth: true });
    case 'role':
      return apiPut(`${base}/role`, { role: action.role }, { auth: true });
    default:
      return apiPost(`${base}/${action.type}`, undefined, { auth: true });
  }
}

// --- Vào phòng ---

export function usePublicRooms() {
  return useQuery({
    queryKey: roomKeys.public,
    queryFn: async () => (await apiGet('/rooms/public', { schema: publicRoomListSchema })).items,
    refetchInterval: 15_000,
  });
}

export function useRoomLookup(code: string | null) {
  return useQuery({
    queryKey: roomKeys.lookup(code ?? ''),
    queryFn: async () =>
      (
        await apiGet(`/rooms/lookup?code=${encodeURIComponent(code ?? '')}`, {
          schema: previewEnvelope,
        })
      ).room,
    enabled: code !== null,
    retry: false,
  });
}

/**
 * Vào phòng: gửi kèm phiên tài khoản hoặc phiên khách của phòng nếu có; khách mới nhận phiên
 * khách gắn với phòng.
 */
export async function joinRoom(roomId: string, input: JoinRoomRequest): Promise<JoinRoomResponse> {
  const result = await apiPost(`/rooms/${roomId}/join`, input, {
    schema: joinRoomResponseSchema,
    auth: roomTokenSource(roomId),
    optionalAuth: true,
  });
  if (result.guestSession) applyGuestSession(result.guestSession);
  return result;
}

// --- Người tham gia ---

export function useMyParticipation(roomId: string, enabled: boolean, version: number | undefined) {
  return useQuery({
    // Theo version trạng thái phòng: vai trò/ghế của mình đổi thì tải lại.
    queryKey: [...roomKeys.me(roomId), version ?? 0],
    queryFn: async () =>
      (
        await apiGet(`/rooms/${roomId}/me`, {
          schema: participantEnvelope,
          auth: roomTokenSource(roomId),
        })
      ).participant,
    enabled,
    placeholderData: (previous) => previous,
  });
}

export function setReady(roomId: string, ready: boolean): Promise<undefined> {
  return apiPost(`/rooms/${roomId}/me/ready`, { ready }, { auth: roomTokenSource(roomId) });
}

export function leaveRoom(roomId: string): Promise<undefined> {
  return apiDelete(`/rooms/${roomId}/me`, { auth: roomTokenSource(roomId) });
}
