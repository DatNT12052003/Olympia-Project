import { healthReportSchema, type HealthReport } from '@olympia/shared';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../lib/api-client';

const REFRESH_INTERVAL_MS = 30_000;

export function fetchSystemHealth(signal?: AbortSignal): Promise<HealthReport> {
  return apiGet('/health/ready', {
    schema: healthReportSchema,
    acceptStatuses: [503],
    ...(signal ? { signal } : {}),
  });
}

export function useSystemHealth() {
  return useQuery({
    queryKey: ['system', 'health'],
    queryFn: ({ signal }) => fetchSystemHealth(signal),
    refetchInterval: REFRESH_INTERVAL_MS,
  });
}
