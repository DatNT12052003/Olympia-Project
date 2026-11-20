import { type GuestSessionResponse, guestSessionResponseSchema } from '@olympia/shared';
import type { TokenSource } from './api-client';
import { ApiError, httpRequest } from './http';

/**
 * Phiên khách (DL-028): mỗi phiên gắn với đúng một phòng. Access token chỉ nằm trong bộ nhớ;
 * cookie phiên khách HttpOnly do server đặt. Cờ `olympia.guestRoom` (không nhạy cảm) ghi phòng
 * của phiên để khôi phục sau khi tải lại trang.
 */

const GUEST_ROOM_KEY = 'olympia.guestRoom';
const EXPIRY_MARGIN_MS = 30_000;

interface GuestState {
  roomId: string;
  displayName: string;
  accessToken: string;
  expiresAt: number;
}

let current: GuestState | null = null;
let refreshing: Promise<GuestState | null> | null = null;

function readHint(): string | null {
  try {
    return window.localStorage.getItem(GUEST_ROOM_KEY);
  } catch {
    return null;
  }
}

function writeHint(roomId: string | null): void {
  try {
    if (roomId) window.localStorage.setItem(GUEST_ROOM_KEY, roomId);
    else window.localStorage.removeItem(GUEST_ROOM_KEY);
  } catch {
    // Trình duyệt chặn storage: chỉ mất khả năng khôi phục phiên khách khi tải lại trang.
  }
}

/** Áp dụng phiên khách server vừa cấp khi vào phòng. */
export function applyGuestSession(session: GuestSessionResponse): void {
  current = {
    roomId: session.guest.roomId,
    displayName: session.guest.displayName,
    accessToken: session.accessToken,
    expiresAt: Date.parse(session.accessTokenExpiresAt),
  };
  writeHint(session.guest.roomId);
}

export function clearGuestSession(): void {
  current = null;
  writeHint(null);
}

/** Làm mới access token khách bằng cookie phiên khách. */
function refreshGuest(): Promise<GuestState | null> {
  refreshing ??= httpRequest('/auth/guest', { method: 'POST', schema: guestSessionResponseSchema })
    .then((session) => {
      applyGuestSession(session);
      return current;
    })
    .catch((error: unknown) => {
      // Lỗi mạng: giữ phiên để thử lại sau.
      if (!(error instanceof ApiError && error.status === 0)) clearGuestSession();
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/** Có thể còn phiên khách cho phòng này (để quyết định có thử khôi phục hay không). */
export function mayHaveGuestSession(roomId: string): boolean {
  return current?.roomId === roomId || readHint() === roomId;
}

/** Nguồn token khách của một phòng; `null` khi không có phiên khách cho phòng đó. */
export function guestTokenSource(roomId: string): TokenSource {
  return {
    async get() {
      if (!mayHaveGuestSession(roomId)) return null;
      if (current?.roomId === roomId && Date.now() < current.expiresAt - EXPIRY_MARGIN_MS) {
        return current.accessToken;
      }
      const next = await refreshGuest();
      return next?.roomId === roomId ? next.accessToken : null;
    },
    async refresh() {
      if (!mayHaveGuestSession(roomId)) return null;
      const next = await refreshGuest();
      return next?.roomId === roomId ? next.accessToken : null;
    },
  };
}

/** Chỉ dùng trong test. */
export function resetGuestSessionForTests(): void {
  current = null;
  refreshing = null;
}
