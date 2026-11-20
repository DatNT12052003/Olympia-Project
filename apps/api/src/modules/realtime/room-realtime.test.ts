import { randomUUID } from 'node:crypto';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type {
  Ack,
  ClientToServerEvents,
  RoomReaction,
  RoomRemovedReason,
  RoomState,
  ServerToClientEvents,
} from '@olympia/shared';
import { io as connectClient, type Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import { memoryLimiterFactory } from '../../infrastructure/rate-limit/rate-limiter';
import {
  createOpenRoom,
  createTestContext,
  createUserAndLogin,
  joinAsGuest,
  type TestContext,
} from '../../test/test-context';
import { silentLogger } from '../../test/test-logger';
import { OrganizationEntity } from '../organizations/organization.entity';
import { OrganizationManagerEntity } from '../organizations/organization-manager.entity';
import { RoomEntity } from '../rooms/room.entity';
import {
  createRealtimeServer,
  createTokenSocketAuthenticator,
  type RealtimeServer,
} from './realtime-server';
import { createRoomRealtime } from './room-realtime';

type Client = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

/** Đồng hồ của Room Management, tua nhanh để kiểm tra hết thời gian giữ chỗ / không hoạt động. */
let offsetMs = 0;
let ctx: TestContext;
let httpServer: HttpServer;
let io: RealtimeServer;
let url: string;
const clients: Client[] = [];

beforeAll(async () => {
  ctx = await createTestContext({
    now: () => new Date(Date.now() + offsetMs),
    reconnectGraceSeconds: 120,
  });
  httpServer = createServer();
  io = createRealtimeServer(httpServer, {
    corsOrigins: ['http://localhost:5173'],
    authenticate: createTokenSocketAuthenticator((token) =>
      ctx.authService.resolveAccessToken(token),
    ),
    logger: silentLogger,
  });
  const roomRealtime = createRoomRealtime({
    io,
    lobby: ctx.lobbyService,
    presence: ctx.presence,
    limiters: memoryLimiterFactory,
    logger: silentLogger,
  });
  ctx.attachRoomEvents(roomRealtime.events);
  io.on('connection', (socket) => roomRealtime.register(socket));
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
});

afterEach(() => {
  offsetMs = 0;
  for (const client of clients.splice(0)) client.disconnect();
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    void io.close(() => resolve());
  });
  await ctx.close();
});

async function connect(token: string): Promise<Client> {
  const client: Client = connectClient(url, {
    transports: ['websocket'],
    reconnection: false,
    auth: { token },
  });
  clients.push(client);
  await new Promise<void>((resolve, reject) => {
    client.on('connect', () => resolve());
    client.on('connect_error', reject);
  });
  return client;
}

function subscribe(client: Client, roomId: string): Promise<Ack<RoomState>> {
  return client.timeout(3000).emitWithAck('room:subscribe', { roomId });
}

async function subscribed(client: Client, roomId: string): Promise<RoomState> {
  const result = await subscribe(client, roomId);
  if (!result.ok) throw new Error(`Không theo dõi được phòng: ${result.error.code}`);
  return result.data;
}

/** Chờ bản trạng thái thỏa điều kiện (bỏ qua các bản trung gian). */
function nextState(client: Client, predicate: (state: RoomState) => boolean): Promise<RoomState> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Không nhận được trạng thái mong đợi')), 3000);
    const handler = (state: RoomState) => {
      if (!predicate(state)) return;
      clearTimeout(timer);
      client.off('room:state', handler);
      resolve(state);
    };
    client.on('room:state', handler);
  });
}

function react(client: Client, roomId: string, emoji: string): Promise<Ack> {
  return client.timeout(3000).emitWithAck('reaction:send', { roomId, emoji }) as Promise<Ack>;
}

function removedReason(client: Client): Promise<RoomRemovedReason> {
  return new Promise((resolve) => client.once('room:removed', ({ reason }) => resolve(reason)));
}

