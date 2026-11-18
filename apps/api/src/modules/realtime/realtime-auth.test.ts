import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  type ClientToServerEvents,
  CSRF_HEADER,
  guestSessionResponseSchema,
  type ServerToClientEvents,
} from '@olympia/shared';
import { io as connectClient, type Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import {
  createTestContext,
  createUserAndLogin,
  login,
  type TestContext,
} from '../../test/test-context';
import { silentLogger } from '../../test/test-logger';
import {
  createRealtimeServer,
  createTokenSocketAuthenticator,
  disconnectRevokedSessions,
  type RealtimeServer,
} from './realtime-server';

type TestClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

let ctx: TestContext;
let httpServer: HttpServer;
let io: RealtimeServer | undefined;
let url: string;
const clients: TestClient[] = [];

beforeAll(async () => {
  ctx = await createTestContext({
    onSessionsRevoked: (event) => {
      if (io) disconnectRevokedSessions(io, event);
    },
  });
  httpServer = createServer();
  io = createRealtimeServer(httpServer, {
    corsOrigins: ['http://localhost:5173'],
    authenticate: createTokenSocketAuthenticator((token) =>
      ctx.authService.resolveAccessToken(token),
    ),
    logger: silentLogger,
  });
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
});

afterEach(() => {
  for (const client of clients.splice(0)) client.disconnect();
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    void io?.close(() => resolve());
  });
  await ctx.close();
});

function connect(token?: string): TestClient {
  const client: TestClient = connectClient(url, {
    transports: ['websocket'],
    reconnection: false,
    ...(token ? { auth: { token } } : {}),
  });
  clients.push(client);
  return client;
}

function connected(client: TestClient): Promise<void> {
  return new Promise((resolve, reject) => {
    client.on('connect', () => resolve());
    client.on('connect_error', reject);
  });
}

function connectError(client: TestClient): Promise<string> {
  return new Promise((resolve) => client.on('connect_error', (error) => resolve(error.message)));
}

function disconnected(client: TestClient): Promise<string> {
  return new Promise((resolve) => client.on('disconnect', (reason) => resolve(reason)));
}

describe('Xác thực realtime dùng chung access token với REST', () => {
  it('chấp nhận access token tài khoản', async () => {
    const { accessToken } = await createUserAndLogin(ctx);
    await connected(connect(accessToken));
  });

  it('chấp nhận access token phiên khách', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/guest')
      .set(CSRF_HEADER, '1')
      .send({ displayName: 'Khách xem' });
    await connected(connect(guestSessionResponseSchema.parse(res.body).accessToken));
  });

  it('từ chối khi thiếu hoặc sai token', async () => {
    expect(await connectError(connect())).toBe('UNAUTHENTICATED');
    expect(await connectError(connect('khong-hop-le'))).toBe('UNAUTHENTICATED');
  });

  it('đăng xuất ngắt kết nối của đúng phiên đó', async () => {
    const { user, accessToken, refreshCookie } = await createUserAndLogin(ctx);
    const other = await login(ctx, user.email);
    const current = connect(accessToken);
    const otherDevice = connect(other.accessToken);
    await Promise.all([connected(current), connected(otherDevice)]);
    const dropped = disconnected(current);

    await request(ctx.app)
      .post('/api/auth/logout')
      .set(CSRF_HEADER, '1')
      .set('Cookie', refreshCookie)
      .expect(204);

    expect(await dropped).toBe('io server disconnect');
    expect(otherDevice.connected).toBe(true);
    // Token của phiên đã thu hồi không kết nối lại được.
    expect(await connectError(connect(accessToken))).toBe('UNAUTHENTICATED');
  });

  it('khóa tài khoản ngắt mọi kết nối của người dùng (BR-AUTH-02)', async () => {
    const admin = await createUserAndLogin(ctx, { systemRole: 'super_admin' });
    const { user, accessToken } = await createUserAndLogin(ctx);
    const second = await login(ctx, user.email);
    const sockets = [connect(accessToken), connect(second.accessToken)];
    await Promise.all(sockets.map(connected));
    const dropped = sockets.map(disconnected);

    await request(ctx.app)
      .post(`/api/admin/users/${user.id}/lock`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ reason: 'Vi phạm' })
      .expect(200);

    expect(await Promise.all(dropped)).toEqual(['io server disconnect', 'io server disconnect']);
  });
});
