import 'reflect-metadata';
import { createServer } from 'node:http';
import { createAdapter } from '@socket.io/redis-adapter';
import { createApp } from './app';
import { loadEnv } from './config/env';
import { createDataSource } from './infrastructure/database/data-source';
import { createRedisLimiterFactory } from './infrastructure/rate-limit/rate-limiter';
import { createRedisClient } from './infrastructure/redis/redis-client';
import { createS3ObjectStorage } from './infrastructure/storage/object-storage';
import { createAuthService } from './modules/auth/auth.service';
import { createArgon2PasswordHasher } from './modules/auth/password-hasher';
import type { SessionsRevokedEvent } from './modules/auth/session-store';
import { createTokenService } from './modules/auth/token-service';
import { createHealthService } from './modules/health/health.service';
import { createGameModule } from './modules/game/game.module';
import { createRedisMatchStore } from './modules/game/match-store';
import { createQuestionBankModule } from './modules/question-bank/question-bank.module';
import { createMatchRealtime } from './modules/realtime/match-realtime';
import { createScriptsService } from './modules/scripts/scripts.service';
import { createRoomRealtime } from './modules/realtime/room-realtime';
import { createRedisPresenceStore } from './modules/rooms/presence-store';
import { createRoomMaintenance, createRoomsModule } from './modules/rooms/rooms.module';
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

  const storage = createS3ObjectStorage({
    endpoint: env.S3_ENDPOINT,
    publicEndpoint: env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  });
  // Không chặn khởi động khi object storage chưa sẵn sàng: chỉ upload media bị ảnh hưởng.
  await storage.ensureBucket().catch((error: unknown) => {
    logger.warn({ err: error }, 'Không kết nối được object storage; upload media sẽ lỗi');
  });

  const healthService = createHealthService({
    database: () => dataSource.query('SELECT 1'),
    redis: () => redis.ping(),
    storage: () => storage.ping(),
  });

  // Realtime server tạo sau HTTP app; sự kiện thu hồi phiên chỉ phát sau khi đã khởi động.
  const realtimeRef: { io?: RealtimeServer } = {};
  const onSessionsRevoked = (event: SessionsRevokedEvent) => {
    if (realtimeRef.io) disconnectRevokedSessions(realtimeRef.io, event);
  };

  const passwords = await createArgon2PasswordHasher();
  const limiters = createRedisLimiterFactory(redis);
  const authService = createAuthService({
    dataSource,
    tokens: createTokenService({
      secret: env.JWT_SECRET,
      accessTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
      guestSessionTtlHours: env.GUEST_SESSION_TTL_HOURS,
    }),
    passwords,
    mailer: createSmtpMailer(env.SMTP_URL, env.MAIL_FROM),
    limiters,
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
  const presence = createRedisPresenceStore(redis);
  const questionBank = createQuestionBankModule({ dataSource, storage, limiters });
  const scriptsService = createScriptsService({
    dataSource,
    sources: questionBank.questionSources,
  });
  const rooms = createRoomsModule({
    dataSource,
    passwords,
    presence,
    limiters,
    authService,
    scripts: scriptsService.roomScripts,
    config: {
      maxActiveRoomsPerHost: env.MAX_ACTIVE_ROOMS_PER_HOST,
      maxSpectatorsPerRoom: env.MAX_SPECTATORS_PER_ROOM,
      reconnectGraceSeconds: env.RECONNECT_GRACE_SECONDS,
      roomIdleMinutes: env.ROOM_IDLE_MINUTES,
    },
  });

  const game = createGameModule({
    dataSource,
    store: createRedisMatchStore(redis),
    presence,
    media: questionBank.mediaService,
    rooms: rooms.roomsService,
    roomEvents: rooms.events,
    scripts: scriptsService,
    sources: questionBank.questionSources,
    logger,
    hostReconnectMinutes: env.HOST_RECONNECT_MINUTES,
  });

  const app = createApp({
    env,
    logger,
    healthService,
    authService,
    usersService: createUsersService(dataSource),
    adminUsersService: createAdminUsersService({ dataSource, authService, organizationsService }),
    organizationsService,
    roomsService: rooms.roomsService,
    lobbyService: rooms.lobbyService,
    questionBank,
    scriptsService,
    matchService: game.matchService,
    limiters,
  });
  const httpServer = createServer(app);
  const realtime = createRealtimeServer(httpServer, {
    corsOrigins: env.CORS_ORIGINS,
    authenticate: createTokenSocketAuthenticator((token) => authService.resolveAccessToken(token)),
    logger,
    adapter: createAdapter(redisPub, redisSub),
  });
  realtimeRef.io = realtime;
  const roomRealtime = createRoomRealtime({
    io: realtime,
    lobby: rooms.lobbyService,
    presence,
    limiters,
    logger,
    onPresence: (roomId, key, connected) => {
      game.runtime.onPresence(roomId, key, connected).catch((error: unknown) => {
        logger.error({ err: error, roomId }, 'Lỗi cập nhật kết nối trong trận');
      });
    },
  });
  const matchRealtime = createMatchRealtime({
    io: realtime,
    lobby: rooms.lobbyService,
    runtime: game.runtime,
    presence,
    limiters,
    logger,
  });
  game.runtime.attachPublisher(matchRealtime.publisher);
  rooms.events.attach(roomRealtime.events);
  realtime.on('connection', (socket) => {
    roomRealtime.register(socket);
    matchRealtime.register(socket);
  });
  await game.runtime.start();
  const maintenance = createRoomMaintenance({ lobby: rooms.lobbyService, presence, logger });
  maintenance.start();

  httpServer.listen(env.PORT, () => {
    logger.info(`API đang chạy tại http://localhost:${env.PORT}`);
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Đang tắt server');
    maintenance.stop();
    void game.runtime.stop();

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