describe('Theo dõi phòng qua realtime (DL-026)', () => {
  it('Host nhận trạng thái đầy đủ khi theo dõi và bản mới khi có người vào phòng', async () => {
    const { room, host } = await createOpenRoom(ctx);
    const hostSocket = await connect(host.accessToken);
    const initial = await subscribed(hostSocket, room.id);

    expect(initial).toMatchObject({ audience: 'host', room: { id: room.id, code: room.code } });
    expect(initial.host.connection).toBe('online');

    const update = nextState(hostSocket, (s) => s.pending.length === 1);
    await joinAsGuest(ctx, room.id, 'Minh Anh', 'player');
    const state = await update;

    expect(state.version).toBeGreaterThan(initial.version);
    expect(state.pending[0]).toMatchObject({ displayName: 'Minh Anh', kind: 'guest' });
  });

  it('người ngoài phòng và khách của phòng khác không theo dõi được', async () => {
    const { room } = await createOpenRoom(ctx);
    const other = await createOpenRoom(ctx);
    const stranger = await createUserAndLogin(ctx);
    const otherGuest = await joinAsGuest(ctx, other.room.id, 'Khách khác');

    const byStranger = await subscribe(await connect(stranger.accessToken), room.id);
    const byOtherGuest = await subscribe(await connect(otherGuest.accessToken), room.id);

    expect(byStranger).toMatchObject({ ok: false, error: { code: 'NOT_IN_ROOM' } });
    expect(byOtherGuest).toMatchObject({ ok: false, error: { code: 'NOT_IN_ROOM' } });
  });

  it('người chơi/khán giả nhận bản rút gọn không có danh sách chờ duyệt', async () => {
    const { room } = await createOpenRoom(ctx);
    await joinAsGuest(ctx, room.id, 'Đang chờ', 'player');
    const spectator = await joinAsGuest(ctx, room.id, 'Khán giả');

    const state = await subscribed(await connect(spectator.accessToken), room.id);

    expect(state.audience).toBe('member');
    expect(state.pending).toEqual([]);
  });
});

describe('Kết nối và kết nối lại (mục 12)', () => {
  it('một danh tính chỉ có một kết nối trong phòng; kết nối mới thay kết nối cũ (BR-RC-05)', async () => {
    const { room } = await createOpenRoom(ctx);
    const guest = await joinAsGuest(ctx, room.id, 'Hai tab');
    const firstTab = await connect(guest.accessToken);
    await subscribed(firstTab, room.id);
    const replaced = removedReason(firstTab);

    await subscribed(await connect(guest.accessToken), room.id);

    expect(await replaced).toBe('replaced');
  });

  it('mất kết nối hiện "Mất kết nối" cho mọi người; kết nối lại nhận trạng thái hiện tại', async () => {
    const { room, host } = await createOpenRoom(ctx, { room: { autoApprove: true } });
    const player = await joinAsGuest(ctx, room.id, 'Thùy Linh', 'player');
    const hostSocket = await connect(host.accessToken);
    await subscribed(hostSocket, room.id);
    const playerSocket = await connect(player.accessToken);
    await subscribed(playerSocket, room.id);

    const dropped = nextState(hostSocket, (s) => s.players[0]?.connection === 'disconnected');
    playerSocket.disconnect();
    const state = await dropped;
    expect(state.players[0]).toMatchObject({
      seat: 1,
      disconnectedAt: expect.any(String) as string,
    });

    const back = nextState(hostSocket, (s) => s.players[0]?.connection === 'online');
    const rejoined = await subscribed(await connect(player.accessToken), room.id);
    await back;
    // BR-RC-02: nhận lại đúng vị trí.
    expect(rejoined.players[0]).toMatchObject({ id: player.participant.id, seat: 1 });
  });

  it('hết 120 giây giữ chỗ thì người chơi được xem như rời phòng và ghế được giải phóng (DL-029)', async () => {
    const { room, host } = await createOpenRoom(ctx, { room: { autoApprove: true } });
    const player = await joinAsGuest(ctx, room.id, 'Rớt mạng', 'player');
    const hostSocket = await connect(host.accessToken);
    await subscribed(hostSocket, room.id);
    const playerSocket = await connect(player.accessToken);
    await subscribed(playerSocket, room.id);
    const dropped = nextState(hostSocket, (s) => s.players[0]?.connection === 'disconnected');
    playerSocket.disconnect();
    await dropped;

    offsetMs = 60_000;
    expect(await ctx.lobbyService.releaseExpiredDisconnects()).toBe(0);

    const released = nextState(hostSocket, (s) => s.players.length === 0);
    offsetMs = 121_000;
    // Có thể giải phóng cả người từ các test trước trong cùng context.
    expect(await ctx.lobbyService.releaseExpiredDisconnects()).toBeGreaterThanOrEqual(1);
    await released;
  });

  it('phòng mở không hoạt động 60 phút và không ai kết nối thì tự đóng (DL-030)', async () => {
    const busy = await createOpenRoom(ctx);
    const idle = await createOpenRoom(ctx);
    const watcher = await connect(busy.host.accessToken);
    await subscribed(watcher, busy.room.id);

    offsetMs = 61 * 60_000;
    await ctx.lobbyService.closeIdleRooms();

    const repo = ctx.dataSource.getRepository(RoomEntity);
    expect((await repo.findOneByOrFail({ id: idle.room.id })).status).toBe('closed');
    expect((await repo.findOneByOrFail({ id: busy.room.id })).status).toBe('open');
  });
});

