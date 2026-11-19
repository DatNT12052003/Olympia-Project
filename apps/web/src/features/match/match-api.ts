import {
  type ScriptInput,
  scriptDetailSchema,
  scriptListSchema,
  type StartMatchRequest,
} from '@olympia/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiDelete, apiGet, apiPost, apiPut } from '../../lib/api-client';

const scriptEnvelope = z.object({ script: scriptDetailSchema });
const startEnvelope = z.object({ matchId: z.uuid() });

export const scriptKeys = {
  all: ['scripts'] as const,
  list: ['scripts', 'list'] as const,
  detail: (id: string) => ['scripts', 'detail', id] as const,
};

export function useScripts() {
  return useQuery({
    queryKey: scriptKeys.list,
    queryFn: async () => (await apiGet('/scripts', { schema: scriptListSchema, auth: true })).items,
  });
}

export function useScript(id: string | undefined) {
  return useQuery({
    queryKey: scriptKeys.detail(id ?? ''),
    queryFn: async () =>
      (await apiGet(`/scripts/${id}`, { schema: scriptEnvelope, auth: true })).script,
    enabled: Boolean(id),
  });
}

/** Tạo (`id` rỗng) hoặc cập nhật kịch bản. */
export function useSaveScript(id: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ScriptInput) =>
      (id
        ? await apiPut(`/scripts/${id}`, input, { schema: scriptEnvelope, auth: true })
        : await apiPost('/scripts', input, { schema: scriptEnvelope, auth: true })
      ).script,
    onSuccess: async (script) => {
      queryClient.setQueryData(scriptKeys.detail(script.id), script);
      await queryClient.invalidateQueries({ queryKey: scriptKeys.list });
    },
  });
}

/** "Lưu thành mẫu": nhân bản kịch bản thành kịch bản mới. */
export function useDuplicateScript() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name?: string }) =>
      (
        await apiPost(`/scripts/${id}/duplicate`, name ? { name } : {}, {
          schema: scriptEnvelope,
          auth: true,
        })
      ).script,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: scriptKeys.list });
    },
  });
}

export function useDeleteScript() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/scripts/${id}`, { auth: true }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: scriptKeys.all });
    },
  });
}

/** Host bắt đầu trận; trạng thái trận đến qua realtime. */
export async function startMatch(roomId: string, input: StartMatchRequest): Promise<string> {
  return (await apiPost(`/rooms/${roomId}/match`, input, { schema: startEnvelope, auth: true }))
    .matchId;
}
