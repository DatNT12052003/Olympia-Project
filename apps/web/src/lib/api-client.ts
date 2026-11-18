import { apiErrorBodySchema } from '@olympia/shared';
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

export interface ApiRequestOptions<T> {
  schema: z.ZodType<T>;
  /** Mã HTTP ngoài 2xx vẫn có body hợp lệ theo `schema` (ví dụ 503 của health check). */
  acceptStatuses?: readonly number[];
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

export async function apiGet<T>(
  path: string,
  { schema, acceptStatuses = [], signal }: ApiRequestOptions<T>,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      headers: { Accept: 'application/json' },
      credentials: 'include',
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK_ERROR', NETWORK_ERROR_MESSAGE);
  }

  const body = await readJson(response);

  if (response.ok || acceptStatuses.includes(response.status)) {
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(response.status, 'INVALID_RESPONSE', 'Phản hồi từ máy chủ không hợp lệ.');
    }
    return parsed.data;
  }

  const errorBody = apiErrorBodySchema.safeParse(body);
  if (errorBody.success) {
    const { code, message, details } = errorBody.data.error;
    throw new ApiError(response.status, code, message, details);
  }
  throw new ApiError(response.status, 'HTTP_ERROR', `Máy chủ trả về lỗi ${response.status}.`);
}
