import {
  type AvPolicy,
  avPolicyResponseSchema,
  type AvTokenResponse,
  avTokenResponseSchema,
  type UpdateAvPolicyRequest,
} from '@olympia/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost } from '../../lib/api-client';
import { roomTokenSource } from '../rooms/rooms-api';

/** Gọi API âm thanh/hình ảnh của phòng (mục 11). */

const avKeys = {
  policy: (roomId: string) => ['rooms', roomId, 'av', 'policy'] as const,
};

/** Token kết nối LiveKit cho người xem hiện tại (người dùng hoặc khách của phòng). */
export function fetchAvToken(roomId: string): Promise<AvTokenResponse> {
  return apiPost(
    `/rooms/${roomId}/av/token`,
    {},
    {
      schema: avTokenResponseSchema,
      auth: roomTokenSource(roomId),
    },
  );
}

/** Chính sách âm thanh/hình ảnh của phòng (chỉ Host). */
export function useAvPolicy(roomId: string, enabled: boolean) {
  return useQuery({
    queryKey: avKeys.policy(roomId),
    queryFn: async () =>
      (await apiGet(`/rooms/${roomId}/av/policy`, { schema: avPolicyResponseSchema, auth: true }))
        .policy,
    enabled,
  });
}

export function useUpdateAvPolicy(roomId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: UpdateAvPolicyRequest): Promise<AvPolicy> =>
      (
        await apiPatch(`/rooms/${roomId}/av/policy`, request, {
          schema: avPolicyResponseSchema,
          auth: true,
        })
      ).policy,
    onSuccess: (policy) => queryClient.setQueryData(avKeys.policy(roomId), policy),
  });
}
