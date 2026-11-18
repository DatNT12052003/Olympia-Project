import { CSRF_HEADER, currentUserSchema } from '@olympia/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  errorResponse,
  makeUser,
  mockApi,
  sessionResponse,
  withStoredSession,
} from '../test/mock-api';
import { jsonResponse } from '../test/render';
import { apiGet } from './api-client';
import { getAuthState, initAuthSession } from './auth-session';

const meSchema = z.object({ user: currentUserSchema });

async function signedIn() {
  withStoredSession();
  initAuthSession();
  await expect.poll(() => getAuthState().status).toBe('authenticated');
}

describe('api-client với phiên đăng nhập', () => {
  it('gửi access token và header chống CSRF', async () => {
    const { requests } = mockApi({
      'POST /auth/refresh': () => jsonResponse(sessionResponse(makeUser(), 'token-a')),
      'GET /me': () => jsonResponse({ user: makeUser() }),
    });
    await signedIn();

    await apiGet('/me', { schema: meSchema, auth: true });

    const me = requests.find((r) => r.path === '/me');
    expect(me?.headers.get('Authorization')).toBe('Bearer token-a');
    expect(me?.headers.get(CSRF_HEADER)).toBe('1');
  });

  it('gặp 401 thì làm mới token một lần rồi thử lại', async () => {
    let refreshCount = 0;
    const { requests } = mockApi({
      'POST /auth/refresh': () =>
        jsonResponse(sessionResponse(makeUser(), `token-${++refreshCount}`)),
      'GET /me': ({ headers }) =>
        headers.get('Authorization') === 'Bearer token-2'
          ? jsonResponse({ user: makeUser() })
          : errorResponse(401, 'UNAUTHENTICATED', 'Hết hạn'),
    });
    await signedIn();

    const result = await apiGet('/me', { schema: meSchema, auth: true });

    expect(result.user.id).toBe(makeUser().id);
    expect(requests.filter((r) => r.path === '/me')).toHaveLength(2);
    expect(refreshCount).toBe(2);
  });

  it('nhiều request cùng gặp 401 chỉ làm mới token một lần (không dùng lại refresh token)', async () => {
    let refreshCount = 0;
    mockApi({
      'POST /auth/refresh': async () => {
        refreshCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return jsonResponse(sessionResponse(makeUser(), `token-${refreshCount}`));
      },
      'GET /me': ({ headers }) =>
        headers.get('Authorization') === 'Bearer token-1'
          ? errorResponse(401, 'UNAUTHENTICATED', 'Hết hạn')
          : jsonResponse({ user: makeUser() }),
    });
    await signedIn();
    expect(refreshCount).toBe(1);

    await Promise.all(
      Array.from({ length: 4 }, () => apiGet('/me', { schema: meSchema, auth: true })),
    );

    expect(refreshCount).toBe(2);
  });

  it('làm mới thất bại thì xóa phiên và báo lỗi', async () => {
    let allowRefresh = true;
    mockApi({
      'POST /auth/refresh': () =>
        allowRefresh
          ? jsonResponse(sessionResponse())
          : errorResponse(401, 'UNAUTHENTICATED', 'Phiên đã hết'),
      'GET /me': () => errorResponse(401, 'UNAUTHENTICATED', 'Phiên đã bị thu hồi'),
    });
    await signedIn();
    allowRefresh = false;

    await expect(apiGet('/me', { schema: meSchema, auth: true })).rejects.toMatchObject({
      status: 401,
    });
    expect(getAuthState()).toEqual({ status: 'anonymous', user: null });
    expect(localStorage.getItem('olympia.session')).toBeNull();
  });

  it('không có phiên thì không gọi API cần đăng nhập', async () => {
    const { requests } = mockApi({});
    initAuthSession();

    await expect(apiGet('/me', { schema: meSchema, auth: true })).rejects.toMatchObject({
      status: 401,
    });
    expect(requests).toHaveLength(0);
  });
});
