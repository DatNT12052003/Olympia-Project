import { type EntityManager, IsNull } from 'typeorm';
import { AuthSessionEntity, type SessionRevokedReason } from './auth-session.entity';

/** Sự kiện phát ra sau khi phiên bị thu hồi, để tầng realtime ngắt kết nối tương ứng. */
export interface SessionsRevokedEvent {
  userId: string;
  /** Có giá trị khi chỉ thu hồi một phiên; bỏ trống = mọi phiên của người dùng. */
  sessionId?: string;
  /** Phiên được giữ lại (đổi mật khẩu giữ phiên hiện tại). */
  exceptSessionId?: string;
  reason: SessionRevokedReason;
}

export type SessionsRevokedListener = (event: SessionsRevokedEvent) => void;

/**
 * Thu hồi phiên trong transaction đang chạy. Access token đang lưu hành mất hiệu lực ngay vì
 * mỗi request đều kiểm tra phiên (BR-AUTH-02).
 */
export async function revokeSessions(
  manager: EntityManager,
  event: SessionsRevokedEvent,
  now: Date,
): Promise<void> {
  const query = manager
    .createQueryBuilder()
    .update(AuthSessionEntity)
    .set({ revokedAt: now, revokedReason: event.reason })
    .where('user_id = :userId AND revoked_at IS NULL', { userId: event.userId });
  if (event.sessionId) query.andWhere('id = :sessionId', { sessionId: event.sessionId });
  if (event.exceptSessionId) query.andWhere('id <> :except', { except: event.exceptSessionId });
  await query.execute();
}

export async function findActiveSession(
  manager: EntityManager,
  sessionId: string,
  now: Date,
): Promise<AuthSessionEntity | null> {
  const session = await manager.findOneBy(AuthSessionEntity, {
    id: sessionId,
    revokedAt: IsNull(),
  });
  return session && session.expiresAt > now ? session : null;
}
