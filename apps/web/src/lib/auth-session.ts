import {
  type AuthSessionResponse,
  authSessionResponseSchema,
  type CurrentUser,
} from '@olympia/shared';
import { ApiError, httpRequest } from './http';

/**
 * Phiên đăng nhập phía trình duyệt (DL-021).
 *
 * - Access token chỉ nằm trong bộ nhớ (không localStorage) để giảm rủi ro XSS đánh cắp token.
 * - Refresh token nằm trong cookie HttpOnly; khi tải lại trang, gọi `/auth/refresh` để lấy lại phiên.
 * - Làm mới token được tuần tự hóa giữa các tab bằng Web Locks: nếu hai tab cùng gửi một refresh
 *   token, backend coi là dùng lại token và thu hồi cả phiên.
 */

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthState {
  status: AuthStatus;
  user: CurrentUser | null;
}

/** Cờ không nhạy cảm: trình duyệt này có thể còn phiên, nên thử refresh khi mở trang. */
const SESSION_HINT_KEY = 'olympia.session';
const REFRESH_LOCK = 'olympia-auth-refresh';
const CHANNEL_NAME = 'olympia-auth';
/** Làm mới sớm trước khi access token hết hạn. */
const EXPIRY_MARGIN_MS = 30_000;

let state: AuthState = { status: 'loading', user: null };
let accessToken: string | null = null;
let accessTokenExpiresAt = 0;
let refreshing: Promise<boolean> | null = null;
const listeners = new Set<() => void>();
let channel: BroadcastChannel | null = null;

function setState(next: AuthState): void {
  state = next;
  for (const listener of listeners) listener();
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function setSessionHint(present: boolean): void {
  try {
    if (present) storage()?.setItem(SESSION_HINT_KEY, '1');
    else storage()?.removeItem(SESSION_HINT_KEY);
  } catch {
    // Trình duyệt chặn storage: chỉ mất khả năng khôi phục phiên khi tải lại trang.
  }
}

function hasSessionHint(): boolean {
  try {
    return storage()?.getItem(SESSION_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

function broadcast(type: 'login' | 'logout'): void {
  channel?.postMessage({ type });
}

function clearSession(): void {
  accessToken = null;
  accessTokenExpiresAt = 0;
  setSessionHint(false);
  setState({ status: 'anonymous', user: null });
}

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAuthState(): AuthState {
  return state;
}

/** Chờ tới khi biết trình duyệt có phiên đăng nhập hay không (hết trạng thái `loading`). */
export function waitForAuth(): Promise<AuthState> {
  if (state.status !== 'loading') return Promise.resolve(state);
  return new Promise((resolve) => {
    const unsubscribe = subscribeAuth(() => {
      if (state.status === 'loading') return;
      unsubscribe();
      resolve(state);
    });
  });
}

/** Áp dụng phiên mới nhận từ login/register/refresh. */
export function applySession(session: AuthSessionResponse, notifyOtherTabs = true): void {
  accessToken = session.accessToken;
  accessTokenExpiresAt = Date.parse(session.accessTokenExpiresAt);
  setSessionHint(true);
  setState({ status: 'authenticated', user: session.user });
  if (notifyOtherTabs) broadcast('login');
}

/** Cập nhật thông tin người dùng sau khi sửa hồ sơ / xác minh email. */
export function updateCurrentUser(user: CurrentUser): void {
  if (state.status === 'authenticated' && state.user?.id === user.id) {
    setState({ status: 'authenticated', user });
  }
}

async function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  return locks ? locks.request(REFRESH_LOCK, task) : task();
}

/**
 * Làm mới access token bằng refresh cookie. Trả `false` (và xóa phiên) khi phiên đã hết.
 * Các lời gọi đồng thời trong cùng tab dùng chung một request.
 */
export function refreshSession(): Promise<boolean> {
  refreshing ??= runExclusive(async () => {
    try {
      const session = await httpRequest('/auth/refresh', {
        method: 'POST',
        schema: authSessionResponseSchema,
      });
      applySession(session, false);
      return true;
    } catch (error) {
      // Lỗi mạng: giữ nguyên trạng thái để thử lại sau, không đăng xuất người dùng.
      if (error instanceof ApiError && error.status === 0) {
        if (state.status === 'loading') setState({ status: 'anonymous', user: null });
        return false;
      }
      clearSession();
      return false;
    }
  }).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** Access token còn hạn, tự làm mới nếu sắp hết hạn; `null` khi chưa đăng nhập. */
export async function getAccessToken(): Promise<string | null> {
  if (state.status === 'anonymous') return null;
  if (accessToken && Date.now() < accessTokenExpiresAt - EXPIRY_MARGIN_MS) return accessToken;
  return (await refreshSession()) ? accessToken : null;
}

export async function logout(): Promise<void> {
  try {
    await httpRequest('/auth/logout', { method: 'POST' });
  } finally {
    clearSession();
    broadcast('logout');
  }
}

/** Đăng xuất cục bộ khi server báo phiên không còn hiệu lực. */
export function handleSessionExpired(): void {
  clearSession();
}

/** Gọi một lần khi ứng dụng khởi động: khôi phục phiên và đồng bộ đăng nhập/đăng xuất giữa các tab. */
export function initAuthSession(): void {
  if (typeof BroadcastChannel !== 'undefined' && !channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.data.type === 'logout') clearSession();
      if (event.data.type === 'login') void refreshSession();
    };
  }
  if (hasSessionHint()) {
    void refreshSession();
  } else {
    setState({ status: 'anonymous', user: null });
  }
}

/** Chỉ dùng trong test: đưa store về trạng thái ban đầu. */
export function resetAuthSessionForTests(): void {
  channel?.close();
  channel = null;
  accessToken = null;
  accessTokenExpiresAt = 0;
  refreshing = null;
  listeners.clear();
  state = { status: 'loading', user: null };
}
