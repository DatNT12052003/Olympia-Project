import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import type { Env } from './config/env';
import { createHealthRouter } from './modules/health/health.routes';
import type { HealthService } from './modules/health/health.service';
import { createErrorHandler, notFoundHandler } from './shared/http/error-handler';

export interface AppDependencies {
  env: Pick<Env, 'CORS_ORIGINS'>;
  logger: Logger;
  healthService: HealthService;
}

export function createApp({ env, logger, healthService }: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url?.startsWith('/api/health') ?? false },
    }),
  );

  const api = express.Router();
  api.use('/health', createHealthRouter(healthService));
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
