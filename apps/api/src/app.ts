import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import type { Env } from './config/env';
import { createAuthRouter } from './modules/auth/auth.routes';
import { createAvRouter } from './modules/av/av.routes';
import type { AvService } from './modules/av/av.service';
import type { AuthService } from './modules/auth/auth.service';
import { createHealthRouter } from './modules/health/health.routes';
import { createMediaRouter } from './modules/media/media.routes';
import type { QuestionBankModule } from './modules/question-bank/question-bank.module';
import {
  createModerationRouter,
  createPublicSetsRouter,
  createQuestionSetsRouter,
  createQuestionsRouter,
} from './modules/question-bank/question-bank.routes';
import type { HealthService } from './modules/health/health.service';
import type { LimiterFactory } from './infrastructure/rate-limit/rate-limiter';
import { createMatchRouter } from './modules/game/match.routes';
import type { MatchService } from './modules/game/match.service';
import type { LobbyService } from './modules/rooms/lobby.service';
import { createRoomsRouter } from './modules/rooms/rooms.routes';
import type { RoomsService } from './modules/rooms/rooms.service';
import { createScriptsRouter } from './modules/scripts/scripts.routes';
import type { ScriptsService } from './modules/scripts/scripts.service';
import { createOrganizationsRouter } from './modules/organizations/organizations.routes';
import type { OrganizationsService } from './modules/organizations/organizations.service';
import { createAdminUsersRouter } from './modules/users/admin-users.routes';
import type { AdminUsersService } from './modules/users/admin-users.service';
import { createMeRouter } from './modules/users/users.routes';
import type { UsersService } from './modules/users/users.service';
import { createAuthenticate } from './shared/auth/http-auth';
import { createErrorHandler, notFoundHandler } from './shared/http/error-handler';

export interface AppDependencies {
  env: Pick<Env, 'CORS_ORIGINS' | 'TRUST_PROXY' | 'COOKIE_SECURE'>;
  logger: Logger;
  healthService: HealthService;
  authService: AuthService;
  usersService: UsersService;
  adminUsersService: AdminUsersService;
  organizationsService: OrganizationsService;
  roomsService: RoomsService;
  lobbyService: LobbyService;
  questionBank: QuestionBankModule;
  scriptsService: ScriptsService;
  matchService: MatchService;
  avService: AvService;
  limiters: LimiterFactory;
}

export function createApp({
  env,
  logger,
  healthService,
  authService,
  usersService,
  adminUsersService,
  organizationsService,
  roomsService,
  lobbyService,
  questionBank,
  scriptsService,
  matchService,
  avService,
  limiters,
}: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  // Lấy đúng IP client sau reverse proxy (rate limit đăng nhập).
  app.set('trust proxy', env.TRUST_PROXY);
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url?.startsWith('/api/health') ?? false },
    }),
  );

  const api = express.Router();
  api.use('/health', createHealthRouter(healthService));
  // Gắn principal nếu có access token; từng router tự quyết định yêu cầu quyền gì.
  api.use(createAuthenticate((token) => authService.resolveAccessToken(token)));
  api.use('/auth', createAuthRouter(authService, { secure: env.COOKIE_SECURE }));
  api.use('/me', createMeRouter(usersService));
  api.use('/admin/users', createAdminUsersRouter(adminUsersService));
  api.use('/admin/organizations', createOrganizationsRouter(organizationsService));
  api.use('/rooms/:roomId/match', createMatchRouter(matchService));
  api.use('/rooms/:roomId/av', createAvRouter(avService));
  api.use(
    '/rooms',
    createRoomsRouter({
      roomsService,
      lobbyService,
      limiters,
      cookies: { secure: env.COOKIE_SECURE },
    }),
  );
  api.use('/media', createMediaRouter(questionBank.mediaService));
  api.use('/questions', createQuestionsRouter(questionBank.questionsService));
  api.use('/question-sets', createQuestionSetsRouter(questionBank.questionSetsService));
  api.use('/public-question-sets', createPublicSetsRouter(questionBank.publicSetsService));
  api.use('/moderation/question-sets', createModerationRouter(questionBank.publicSetsService));
  api.use('/scripts', createScriptsRouter(scriptsService));
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
