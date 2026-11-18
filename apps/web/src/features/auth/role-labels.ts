import type { SystemRole } from '@olympia/shared';

export const ROLE_LABELS: Record<SystemRole, string> = {
  member: 'Host',
  manager: 'Manager',
  super_admin: 'Super Admin',
};

/** Tài khoản thường là Host (BR-AUTH-01); bị thu hồi quyền Host thì chỉ còn là người chơi. */
export function roleLabel(user: { systemRole: SystemRole; canHost: boolean }): string {
  if (user.systemRole === 'member' && !user.canHost) return 'Người chơi';
  return ROLE_LABELS[user.systemRole];
}
