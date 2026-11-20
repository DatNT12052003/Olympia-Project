import { hasSystemPermission, type CurrentUser, type SystemPermission } from '@olympia/shared';
import { useSyncExternalStore } from 'react';
import { type AuthState, getAuthState, subscribeAuth } from '../../lib/auth-session';

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribeAuth, getAuthState, getAuthState);
}

/** Kiểm tra quyền để ẩn/hiện giao diện; backend vẫn là nơi quyết định (BR-ROLE-05). */
export function userHasPermission(
  user: CurrentUser | null | undefined,
  permission: SystemPermission,
): boolean {
  if (!user) return false;
  return hasSystemPermission(
    {
      kind: 'user',
      systemRole: user.systemRole,
      emailVerified: user.emailVerified,
      canHost: user.canHost,
    },
    permission,
  );
}
