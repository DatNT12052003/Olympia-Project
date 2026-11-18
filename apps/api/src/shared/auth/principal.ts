import type { SystemRole } from '@olympia/shared';

/**
 * Danh tính đã xác thực của một request REST hoặc kết nối realtime.
 * Thông tin vai trò được đọc lại từ DB mỗi lần xác thực, nên thay đổi quyền có hiệu lực ngay.
 */
export interface UserPrincipal {
  kind: 'user';
  userId: string;
  sessionId: string;
  systemRole: SystemRole;
  emailVerified: boolean;
  canHost: boolean;
  organizationId: string | null;
}

/** Khách vào phòng không cần tài khoản (BR-AUTH-05). */
export interface GuestPrincipal {
  kind: 'guest';
  guestId: string;
  displayName: string;
  /** Phòng mà phiên khách được cấp cho (DL-028). */
  roomId: string;
}

export type Principal = UserPrincipal | GuestPrincipal;

/** Giải mã access token thành principal; ném `UnauthenticatedError` khi token/phiên không hợp lệ. */
export type AccessTokenResolver = (accessToken: string) => Promise<Principal>;

/** Id dùng làm khóa ổn định cho principal (tài khoản hoặc phiên khách). */
export function principalId(principal: Principal): string {
  return principal.kind === 'user' ? principal.userId : principal.guestId;
}
