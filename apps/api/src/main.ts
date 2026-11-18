import 'reflect-metadata';
import { createServer } from 'node:http';
import { createAdapter } from '@socket.io/redis-adapter';
import { createApp } from './app';
import { loadEnv } from './config/env';
import { createDataSource } from './infrastructure/database/data-source';
import { createRedisLimiterFactory } from './infrastructure/rate-limit/rate-limiter';
import { createRedisClient } from './infrastructure/redis/redis-client';
import { createAuthService } from './modules/auth/auth.service';
import { createArgon2PasswordHasher } from './modules/auth/password-hasher';
import type { SessionsRevokedEvent } from './modules/auth/session-store';
import { createTokenService } from './modules/auth/token-service';
import { createHealthService } from './modules/health/health.service';
import { createOrganizationsService } from './modules/organizations/organizations.service';
import {
  createRealtimeServer,
  createTokenSocketAuthenticator,
  disconnectRevokedSessions,
  type RealtimeServer,
} from './modules/realtime/realtime-server';
import { createAdminUsersService } from './modules/users/admin-users.service';
import { createUsersService } from './modules/users/users.service';
import { createLogger } from './shared/logging/logger';
import { createSmtpMailer } from './shared/mail/mailer';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(env);

  const dataSource = createDataSource(env.DATABASE_URL);
  await dataSource.initialize();

  const redis = createRedisClient(env.REDIS_URL);
  const redisPub = redis.duplicate();
  const redisSub = redis.duplicate();
  await Promise.all([redis.connect(), redisPub.connect(), redisSub.connect()]);

  const healthService = createHealthService({
    database: () => dataSource.query('SELECT 1'),
    redis: () => redis.ping(),
  });

  // Realtime server tạo sau HTTP app; sự kiện thu hồi phiên chỉ phát sau khi đã khởi động.
  const realtimeRef: { io?: RealtimeServer } = {};
  const onSessionsRevoked = (event: SessionsRevokedEvent) => {
    if (realtimeRef.io) disconnectRevokedSessions(realtimeRef.io, event);
  };

  const authService = createAuthService({
    dataSource,
    tokens: createTokenService({
      secret: env.JWT_SECRET,
      accessTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
      guestSessionTtlHours: env.GUEST_SESSION_TTL_HOURS,
    }),
    passwords: await createArgon2PasswordHasher(),
    mailer: createSmtpMailer(env.SMTP_URL, env.MAIL_FROM),
    limiters: createRedisLimiterFactory(redis),
    logger,
    config: {
      appUrl: env.APP_URL,
      refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
      loginMaxFailures: env.LOGIN_MAX_FAILURES,
      loginFailureWindowMinutes: env.LOGIN_FAILURE_WINDOW_MINUTES,
    },
    onSessionsRevoked,
  });
  const organizationsService = createOrganizationsService(dataSource);

  const app = createApp({
    env,
    logger,
    healthService,
    authService,
    usersService: createUsersService(dataSource),
    adminUsersService: createAdminUsersService({ dataSource, authService, organizationsService }),
    organizationsService,
  });
  const httpServer = createServer(app);
  const realtime = createRealtimeServer(httpServer, {
    corsOrigins: env.CORS_ORIGINS,
    authenticate: createTokenSocketAuthenticator((token) => authService.resolveAccessToken(token)),
    logger,
    adapter: createAdapter(redisPub, redisSub),
  });
  realtimeRef.io = realtime;

  httpServer.listen(env.PORT, () => {
    logger.info(`API đang chạy tại http://localhost:${env.PORT}`);
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Đang tắt server');

    const forceExit = setTimeout(() => {
      logger.error('Quá thời gian tắt server, buộc thoát');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    // io.close() đóng mọi kết nối realtime và cả HTTP server.
    void realtime.close(() => {
      Promise.all([dataSource.destroy(), redis.quit(), redisPub.quit(), redisSub.quit()])
        .then(() => {
          logger.info('Đã tắt server');
          process.exit(0);
        })
        .catch((error: unknown) => {
          logger.error({ err: error }, 'Lỗi khi tắt server');
          process.exit(1);
        });
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  console.error('Không khởi động được API:', error);
  process.exit(1);
});
