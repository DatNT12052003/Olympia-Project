import type { DependencyStatus, HealthReport } from '@olympia/shared';

/** Hàm kiểm tra một phụ thuộc; ném lỗi (hoặc quá thời gian) nghĩa là phụ thuộc đó không sẵn sàng. */
export type DependencyCheck = () => Promise<unknown>;

export interface HealthService {
  check(): Promise<HealthReport>;
}

const DEFAULT_TIMEOUT_MS = 2000;

async function runCheck(check: DependencyCheck, timeoutMs: number): Promise<DependencyStatus> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
  });
  try {
    await Promise.race([check(), timeout]);
    return 'up';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}

export function createHealthService(
  checks: Record<string, DependencyCheck>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): HealthService {
  return {
    async check() {
      const entries = await Promise.all(
        Object.entries(checks).map(
          async ([name, check]) => [name, await runCheck(check, timeoutMs)] as const,
        ),
      );
      const results = Object.fromEntries(entries);
      const status = entries.every(([, s]) => s === 'up') ? 'ok' : 'degraded';
      return { status, checks: results };
    },
  };
}
