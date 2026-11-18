import 'reflect-metadata';
import { createServer } from 'node:http';
import { createAdapter } from '@socket.io/redis-adapter';
import { createApp } from './app';
import { loadEnv } from './config/env';
import { createDataSource } from './infrastructure/database/data-source';
import { createRedisClient } from './infrastructure/redis/redis-client';
import { createHealthService } from './modules/health/health.service';
import { createRealtimeServer, denyAllAuthenticator } from './modules/realtime/realtime-server';
import { createLogger } from './shared/logging/logger';

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

  const app = createApp({ env, logger, healthService });
  const httpServer = createServer(app);
  const io = createRealtimeServer(httpServer, {
    corsOrigins: env.CORS_ORIGINS,
    authenticate: denyAllAuthenticator,
    logger,
    adapter: createAdapter(redisPub, redisSub),
  });

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
    void io.close(() => {
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
