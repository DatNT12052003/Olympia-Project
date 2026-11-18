import { randomUUID } from 'node:crypto';
import {
  AuthErrorCode,
  EMAIL_VERIFICATION_TTL_HOURS,
  type LoginFailureDetails,
  PASSWORD_RESET_TTL_MINUTES,
  type CurrentUser,
  type changePasswordRequestSchema,
  type guestSessionRequestSchema,
  type loginRequestSchema,
  type registerRequestSchema,
  type resetPasswordRequestSchema,
} from '@olympia/shared';
import type { Logger } from 'pino';
import { type DataSource, type EntityManager, IsNull, QueryFailedError } from 'typeorm';
import type { z } from 'zod';
import type { LimiterFactory } from '../../infrastructure/rate-limit/rate-limiter';
import type { Principal, UserPrincipal } from '../../shared/auth/principal';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  TooManyRequestsError,
  UnauthenticatedError,
} from '../../shared/errors/app-error';
import type { Mailer, MailMessage } from '../../shared/mail/mailer';
import { UserEntity } from '../users/user.entity';
import { toCurrentUser } from '../users/user.mapper';
import { passwordResetEmail, verificationEmail } from './auth.mails';
import { AuthSessionEntity } from './auth-session.entity';
import type { PasswordHasher } from './password-hasher';
import { RefreshTokenEntity } from './refresh-token.entity';
import { generateOpaqueToken, hashOpaqueToken } from './secure-token';
import {
  findActiveSession,
  revokeSessions,
  type SessionsRevokedEvent,
  type SessionsRevokedListener,
} from './session-store';
import type { TokenService } from './token-service';
import { type UserActionPurpose, UserActionTokenEntity } from './user-action-token.entity';

const EMAIL_VERIFICATION_TTL_MS = EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = PASSWORD_RESET_TTL_MINUTES * 60 * 1000;
const PG_UNIQUE_VIOLATION = '23505';

export interface RequestMeta {
  ip: string | undefined;
  userAgent: string | undefined;
}

/** Kết quả đăng nhập/làm mới: access token cho body, refresh token cho cookie. */
export interface IssuedSession {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: CurrentUser;
}

export interface IssuedGuestSession {
  accessToken: string;
  accessTokenExpiresAt: Date;
  sessionToken: string;
  sessionExpiresAt: Date;
  guest: { id: string; displayName: string };
}

export interface AuthServiceConfig {
  /** URL giao diện web để tạo link trong email. */
  appUrl: string;
  refreshTokenTtlDays: number;
  loginMaxFailures: number;
  loginFailureWindowMinutes: number;
}

export interface AuthServiceDeps {
  dataSource: DataSource;
  tokens: TokenService;
  passwords: PasswordHasher;
  mailer: Mailer;
  limiters: LimiterFactory;
  logger: Logger;
  config: AuthServiceConfig;
  onSessionsRevoked?: SessionsRevokedListener;
  now?: () => Date;
}

function invalidCredentials(details: LoginFailureDetails): UnauthenticatedError {
  return new UnauthenticatedError(
    'Email hoặc mật khẩu không đúng.',
    AuthErrorCode.InvalidCredentials,
    details,
  );
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string } | undefined)?.code === PG_UNIQUE_VIOLATION
  );
}

