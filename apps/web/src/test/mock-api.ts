import type { AuthSessionResponse, CurrentUser } from '@olympia/shared';
import { vi } from 'vitest';
import { jsonResponse } from './render';

export interface MockRequest {
  method: string;
  path: string;
  body: unknown;
  headers: Headers;
}

type Handler = (request: MockRequest) => Response | Promise<Response>;

/**
 * Giả lập API theo khóa "METHOD /path" (path không gồm `/api` và query string).
 * Request không khớp trả 404 theo hợp đồng lỗi. Trả về danh sách request đã nhận.
 */
export function mockApi(handlers: Record<string, Handler>) {
  const requests: MockRequest[] = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href, 'http://localhost');
    const request: MockRequest = {
      method: init?.method ?? 'GET',
      path: url.pathname.replace(/^\/api/, '') + url.search,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      headers: new Headers(init?.headers),
    };
    requests.push(request);
    const key = `${request.method} ${url.pathname.replace(/^\/api/, '')}`;
    const handler = handlers[key];
    if (handler) return Promise.resolve(handler(request));
    if (key === 'GET /health/ready') {
      return Promise.resolve(jsonResponse({ status: 'ok', checks: {} }));
    }
    return Promise.resolve(
      jsonResponse({ error: { code: 'NOT_FOUND', message: `Không có ${key}` } }, 404),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return { requests, fetchMock };
}

export function makeUser(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'an@example.com',
    displayName: 'Nguyễn An',
    avatarUrl: null,
    emailVerified: true,
    systemRole: 'member',
    canHost: true,
    organizationId: null,
    ...overrides,
  };
}

export function sessionResponse(
  user: CurrentUser = makeUser(),
  accessToken = 'access-1',
): AuthSessionResponse {
  return {
    accessToken,
    accessTokenExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    user,
  };
}

export function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse({ error: { code, message } }, status);
}

/** Giả lập trình duyệt đã có phiên: lần tải trang sẽ gọi /auth/refresh. */
export function withStoredSession(): void {
  localStorage.setItem('olympia.session', '1');
}
