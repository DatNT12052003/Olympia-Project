import {
  type HistoryQuery,
  historyListSchema,
  matchResultSchema,
  myStatsSchema,
} from '@olympia/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPut, type TokenSource } from '../../lib/api-client';
import { roomTokenSource } from '../rooms/rooms-api';

export const resultKeys = {
  all: ['results'] as const,
  history: (query: HistoryQuery) => ['results', 'history', query] as const,
  match: (matchId: string) => ['results', 'match', matchId] as const,
  stats: ['results', 'stats'] as const,
};

function toSearchParams(query: HistoryQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string' || typeof value === 'number') {
      if (value !== '') params.set(key, String(value));
    }
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** Lịch sử trận (mục 14): Host xem trận đã tổ chức, Player xem trận đã tham gia. */
export function useMatchHistory(query: HistoryQuery) {
  return useQuery({
    queryKey: resultKeys.history(query),
    queryFn: ({ signal }) =>
      apiGet(`/matches${toSearchParams(query)}`, { schema: historyListSchema, auth: true, signal }),
    placeholderData: (previous) => previous,
  });
}

export function useMyStats() {
  return useQuery({
    queryKey: resultKeys.stats,
    queryFn: ({ signal }) =>
      apiGet('/matches/stats', { schema: myStatsSchema, auth: true, signal }),
  });
}

/**
 * Tổng kết trận (9.4). Khách xem bằng phiên khách của phòng (`roomId`), tài khoản bằng phiên
 * đăng nhập.
 */
export function useMatchResult(matchId: string, roomId: string | null) {
  const auth: true | TokenSource = roomId ? roomTokenSource(roomId) : true;
  return useQuery({
    queryKey: resultKeys.match(matchId),
    queryFn: ({ signal }) =>
      apiGet(`/matches/${matchId}`, { schema: matchResultSchema, auth, signal }),
    retry: false,
  });
}

function useResultMutation<V>(fn: (variables: V) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: resultKeys.all }),
  });
}

/** Host bật/tắt công bố đáp án cho Player và khán giả (DL-048). */
export function useSetAnswersPublic(matchId: string) {
  return useResultMutation((answersPublic: boolean) =>
    apiPut(`/matches/${matchId}/answers-visibility`, { answersPublic }, { auth: true }),
  );
}

/** Super Admin hủy kết quả trận (BR-HIST-01). */
export function useVoidMatch(matchId: string) {
  return useResultMutation((reason: string) =>
    apiPost(`/matches/${matchId}/void`, { reason }, { auth: true }),
  );
}