describe('Bị đưa ra khỏi phòng', () => {
  it('người bị kick nhận thông báo và không nhận trạng thái phòng nữa', async () => {
    const { room, hostAuth } = await createOpenRoom(ctx);
    const spectator = await joinAsGuest(ctx, room.id, 'Bị kick');
    const socket = await connect(spectator.accessToken);
    await subscribed(socket, room.id);
    const kicked = removedReason(socket);

    await request(ctx.app)
      .post(`/api/rooms/${room.id}/participants/${spectator.participant.id}/kick`)
      .set('Authorization', hostAuth)
      .expect(204);

    expect(await kicked).toBe('kicked');
    expect(await subscribe(socket, room.id)).toMatchObject({ ok: false });
  });

  it('Host đóng phòng thì mọi người nhận thông báo phòng đã đóng', async () => {
    const { room, hostAuth } = await createOpenRoom(ctx);
    const spectator = await joinAsGuest(ctx, room.id, 'Xem');
    const socket = await connect(spectator.accessToken);
    await subscribed(socket, room.id);
    const closed = removedReason(socket);

    await request(ctx.app)
      .post(`/api/rooms/${room.id}/close`)
      .set('Authorization', hostAuth)
      .expect(200);

    expect(await closed).toBe('closed');
  });
});

describe('Reaction (mục 13)', () => {
  async function setup() {
    const { room, host } = await createOpenRoom(ctx);
    const hostSocket = await connect(host.accessToken);
    await subscribed(hostSocket, room.id);
    const spectator = await joinAsGuest(ctx, room.id, 'Khán giả vui');
    const spectatorSocket = await connect(spectator.accessToken);
    await subscribed(spectatorSocket, room.id);
    return { room, hostSocket, spectatorSocket };
  }

  it('khán giả gửi reaction, mọi người trong phòng nhận được', async () => {
    const { room, hostSocket, spectatorSocket } = await setup();
    const received = new Promise<RoomReaction>((resolve) =>
      hostSocket.once('room:reaction', resolve),
    );

    const ack = await react(spectatorSocket, room.id, '🔥');

    expect(ack).toEqual({ ok: true });
    expect(await received).toEqual({
      roomId: room.id,
      emoji: '🔥',
      from: { displayName: 'Khán giả vui', seat: null },
    });
  });

  it('giới hạn 1 reaction/giây/người (BR-SPEC-02) và chỉ nhận 4 biểu tượng', async () => {
    const { room, spectatorSocket } = await setup();
    const send = (emoji: string) => react(spectatorSocket, room.id, emoji);

    expect(await send('👍')).toEqual({ ok: true });
    expect(await send('👍')).toMatchObject({ ok: false, error: { code: 'TOO_MANY_REQUESTS' } });
    expect(await send('💩')).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
  });

  it('người chơi đang chờ duyệt không gửi được reaction; Host tắt reaction thì bị từ chối', async () => {
    const { room, hostAuth } = await createOpenRoom(ctx);
    const pending = await joinAsGuest(ctx, room.id, 'Chờ duyệt', 'player');
    const pendingSocket = await connect(pending.accessToken);
    await subscribed(pendingSocket, room.id);
    const spectator = await joinAsGuest(ctx, room.id, 'Xem tắt');
    const spectatorSocket = await connect(spectator.accessToken);
    await subscribed(spectatorSocket, room.id);

    const byPending = await react(pendingSocket, room.id, '👍');
    await request(ctx.app)
      .patch(`/api/rooms/${room.id}`)
      .set('Authorization', hostAuth)
      .send({ reactionsEnabled: false })
      .expect(200);
    const disabled = await react(spectatorSocket, room.id, '👍');

    expect(byPending).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(disabled).toMatchObject({ ok: false, error: { code: 'REACTIONS_DISABLED' } });
  });
});

