import type { ClientErrorReport } from '@olympia/shared';

/**
 * Gửi lỗi giao diện về API của chính hệ thống (`/api/client-errors`, DL-053) thay cho dịch vụ
 * bên ngoài: không có dữ liệu người dùng, chỉ đường dẫn trang (bỏ query string chứa token), thông
 * điệp và stack. Tối đa vài lỗi mỗi lần tải trang, bỏ lỗi trùng.
 */

const MAX_REPORTS = 10;
let sent = 0;
const seen = new Set<string>();

function errorParts(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: `${error.name}: ${error.message}`, stack: error.stack?.slice(0, 4000) };
  }
  return { message: String(error) };
}

export function reportClientError(error: unknown, kind: ClientErrorReport['kind']): void {
  if (sent >= MAX_REPORTS) return;
  const { message, stack } = errorParts(error);
  const key = `${kind}|${message}`;
  if (!message || seen.has(key)) return;
  seen.add(key);
  sent += 1;
  const report: ClientErrorReport = {
    message: message.slice(0, 500),
    ...(stack ? { stack } : {}),
    path: window.location.pathname.slice(0, 300),
    kind,
    release: import.meta.env.VITE_RELEASE as string | undefined,
  };
  try {
    void fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(report),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Báo lỗi không được gây thêm lỗi.
  }
}

/** Bắt lỗi chưa xử lý của trang (chỉ bật ở bản production). */
export function installErrorReporter(): void {
  window.addEventListener('error', (event) => {
    reportClientError(event.error ?? event.message, 'error');
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportClientError(event.reason, 'unhandledrejection');
  });
}
