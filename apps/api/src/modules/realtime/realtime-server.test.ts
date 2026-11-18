import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ClientToServerEvents, ServerTimeAck, ServerToClientEvents } from '@olympia/shared';
import { io as connectClient, type Socket as ClientSocket } from 'socket.io-client';
import type { Principal } from '../../shared/auth/principal';
import { silentLogger } from '../../test/test-logger';
import {
  createRealtimeServer,
  denyAllAuthenticator,
  type RealtimeServer,
  type SocketAuthenticator,
} from './realtime-server';

const userPrincipal: Principal = {
  kind: 'user',
  userId: '00000000-0000-4000-8000-000000000001',
  sessionId: '00000000-0000-4000-8000-000000000002',
  systemRole: 'member',
  emailVerified: true,
  canHost: true,
  organizationId: null,
};
const guestPrincipal: Principal = {
  kind: 'guest',
  guestId: '00000000-0000-4000-8000-000000000003',
  displayName: 'Khách',
  roomId: '00000000-0000-4000-8000-000000000004',
};

type TestClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

describe('Realtime server', () => {
  let httpServer: HttpServer;
  let io: RealtimeServer;
  let client: TestClient | undefined;

  async function start(authenticate: SocketAuthenticator): Promise<string> {
    httpServer = createServer();
    io = createRealtimeServer(httpServer, {
      corsOrigins: ['http://localhost:5173'],
      authenticate,
      logger: silentLogger,
    });
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const { port } = httpServer.address() as AddressInfo;
    return `http://localhost:${port}`;
  }

  function connect(url: string, token?: string): TestClient {
    client = connectClient(url, {
      transports: ['websocket'],
      reconnection: false,
      ...(token ? { auth: { token } } : {}),
    });
    return client;
  }

  function waitForConnectError(socket: TestClient): Promise<Error> {
    return new Promise((resolve) => socket.on('connect_error', resolve));
  }

  function waitForConnect(socket: TestClient): Promise<void> {
    return new Promise((resolve) => socket.on('connect', () => resolve()));
  }

  afterEach(async () => {
    client?.disconnect();
    client = undefined;
    await new Promise<void>((resolve) => {
      void io.close(() => resolve());
    });
  });

  it('mặc định từ chối mọi kết nối với lỗi UNAUTHENTICATED', async () => {
    const socket = connect(await start(denyAllAuthenticator));

    const error = await waitForConnectError(socket);

    expect(error.message).toBe('UNAUTHENTICATED');
    expect(socket.connected).toBe(false);
  });

  it('chấp nhận kết nối khi xác thực thành công và gắn principal', async () => {
    const authenticate: SocketAuthenticator = (handshake) =>
      (handshake.auth as { token?: string }).token === 'valid'
        ? Promise.resolve(userPrincipal)
        : Promise.reject(new Error('invalid'));
    const socket = connect(await start(authenticate), 'valid');

    await waitForConnect(socket);
    const [serverSocket] = await io.fetchSockets();

    expect(serverSocket?.data.principal).toEqual(userPrincipal);
  });

  it('từ chối token sai', async () => {
    const authenticate: SocketAuthenticator = () => Promise.reject(new Error('invalid'));
    const socket = connect(await start(authenticate), 'wrong');

    const error = await waitForConnectError(socket);

    expect(error.message).toBe('UNAUTHENTICATED');
  });

  it('system:ping trả về thời điểm server', async () => {
    const socket = connect(await start(() => Promise.resolve(guestPrincipal)));
    await waitForConnect(socket);

    const before = Date.now();
    const response = (await socket.timeout(1000).emitWithAck('system:ping')) as ServerTimeAck;

    expect(response.serverTime).toBeGreaterThanOrEqual(before);
    expect(response.serverTime).toBeLessThanOrEqual(Date.now());
  });
});