export function createAuthService(deps: AuthServiceDeps) {
  const { dataSource, tokens, passwords, mailer, logger, config } = deps;
  const now = deps.now ?? (() => new Date());
  const refreshTtlMs = config.refreshTokenTtlDays * 24 * 60 * 60 * 1000;
  const windowSeconds = config.loginFailureWindowMinutes * 60;

  // BR-AUTH-03: sai liên tiếp theo email + IP. Thêm giới hạn rộng hơn theo email (chống dò
  // mật khẩu phân tán) và theo IP (chống credential stuffing) mà không cho kẻ xấu khóa hẳn
  // tài khoản người khác chỉ bằng vài lần thử.
  const loginByEmailIp = deps.limiters({
    keyPrefix: 'login:email-ip',
    points: config.loginMaxFailures,
    durationSeconds: windowSeconds,
  });
  const loginByEmail = deps.limiters({
    keyPrefix: 'login:email',
    points: config.loginMaxFailures * 4,
    durationSeconds: windowSeconds,
  });
  const loginByIp = deps.limiters({
    keyPrefix: 'login:ip',
    points: 100,
    durationSeconds: windowSeconds,
  });
  const registerByIp = deps.limiters({
    keyPrefix: 'register:ip',
    points: 10,
    durationSeconds: 3600,
  });
  const mailByIp = deps.limiters({ keyPrefix: 'mail:ip', points: 10, durationSeconds: 900 });
  const mailByEmail = deps.limiters({ keyPrefix: 'mail:email', points: 3, durationSeconds: 3600 });

  async function enforce(retryAfter: Promise<number | null>): Promise<void> {
    const seconds = await retryAfter;
    if (seconds !== null) throw new TooManyRequestsError(seconds);
  }

  function emitRevoked(event: SessionsRevokedEvent): void {
    try {
      deps.onSessionsRevoked?.(event);
    } catch (error) {
      logger.error({ err: error }, 'Lỗi khi xử lý sự kiện thu hồi phiên');
    }
  }

  /** Gửi email không chặn request; lỗi gửi chỉ ghi log (không lộ cho client). */
  function sendMail(message: MailMessage): void {
    mailer.send(message).catch((error: unknown) => {
      logger.error({ err: error, subject: message.subject }, 'Gửi email thất bại');
    });
  }

  async function createActionToken(
    manager: EntityManager,
    userId: string,
    purpose: UserActionPurpose,
    ttlMs: number,
  ): Promise<string> {
    const current = now();
    // Mỗi thời điểm chỉ một token còn hiệu lực cho mỗi mục đích.
    await manager.update(
      UserActionTokenEntity,
      { userId, purpose, usedAt: IsNull() },
      { usedAt: current },
    );
    const token = generateOpaqueToken();
    await manager.insert(UserActionTokenEntity, {
      userId,
      purpose,
      tokenHash: hashOpaqueToken(token),
      expiresAt: new Date(current.getTime() + ttlMs),
    });
    return token;
  }

  /** Đánh dấu token đã dùng (nguyên tử) và trả về userId; token sai/hết hạn/đã dùng => lỗi. */
  async function consumeActionToken(
    manager: EntityManager,
    token: string,
    purpose: UserActionPurpose,
  ): Promise<string> {
    const current = now();
    const result = await manager
      .createQueryBuilder()
      .update(UserActionTokenEntity)
      .set({ usedAt: current })
      .where(
        'token_hash = :hash AND purpose = :purpose AND used_at IS NULL AND expires_at > :now',
        {
          hash: hashOpaqueToken(token),
          purpose,
          now: current,
        },
      )
      .returning('user_id')
      .execute();
    const row = (result.raw as { user_id: string }[])[0];
    if (!row) {
      throw new BadRequestError(
        'Liên kết không hợp lệ hoặc đã hết hạn.',
        AuthErrorCode.InvalidActionToken,
      );
    }
    return row.user_id;
  }

  async function sendVerificationEmail(manager: EntityManager, user: UserEntity): Promise<void> {
    const token = await createActionToken(
      manager,
      user.id,
      'email_verification',
      EMAIL_VERIFICATION_TTL_MS,
    );
    const url = `${config.appUrl}/xac-minh-email?token=${encodeURIComponent(token)}`;
    sendMail(verificationEmail(user.email, user.displayName, url));
  }

  /** Gửi email đặt lại mật khẩu (người dùng tự yêu cầu hoặc quản trị viên kích hoạt). */
  async function sendPasswordReset(user: UserEntity): Promise<void> {
    const token = await dataSource.transaction((manager) =>
      createActionToken(manager, user.id, 'password_reset', PASSWORD_RESET_TTL_MS),
    );
    const url = `${config.appUrl}/dat-lai-mat-khau?token=${encodeURIComponent(token)}`;
    sendMail(passwordResetEmail(user.email, user.displayName, url));
  }

  async function issueSession(
    manager: EntityManager,
    user: UserEntity,
    meta: RequestMeta,
  ): Promise<IssuedSession> {
    const current = now();
    const refreshTokenExpiresAt = new Date(current.getTime() + refreshTtlMs);
    const session = manager.create(AuthSessionEntity, {
      userId: user.id,
      userAgent: meta.userAgent?.slice(0, 500) ?? null,
      ip: meta.ip?.slice(0, 64) ?? null,
      lastUsedAt: current,
      expiresAt: refreshTokenExpiresAt,
    });
    await manager.save(session);
    const refreshToken = generateOpaqueToken();
    await manager.insert(RefreshTokenEntity, {
      sessionId: session.id,
      tokenHash: hashOpaqueToken(refreshToken),
    });
    const access = tokens.signUserAccess(user.id, session.id);
    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken,
      refreshTokenExpiresAt,
      user: toCurrentUser(user),
    };
  }

  async function findUserByEmailWithPassword(email: string): Promise<UserEntity | null> {
    return dataSource
      .getRepository(UserEntity)
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email', { email })
      .getOne();
  }

  return {
    async register(
      input: z.output<typeof registerRequestSchema>,
      meta: RequestMeta,
    ): Promise<IssuedSession> {
      await enforce(registerByIp.consume(meta.ip ?? 'unknown'));
      const passwordHash = await passwords.hash(input.password);
      try {
        return await dataSource.transaction(async (manager) => {
          const user = manager.create(UserEntity, {
            email: input.email,
            passwordHash,
            displayName: input.displayName,
            privacyAcceptedAt: now(),
          });
          await manager.save(user);
          await sendVerificationEmail(manager, user);
          return issueSession(manager, user, meta);
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictError('Email đã được đăng ký.', AuthErrorCode.EmailTaken);
        }
        throw error;
      }
    },

    async login(
      input: z.output<typeof loginRequestSchema>,
      meta: RequestMeta,
    ): Promise<IssuedSession> {
      const ip = meta.ip ?? 'unknown';
      const emailIpKey = `${input.email}|${ip}`;
      for (const blocked of await Promise.all([
        loginByEmailIp.blockedFor(emailIpKey),
        loginByEmail.blockedFor(input.email),
        loginByIp.blockedFor(ip),
      ])) {
        if (blocked !== null) {
          throw new TooManyRequestsError(
            blocked,
            'Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau.',
          );
        }
      }

      const user = await findUserByEmailWithPassword(input.email);
      const valid = user
        ? await passwords.verify(user.passwordHash, input.password)
        : (await passwords.verifyDummy(input.password), false);

      if (!user || !valid) {
        await Promise.all([
          loginByEmailIp.consume(emailIpKey),
          loginByEmail.consume(input.email),
          loginByIp.consume(ip),
        ]);
        // Cùng một phản hồi dù email có tồn tại hay không (đếm theo email + IP).
        throw invalidCredentials({
          remainingAttempts: await loginByEmailIp.remaining(emailIpKey),
          lockoutMinutes: config.loginFailureWindowMinutes,
        });
      }

      // Chỉ báo khóa khi mật khẩu đúng, để không lộ trạng thái tài khoản cho người đoán mò.
      if (user.status === 'locked') {
        throw new ForbiddenError('Tài khoản đã bị khóa.', AuthErrorCode.AccountLocked);
      }

      await loginByEmailIp.reset(emailIpKey);
      return dataSource.transaction((manager) => issueSession(manager, user, meta));
    },

    /**
     * Xoay vòng refresh token. Dùng lại token đã xoay (dấu hiệu bị đánh cắp) thu hồi cả phiên.
     */
    async refresh(refreshToken: string | undefined): Promise<IssuedSession> {
      if (!refreshToken) throw new UnauthenticatedError();
      const tokenHash = hashOpaqueToken(refreshToken);

      const outcome = await dataSource.transaction(async (manager) => {
        const current = now();
        const marked = await manager
          .createQueryBuilder()
          .update(RefreshTokenEntity)
          .set({ usedAt: current })
          .where('token_hash = :tokenHash AND used_at IS NULL', { tokenHash })
          .returning('session_id')
          .execute();
        const sessionId = (marked.raw as { session_id: string }[])[0]?.session_id;

        if (!sessionId) {
          const reused = await manager.findOneBy(RefreshTokenEntity, { tokenHash });
          if (!reused) return { kind: 'invalid' as const };
          const session = await manager.findOneBy(AuthSessionEntity, { id: reused.sessionId });
          if (!session) return { kind: 'invalid' as const };
          const event: SessionsRevokedEvent = {
            userId: session.userId,
            sessionId: session.id,
            reason: 'refresh_reuse',
          };
          await revokeSessions(manager, event, current);
          return { kind: 'reused' as const, event };
        }

        const session = await findActiveSession(manager, sessionId, current);
        const user = session ? await manager.findOneBy(UserEntity, { id: session.userId }) : null;
        if (!session || !user || user.status !== 'active') return { kind: 'invalid' as const };

        const nextToken = generateOpaqueToken();
        await manager.insert(RefreshTokenEntity, {
          sessionId: session.id,
          tokenHash: hashOpaqueToken(nextToken),
        });
        // Phiên trượt: mỗi lần làm mới gia hạn thêm một chu kỳ.
        const refreshTokenExpiresAt = new Date(current.getTime() + refreshTtlMs);
        await manager.update(
          AuthSessionEntity,
          { id: session.id },
          { lastUsedAt: current, expiresAt: refreshTokenExpiresAt },
        );
        const access = tokens.signUserAccess(user.id, session.id);
        return {
          kind: 'ok' as const,
          issued: {
            accessToken: access.token,
            accessTokenExpiresAt: access.expiresAt,
            refreshToken: nextToken,
            refreshTokenExpiresAt,
            user: toCurrentUser(user),
          },
        };
      });

      if (outcome.kind === 'reused') {
        logger.warn({ userId: outcome.event.userId }, 'Phát hiện dùng lại refresh token');
        emitRevoked(outcome.event);
      }
      if (outcome.kind !== 'ok') {
        throw new UnauthenticatedError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      }
      return outcome.issued;
    },

    async logout(refreshToken: string | undefined): Promise<void> {
      if (!refreshToken) return;
      const event = await dataSource.transaction(async (manager) => {
        const token = await manager.findOneBy(RefreshTokenEntity, {
          tokenHash: hashOpaqueToken(refreshToken),
        });
        const session = token
          ? await manager.findOneBy(AuthSessionEntity, { id: token.sessionId })
          : null;
        if (!session || session.revokedAt) return null;
        const revoked: SessionsRevokedEvent = {
          userId: session.userId,
          sessionId: session.id,
          reason: 'logout',
        };
        await revokeSessions(manager, revoked, now());
        return revoked;
      });
      if (event) emitRevoked(event);
    },

    async verifyEmail(token: string): Promise<CurrentUser> {
      return dataSource.transaction(async (manager) => {
        const userId = await consumeActionToken(manager, token, 'email_verification');
        const user = await manager.findOneByOrFail(UserEntity, { id: userId });
        if (!user.emailVerifiedAt) {
          user.emailVerifiedAt = now();
          await manager.save(user);
        }
        return toCurrentUser(user);
      });
    },

    async resendVerification(principal: UserPrincipal, meta: RequestMeta): Promise<void> {
      if (principal.emailVerified) {
        throw new ConflictError('Email đã được xác minh.', AuthErrorCode.EmailAlreadyVerified);
      }
      await enforce(mailByIp.consume(meta.ip ?? 'unknown'));
      await enforce(mailByEmail.consume(`verify:${principal.userId}`));
      await dataSource.transaction(async (manager) => {
        const user = await manager.findOneByOrFail(UserEntity, { id: principal.userId });
        await sendVerificationEmail(manager, user);
      });
    },

    /** Luôn thành công với client để không lộ email nào đã đăng ký. */
    async forgotPassword(email: string, meta: RequestMeta): Promise<void> {
      await enforce(mailByIp.consume(meta.ip ?? 'unknown'));
      if ((await mailByEmail.consume(`reset:${email}`)) !== null) return;

      const user = await dataSource.getRepository(UserEntity).findOneBy({ email });
      if (!user || user.status !== 'active') return;
      await sendPasswordReset(user);
    },

    sendPasswordReset,

    /** Quản trị viên gửi lại email xác minh cho người dùng. */
    async sendVerificationEmailTo(user: UserEntity): Promise<void> {
      if (user.emailVerifiedAt) {
        throw new ConflictError('Email đã được xác minh.', AuthErrorCode.EmailAlreadyVerified);
      }
      await dataSource.transaction((manager) => sendVerificationEmail(manager, user));
    },

    async resetPassword(input: z.output<typeof resetPasswordRequestSchema>): Promise<void> {
      const passwordHash = await passwords.hash(input.password);
      const event = await dataSource.transaction(async (manager) => {
        const userId = await consumeActionToken(manager, input.token, 'password_reset');
        // Đặt lại qua email cũng chứng minh sở hữu email.
        await manager
          .createQueryBuilder()
          .update(UserEntity)
          .set({ passwordHash, emailVerifiedAt: () => 'COALESCE(email_verified_at, now())' })
          .where('id = :userId', { userId })
          .execute();
        const revoked: SessionsRevokedEvent = { userId, reason: 'password_reset' };
        await revokeSessions(manager, revoked, now());
        return revoked;
      });
      emitRevoked(event);
    },

    /** Đổi mật khẩu: giữ phiên hiện tại, đăng xuất mọi thiết bị khác. */
    async changePassword(
      principal: UserPrincipal,
      input: z.output<typeof changePasswordRequestSchema>,
    ): Promise<void> {
      const user = await dataSource
        .getRepository(UserEntity)
        .createQueryBuilder('u')
        .addSelect('u.passwordHash')
        .where('u.id = :id', { id: principal.userId })
        .getOneOrFail();
      if (!(await passwords.verify(user.passwordHash, input.currentPassword))) {
        throw new BadRequestError(
          'Mật khẩu hiện tại không đúng.',
          AuthErrorCode.InvalidCredentials,
        );
      }
      const passwordHash = await passwords.hash(input.newPassword);
      const event: SessionsRevokedEvent = {
        userId: principal.userId,
        exceptSessionId: principal.sessionId,
        reason: 'password_changed',
      };
      await dataSource.transaction(async (manager) => {
        await manager.update(UserEntity, { id: principal.userId }, { passwordHash });
        await revokeSessions(manager, event, now());
      });
      emitRevoked(event);
    },

    /**
     * Tạo hoặc làm mới phiên khách (BR-AUTH-05). Cookie phiên khách còn hạn được dùng lại
     * để khách kết nối lại với cùng danh tính; truyền tên mới để đổi tên hiển thị.
     */
    issueGuestSession(
      existingSessionToken: string | undefined,
      input: z.output<typeof guestSessionRequestSchema>,
    ): IssuedGuestSession {
      let existing: ReturnType<TokenService['verifyGuestSession']> | null = null;
      if (existingSessionToken) {
        try {
          existing = tokens.verifyGuestSession(existingSessionToken);
        } catch {
          existing = null;
        }
      }
      const displayName = input.displayName ?? existing?.displayName;
      if (!displayName) {
        throw new BadRequestError('Cần nhập tên hiển thị để tham gia với tư cách khách.');
      }
      const guestId = existing?.guestId ?? randomUUID();
      const session = tokens.signGuestSession(guestId, displayName, existing?.expiresAt);
      const access = tokens.signGuestAccess({
        guestId,
        displayName,
        expiresAt: session.expiresAt,
      });
      return {
        accessToken: access.token,
        accessTokenExpiresAt: access.expiresAt,
        sessionToken: session.token,
        sessionExpiresAt: session.expiresAt,
        guest: { id: guestId, displayName },
      };
    },

    /**
     * Xác thực access token cho cả REST và realtime. Với tài khoản, đọc lại phiên + người dùng
     * từ DB để phiên bị thu hồi / tài khoản bị khóa mất quyền ngay (BR-AUTH-02).
     */
    async resolveAccessToken(accessToken: string): Promise<Principal> {
      const claims = tokens.verifyAccess(accessToken);
      if (claims.kind === 'guest') {
        return { kind: 'guest', guestId: claims.guestId, displayName: claims.displayName };
      }
      const user = await dataSource
        .getRepository(UserEntity)
        .createQueryBuilder('u')
        .innerJoin(AuthSessionEntity, 's', 's.userId = u.id')
        .where('u.id = :userId AND s.id = :sessionId', claims)
        .andWhere('s.revokedAt IS NULL AND s.expiresAt > :now', { now: now() })
        .andWhere("u.status = 'active'")
        .getOne();
      if (!user) throw new UnauthenticatedError('Phiên đăng nhập đã kết thúc.');
      return {
        kind: 'user',
        userId: user.id,
        sessionId: claims.sessionId,
        systemRole: user.systemRole,
        emailVerified: user.emailVerifiedAt !== null,
        canHost: user.canHost,
        organizationId: user.organizationId,
      };
    },

    /** Thu hồi mọi phiên của người dùng trong transaction của module khác (khóa tài khoản). */
    revokeAllSessions(
      manager: EntityManager,
      userId: string,
      reason: SessionsRevokedEvent['reason'],
    ): Promise<SessionsRevokedEvent> {
      const event: SessionsRevokedEvent = { userId, reason };
      return revokeSessions(manager, event, now()).then(() => event);
    },

    /** Gọi sau khi transaction chứa `revokeAllSessions` đã commit. */
    notifySessionsRevoked: emitRevoked,
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
