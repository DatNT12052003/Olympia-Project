import { randomUUID } from 'node:crypto';
import {
  type AuthSessionResponse,
  type CreateRoomRequest,
  CSRF_HEADER,
  hostRoomSchema,
  joinRoomResponseSchema,
  type SystemRole,
} from '@olympia/shared';
import type { Express } from 'express';
import { Redis } from 'ioredis';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { createApp } from '../app';
import { createDataSource } from '../infrastructure/database/data-source';
import { memoryLimiterFactory } from '../infrastructure/rate-limit/rate-limiter';
import { type AuthService, createAuthService } from '../modules/auth/auth.service';
import { createArgon2PasswordHasher, type PasswordHasher } from '../modules/auth/password-hasher';
import type { SessionsRevokedEvent } from '../modules/auth/session-store';
import { createTokenService } from '../modules/auth/token-service';
import { createHealthService, type DependencyCheck } from '../modules/health/health.service';
import type { LobbyService } from '../modules/rooms/lobby.service';
import { createRedisPresenceStore, type PresenceStore } from '../modules/rooms/presence-store';
import type { RoomEvents } from '../modules/rooms/room-events';
import { createRoomsModule } from '../modules/rooms/rooms.module';
import type { RoomsService } from '../modules/rooms/rooms.service';
import { createOrganizationsService } from '../modules/organizations/organizations.service';
import { createAdminUsersService } from '../modules/users/admin-users.service';
import { UserEntity } from '../modules/users/user.entity';
import { createUsersService } from '../modules/users/users.service';
import type { MailMessage } from '../shared/mail/mailer';
import { testDatabaseUrl } from './test-database-url';
import { silentLogger } from './test-logger';

export const TEST_JWT_SECRET = 'test-secret-0123456789abcdef0123456789abcdef';
export const TEST_PASSWORD = 'Mat-khau-test-123';

export interface TestContext {
  app: Express;
  dataSource: DataSource;
  authService: AuthService;
  /** Email đã "gửi" (mailer trong bộ nhớ). */
  mails: MailMessage[];
  /** Sự kiện thu hồi phiên đã phát ra. */
  revokedEvents: SessionsRevokedEvent[];
  roomsService: RoomsService;
  lobbyService: LobbyService;
  presence: PresenceStore;
  /** Gắn bộ phát sự kiện phòng (ví dụ realtime server trong test). */
  attachRoomEvents(events: RoomEvents): void;
  close(): Promise<void>;
}

export interface TestContextOptions {
  healthChecks?: Record<string, DependencyCheck>;
  loginMaxFailures?: number;
  /** Gọi thêm khi phiên bị thu hồi (ví dụ: ngắt kết nối realtime trong test). */
  onSessionsRevoked?: (event: SessionsRevokedEvent) => void;
  /** Đồng hồ cho Room Management (test hết thời gian giữ chỗ, phòng không hoạt động). */
  now?: () => Date;
  maxActiveRoomsPerHost?: number;
  reconnectGraceSeconds?: number;
}

/** Redis riêng cho test (DB 15); mỗi context dùng tiền tố khóa riêng. */
export function testRedisUrl(): string {
  return process.env.TEST_REDIS_URL ?? 'redis://localhost:6380/15';
}

let sharedHasher: Promise<PasswordHasher> | undefined;

/** Ứng dụng đầy đủ trên database test; mỗi file test tạo một context (beforeAll). */
export async function createTestContext(options: TestContextOptions = {}): Promise<TestContext> {
  const dataSource = createDataSource(testDatabaseUrl());
  await dataSource.initialize();

  const mails: MailMessage[] = [];
  const revokedEvents: SessionsRevokedEvent[] = [];
  sharedHasher ??= createArgon2PasswordHasher();

  const authService = createAuthService({
    dataSource,
    tokens: createTokenService({
      secret: TEST_JWT_SECRET,
      accessTtlSeconds: 900,
      guestSessionTtlHours: 24,
    }),
    passwords: await sharedHasher,
    mailer: {
      send(message) {
        mails.push(message);
        return Promise.resolve();
      },
    },
    limiters: memoryLimiterFactory,
    logger: silentLogger,
    config: {
      appUrl: 'http://localhost:5173',
      refreshTokenTtlDays: 30,
      loginMaxFailures: options.loginMaxFailures ?? 5,
      loginFailureWindowMinutes: 15,
    },
    onSessionsRevoked: (event) => {
      revokedEvents.push(event);
      options.onSessionsRevoked?.(event);
    },
  });
  const organizationsService = createOrganizationsService(dataSource);
  const redis = new Redis(testRedisUrl(), { lazyConnect: true, maxRetriesPerRequest: 1 });
  await redis.connect();
  const presence = createRedisPresenceStore(redis, `test:${randomUUID()}:`);
  const rooms = createRoomsModule({
    dataSource,
    passwords: await sharedHasher,
    presence,
    limiters: memoryLimiterFactory,
    authService,
    config: {
      maxActiveRoomsPerHost: options.maxActiveRoomsPerHost ?? 5,
      maxSpectatorsPerRoom: 200,
      reconnectGraceSeconds: options.reconnectGraceSeconds ?? 120,
      roomIdleMinutes: 60,
    },
    ...(options.now ? { now: options.now } : {}),
  });

  const app = createApp({
    env: { CORS_ORIGINS: ['http://localhost:5173'], TRUST_PROXY: 0, COOKIE_SECURE: false },
    logger: silentLogger,
    healthService: createHealthService(options.healthChecks ?? {}, 50),
    authService,
    usersService: createUsersService(dataSource),
    adminUsersService: createAdminUsersService({ dataSource, authService, organizationsService }),
    organizationsService,
    roomsService: rooms.roomsService,
    lobbyService: rooms.lobbyService,
    limiters: memoryLimiterFactory,
  });

  return {
    app,
    dataSource,
    authService,
    mails,
    revokedEvents,
    roomsService: rooms.roomsService,
    lobbyService: rooms.lobbyService,
    presence,
    attachRoomEvents: (events) => rooms.events.attach(events),
    close: async () => {
      await redis.quit();
      await dataSource.destroy();
    },
  };
}