describe('Giám sát phòng của Super Admin/Manager (BR-ROLE-04)', () => {
  async function managerOf(organizationId: string) {
    const manager = await createUserAndLogin(ctx, { systemRole: 'manager' });
    await ctx.dataSource
      .getRepository(OrganizationManagerEntity)
      .insert({ organizationId, userId: manager.user.id });
    return manager;
  }

  async function newOrganization() {
    return ctx.dataSource
      .getRepository(OrganizationEntity)
      .save({ name: `Trường ${randomUUID().slice(0, 8)}` });
  }

  it('Super Admin vào giám sát: nhận bản như khán giả, không hiện trong phòng, không gửi reaction', async () => {
    const { room, host } = await createOpenRoom(ctx, { room: { reactionsEnabled: true } });
    const admin = await createUserAndLogin(ctx, { systemRole: 'super_admin' });
    const hostSocket = await connect(host.accessToken);
    const before = await subscribed(hostSocket, room.id);

    const adminSocket = await connect(admin.accessToken);
    const result = await subscribe(adminSocket, room.id);

    expect(result).toMatchObject({ ok: true, data: { audience: 'member', monitor: true } });
    // Không ghi trạng thái kết nối nên Host không thấy ai mới vào.
    const presence = await ctx.presence.get(room.id);
    expect(presence.has(`u:${admin.user.id}`)).toBe(false);
    expect(before.spectators.count).toBe(0);
    expect(await react(adminSocket, room.id, '👍')).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
  });

  it('người giám sát nhận thông báo khi phòng bị đóng', async () => {
    const { room, hostAuth } = await createOpenRoom(ctx);
    const admin = await createUserAndLogin(ctx, { systemRole: 'super_admin' });
    const adminSocket = await connect(admin.accessToken);
    await subscribed(adminSocket, room.id);
    const removed = removedReason(adminSocket);

    await request(ctx.app).post(`/api/rooms/${room.id}/close`).set('Authorization', hostAuth);

    expect(await removed).toBe('closed');
  });

  it('Manager chỉ giám sát được phòng của Host thuộc tổ chức mình quản lý', async () => {
    const org = await newOrganization();
    const otherOrg = await newOrganization();
    const manager = await managerOf(org.id);
    const own = await createOpenRoom(ctx, { host: { organizationId: org.id } });
    const foreign = await createOpenRoom(ctx, { host: { organizationId: otherOrg.id } });
    const noOrg = await createOpenRoom(ctx);
    const managerSocket = await connect(manager.accessToken);

    expect(await subscribe(managerSocket, own.room.id)).toMatchObject({
      ok: true,
      data: { monitor: true },
    });
    expect(await subscribe(managerSocket, foreign.room.id)).toMatchObject({
      ok: false,
      error: { code: 'NOT_IN_ROOM' },
    });
    expect(await subscribe(managerSocket, noOrg.room.id)).toMatchObject({
      ok: false,
      error: { code: 'NOT_IN_ROOM' },
    });
  });

  it('Manager không giám sát được phòng của Manager/Super Admin khác dù cùng tổ chức', async () => {
    const org = await newOrganization();
    const manager = await managerOf(org.id);
    const staffRoom = await createOpenRoom(ctx, {
      host: { organizationId: org.id, systemRole: 'manager' },
    });

    const result = await subscribe(await connect(manager.accessToken), staffRoom.room.id);

    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_IN_ROOM' } });
  });

  it('nhân viên đã vào phòng làm khán giả giữ vai trò khán giả, không chuyển sang giám sát', async () => {
    const { room } = await createOpenRoom(ctx, { room: { allowSpectators: true } });
    const admin = await createUserAndLogin(ctx, { systemRole: 'super_admin' });
    await request(ctx.app)
      .post(`/api/rooms/${room.id}/join`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('x-olympia-csrf', '1')
      .send({ role: 'spectator', displayName: 'Admin xem' })
      .expect(201);

    const state = await subscribed(await connect(admin.accessToken), room.id);

    expect(state).not.toHaveProperty('monitor');
    expect(state.spectators.count).toBe(1);
  });
});
