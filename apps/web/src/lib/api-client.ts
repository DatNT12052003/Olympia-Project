import type { z } from 'zod';
import { getAccessToken, handleSessionExpired, refreshSession } from './auth-session';
import { ApiError, type HttpMethod, httpRequest } from './http';

export { ApiError } from './http';

/** Nguồn access token: phiên tài khoản (mặc định) hoặc phiên khách của một phòng. */
export interface TokenSource {
  get(): Promise<string | null>;
  /** Làm mới sau khi server trả 401; `null` khi phiên đã hết. */
  refresh(): Promise<string | null>;
}

export const userTokenSource: TokenSource = {
  get: getAccessToken,
  async refresh() {
    if (await refreshSession()) return getAccessToken();
    handleSessionExpired();
    return null;
  },
};

export interface ApiRequestOptions<T> {
  schema?: z.ZodType<T>;
  /** Mã HTTP ngoài 2xx vẫn có body hợp lệ theo `schema` (ví dụ 503 của health check). */
  acceptStatuses?: readonly number[];
  signal?: AbortSignal;
  /** Gửi access token (`true`: phiên tài khoản); gặp 401 thì làm mới token một lần rồi thử lại. */
  auth?: boolean | TokenSource;
  /** Không có token thì vẫn gửi request (endpoint cho phép cả người chưa đăng nhập). */
  optionalAuth?: boolean;
}

async function apiRequest<T>(
  method: HttpMethod,
  path: string,
  body: unknown,
  { schema, acceptStatuses, signal, auth = false, optionalAuth = false }: ApiRequestOptions<T>,
): Promise<T> {
  const send = (accessToken?: string) =>
    httpRequest<T>(path, {
      method,
      body,
      ...(schema ? { schema } : {}),
      ...(acceptStatuses ? { acceptStatuses } : {}),
      ...(signal ? { signal } : {}),
      ...(accessToken ? { accessToken } : {}),
    });

  const source = auth === true ? userTokenSource : auth || null;
  if (!source) return send();

  const token = await source.get();
  if (!token) {
    if (optionalAuth) return send();
    throw new ApiError(401, 'UNAUTHENTICATED', 'Bạn cần đăng nhập để tiếp tục.');
  }
  try {
    return await send(token);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    // Access token có thể vừa bị thu hồi/hết hạn: thử làm mới một lần.
    const retryToken = await source.refresh();
    if (!retryToken) throw error;
    return send(retryToken);
  }
}

export function apiGet<T>(path: string, options: ApiRequestOptions<T> = {}): Promise<T> {
  return apiRequest('GET', path, undefined, options);
}

export function apiPost<T = undefined>(
  path: string,
  body?: unknown,
  options: ApiRequestOptions<T> = {},
): Promise<T> {
  return apiRequest('POST', path, body, options);
}

export function apiPatch<T = undefined>(
  path: string,
  body: unknown,
  options: ApiRequestOptions<T> = {},
): Promise<T> {
  return apiRequest('PATCH', path, body, options);
}

export function apiPut<T = undefined>(
  path: string,
  body?: unknown,
  options: ApiRequestOptions<T> = {},
): Promise<T> {
  return apiRequest('PUT', path, body, options);
}

export function apiDelete<T = undefined>(path: string, options: ApiRequestOptions<T> = {}) {
  return apiRequest('DELETE', path, undefined, options);
}

/** Thông điệp hiển thị cho người dùng từ một lỗi bất kỳ. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Đã có lỗi xảy ra. Vui lòng thử lại.';
}
