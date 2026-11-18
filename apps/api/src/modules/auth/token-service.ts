import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { UnauthenticatedError } from '../../shared/errors/app-error';

const ISSUER = 'olympia-api';
/** Audience khác nhau để token phiên khách (cookie) không dùng được như access token và ngược lại. */
const ACCESS_AUDIENCE = 'olympia:access';
const GUEST_SESSION_AUDIENCE = 'olympia:guest-session';

const accessClaimsSchema = z.discriminatedUnion('typ', [
  z.object({ typ: z.literal('user'), sub: z.uuid(), sid: z.uuid() }),
  z.object({ typ: z.literal('guest'), sub: z.uuid(), name: z.string() }),
]);

const guestSessionClaimsSchema = z.object({
  typ: z.literal('guest_session'),
  sub: z.uuid(),
  name: z.string(),
  exp: z.number(),
});

export type AccessClaims =
  | { kind: 'user'; userId: string; sessionId: string }
  | { kind: 'guest'; guestId: string; displayName: string };

export interface SignedToken {
  token: string;
  expiresAt: Date;
}

export interface GuestSessionClaims {
  guestId: string;
  displayName: string;
  expiresAt: Date;
}

export interface TokenServiceOptions {
  secret: string;
  accessTtlSeconds: number;
  guestSessionTtlHours: number;
  now?: () => Date;
}

/** Ký và kiểm tra JWT (HS256) cho access token và phiên khách. */
export function createTokenService({
  secret,
  accessTtlSeconds,
  guestSessionTtlHours,
  now = () => new Date(),
}: TokenServiceOptions) {
  function sign(
    payload: Record<string, unknown>,
    audience: string,
    ttlSeconds: number,
  ): SignedToken {
    const issuedAt = Math.floor(now().getTime() / 1000);
    const exp = issuedAt + ttlSeconds;
    const token = jwt.sign({ ...payload, iat: issuedAt, exp, jti: randomUUID() }, secret, {
      algorithm: 'HS256',
      issuer: ISSUER,
      audience,
    });
    return { token, expiresAt: new Date(exp * 1000) };
  }

  function verify(token: string, audience: string): unknown {
    try {
      return jwt.verify(token, secret, {
        algorithms: ['HS256'],
        issuer: ISSUER,
        audience,
        clockTimestamp: Math.floor(now().getTime() / 1000),
      });
    } catch {
      throw new UnauthenticatedError('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
    }
  }

  return {
    signUserAccess(userId: string, sessionId: string): SignedToken {
      return sign({ typ: 'user', sub: userId, sid: sessionId }, ACCESS_AUDIENCE, accessTtlSeconds);
    },

    /** Access token của khách không sống lâu hơn phiên khách. */
    signGuestAccess(session: GuestSessionClaims): SignedToken {
      const remaining = Math.floor((session.expiresAt.getTime() - now().getTime()) / 1000);
      return sign(
        { typ: 'guest', sub: session.guestId, name: session.displayName },
        ACCESS_AUDIENCE,
        Math.max(1, Math.min(accessTtlSeconds, remaining)),
      );
    },

    verifyAccess(token: string): AccessClaims {
      const parsed = accessClaimsSchema.safeParse(verify(token, ACCESS_AUDIENCE));
      if (!parsed.success) throw new UnauthenticatedError('Access token không hợp lệ.');
      const claims = parsed.data;
      return claims.typ === 'user'
        ? { kind: 'user', userId: claims.sub, sessionId: claims.sid }
        : { kind: 'guest', guestId: claims.sub, displayName: claims.name };
    },

    /** Tạo phiên khách mới hoặc đổi tên (giữ hạn cũ khi `expiresAt` được truyền vào). */
    signGuestSession(guestId: string, displayName: string, expiresAt?: Date): SignedToken {
      const ttl = expiresAt
        ? Math.floor((expiresAt.getTime() - now().getTime()) / 1000)
        : guestSessionTtlHours * 3600;
      return sign(
        { typ: 'guest_session', sub: guestId, name: displayName },
        GUEST_SESSION_AUDIENCE,
        ttl,
      );
    },

    verifyGuestSession(token: string): GuestSessionClaims {
      const parsed = guestSessionClaimsSchema.safeParse(verify(token, GUEST_SESSION_AUDIENCE));
      if (!parsed.success) throw new UnauthenticatedError('Phiên khách không hợp lệ.');
      return {
        guestId: parsed.data.sub,
        displayName: parsed.data.name,
        expiresAt: new Date(parsed.data.exp * 1000),
      };
    },
  };
}

export type TokenService = ReturnType<typeof createTokenService>;
