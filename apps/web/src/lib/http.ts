import { apiErrorBodySchema, CSRF_HEADER } from '@olympia/shared';
import type { z } from 'zod';

/** Lỗi khi gọi API: lỗi HTTP có mã lỗi từ server, hoặc lỗi mạng (`status` = 0). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface HttpRequestOptions<T> {
  method?: HttpMethod;
  body?: unknown;
  /** Schema kiểm tra body thành công. Bỏ trống khi endpoint không trả body (204/202). */
  schema?: z.ZodType<T>;
  /** Mã HTTP ngoài 2xx vẫn có body hợp lệ theo `schema` (ví dụ 503 của health check). */
  acceptStatuses?: readonly number[];
  accessToken?: string;
  signal?: AbortSignal;
}

const NETWORK_ERROR_MESSAGE = 'Không kết nối được máy chủ.';

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/**
 * Gọi `/api{path}` không kèm logic làm mới token. Luôn gửi cookie (refresh token chỉ đi tới
 * `/api/auth`) và header chống CSRF mà backend yêu cầu cho các endpoint dùng cookie.
 */
export async function httpRequest<T = undefined>(
  path: string,
  {
    method = 'GET',
    body,
    schema,
    acceptStatuses = [],
    accessToken,
    signal,
  }: HttpRequestOptions<T> = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', [CSRF_HEADER]: '1' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: 'include',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK_ERROR', NETWORK_ERROR_MESSAGE);
  }

  if (response.ok || acceptStatuses.includes(response.status)) {
    if (!schema) return undefined as T;
    const parsed = schema.safeParse(await readJson(response));
    if (!parsed.success) {
      throw new ApiError(response.status, 'INVALID_RESPONSE', 'Phản hồi từ máy chủ không hợp lệ.');
    }
    return parsed.data;
  }

  const errorBody = apiErrorBodySchema.safeParse(await readJson(response));
  if (errorBody.success) {
    const { code, message, details } = errorBody.data.error;
    throw new ApiError(response.status, code, message, details);
  }
  throw new ApiError(response.status, 'HTTP_ERROR', `Máy chủ trả về lỗi ${response.status}.`);
}