export function uniqueEmail(prefix = 'user'): string {
  return `${prefix}-${randomUUID()}@test.local`;
}

export interface TestUserOptions {
  email?: string;
  displayName?: string;
  systemRole?: SystemRole;
  emailVerified?: boolean;
  canHost?: boolean;
  organizationId?: string | null;
  status?: 'active' | 'locked';
}

/** Tạo người dùng trực tiếp trong DB (không qua đăng ký, không tốn rate limit). */
export async function createUser(
  ctx: TestContext,
  options: TestUserOptions = {},
): Promise<UserEntity & { password: string }> {
  const hasher = await (sharedHasher ??= createArgon2PasswordHasher());
  const locked = options.status === 'locked';
  const user = ctx.dataSource.getRepository(UserEntity).create({
    email: options.email ?? uniqueEmail(),
    passwordHash: await hasher.hash(TEST_PASSWORD),
    displayName: options.displayName ?? 'Người test ' + randomUUID().slice(0, 6),
    systemRole: options.systemRole ?? 'member',
    emailVerifiedAt: options.emailVerified === false ? null : new Date(),
    canHost: options.canHost ?? true,
    organizationId: options.organizationId ?? null,
    status: locked ? 'locked' : 'active',
    lockedAt: locked ? new Date() : null,
    privacyAcceptedAt: new Date(),
  });
  await ctx.dataSource.getRepository(UserEntity).save(user);
  return Object.assign(user, { password: TEST_PASSWORD });
}

export interface LoggedIn {
  accessToken: string;
  /** Header Cookie chứa refresh token, để gửi lại khi gọi /auth/refresh. */
  refreshCookie: string;
  body: AuthSessionResponse;
}

export function extractCookie(setCookie: string | string[] | undefined, name: string): string {
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const found = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  if (!found) throw new Error(`Không có cookie ${name}`);
  return found.split(';')[0]!;
}

export async function login(ctx: TestContext, email: string, password = TEST_PASSWORD) {
  const res = await request(ctx.app)
    .post('/api/auth/login')
    .set(CSRF_HEADER, '1')
    .send({ email, password });
  if (res.status !== 200) throw new Error(`Đăng nhập thất bại: ${res.status} ${res.text}`);
  return {
    accessToken: (res.body as AuthSessionResponse).accessToken,
    refreshCookie: extractCookie(res.headers['set-cookie'], 'olympia_rt'),
    body: res.body as AuthSessionResponse,
  } satisfies LoggedIn;
}

/** Tạo người dùng rồi đăng nhập, trả về access token. */
export async function createUserAndLogin(ctx: TestContext, options: TestUserOptions = {}) {
  const user = await createUser(ctx, options);
  return { user, ...(await login(ctx, user.email)) };
}

/** Lấy token trong link của email gần nhất gửi tới `to`. */
export function tokenFromLastMail(ctx: TestContext, to: string): string {
  const mail = [...ctx.mails].reverse().find((m) => m.to === to);
  if (!mail) throw new Error(`Không có email gửi tới ${to}`);
  const match = /token=([A-Za-z0-9_-]+)/.exec(mail.text);
  if (!match?.[1]) throw new Error('Email không chứa token');
  return match[1];
}

export interface OpenRoomOptions {
  host?: TestUserOptions;
  room?: Partial<CreateRoomRequest>;
}

/** Host mới đăng nhập và một phòng đã mở. */
export async function createOpenRoom(ctx: TestContext, options: OpenRoomOptions = {}) {
  const host = await createUserAndLogin(ctx, options.host);
  const res = await request(ctx.app)
    .post('/api/rooms')
    .set('Authorization', `Bearer ${host.accessToken}`)
    .send({
      name: 'Phòng test',
      maxPlayers: 4,
      visibility: 'private',
      open: true,
      ...options.room,
    });
  if (res.status !== 201) throw new Error(`Tạo phòng thất bại: ${res.status} ${res.text}`);
  const room = hostRoomSchema.parse((res.body as { room: unknown }).room);
  return { host, room, hostAuth: `Bearer ${host.accessToken}` };
}

/** Vào phòng làm khách; trả access token khách và cookie phiên khách. */
export async function joinAsGuest(
  ctx: TestContext,
  roomId: string,
  displayName: string,
  role: 'player' | 'spectator' = 'spectator',
) {
  const res = await request(ctx.app)
    .post(`/api/rooms/${roomId}/join`)
    .set(CSRF_HEADER, '1')
    .send({ role, displayName });
  if (res.status !== 201) throw new Error(`Khách vào phòng thất bại: ${res.status} ${res.text}`);
  const body = joinRoomResponseSchema.parse(res.body);
  return {
    participant: body.participant,
    accessToken: body.guestSession!.accessToken,
    guest: body.guestSession!.guest,
    guestCookie: extractCookie(res.headers['set-cookie'], 'olympia_guest'),
  };
}
