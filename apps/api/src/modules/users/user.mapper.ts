import type { AdminUser, CurrentUser } from '@olympia/shared';
import type { UserEntity } from './user.entity';

export function toCurrentUser(user: UserEntity): CurrentUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    emailVerified: user.emailVerifiedAt !== null,
    systemRole: user.systemRole,
    canHost: user.canHost,
    organizationId: user.organizationId,
  };
}

export function toAdminUser(user: UserEntity, lastActiveAt: Date | null): AdminUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    emailVerified: user.emailVerifiedAt !== null,
    systemRole: user.systemRole,
    canHost: user.canHost,
    status: user.status,
    lockedAt: user.lockedAt?.toISOString() ?? null,
    lockedReason: user.lockedReason,
    organizationId: user.organizationId,
    createdAt: user.createdAt.toISOString(),
    lastActiveAt: lastActiveAt?.toISOString() ?? null,
  };
}
