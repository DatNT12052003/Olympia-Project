import { randomUUID } from 'node:crypto';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  type Ack,
  type ClientToServerEvents,
  CommonErrorCode,
  type HostCommand,
  MatchErrorCode,
  type MatchView,
  type ServerToClientEvents,
  WARMUP_PRESETS,
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
import { createMatchRealtime } from './match-realtime';
import {
  createRealtimeServer,
  createTokenSocketAuthenticator,
  type RealtimeServer,
} from './realtime-server';
import { createRoomRealtime } from './room-realtime';

type Client = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

/** `emitWithAck` có kiểu ack tường minh (Socket.IO suy ra `any` khi có timeout). */
function ack<T = undefined>(client: Client, event: keyof ClientToServerEvents, payload: object) {
  const timed = client.timeout(3000) as unknown as {
    emitWithAck(event: string, payload: object): Promise<Ack<T>>;
  };
  return timed.emitWithAck(event, payload);
}

let ctx: TestContext;
let httpServer: HttpServer;
let io: RealtimeServer;
let url: string;
const clients: Client[] = [];

beforeAll(async () => {
  ctx = await createTestContext();
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
    onPresence: (roomId, key, connected) => {
      ctx.game.runtime.onPresence(roomId, key, connected).catch(() => undefined);
    },
  });
  const matchRealtime = createMatchRealtime({
    io,
    lobby: ctx.lobbyService,
    runtime: ctx.game.runtime,
    presence: ctx.presence,
    limiters: memoryLimiterFactory,
    logger: silentLogger,
  });
  ctx.attachRoomEvents(roomRealtime.events);
  ctx.game.runtime.attachPublisher(matchRealtime.publisher);
  io.on('connection', (socket) => {
    roomRealtime.register(socket);
    matchRealtime.register(socket);
  });
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
});

afterEach(() => {
  for (const client of clients.splice(0)) client.disconnect();
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    void io.close(() => resolve());
  });
  await ctx.close();
});

async function connect(token: string, roomId: string): Promise<Client> {
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
  const result = await ack(client, 'room:subscribe', { roomId });
  if (!result.ok) throw new Error(result.error.code);
  return client;
}

function nextMatchState(
  client: Client,
  predicate: (view: MatchView) => boolean,
): Promise<MatchView> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Không nhận được trạng thái trận mong đợi')),
      3000,
    );
    const handler = (view: MatchView) => {
      if (!predicate(view)) return;
      clearTimeout(timer);
      client.off('match:state', handler);
      resolve(view);
    };
    client.on('match:state', handler);
  });
}

function hostCommand(client: Client, roomId: string, command: HostCommand) {
  return ack(client, 'match:command', { roomId, actionId: randomUUID(), command });
}

/** Phòng đang thi: Host, 2 người chơi khách và 1 khán giả đều đã kết nối. */
async function liveMatch() {
  const { host, room, hostAuth } = await createOpenRoom(ctx, { room: { autoApprove: true } });
  const qIds: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const res = await request(ctx.app)
      .post('/api/questions')
      .set('Authorization', hostAuth)
      .send({
        content: `Câu ${i}`,
        answer: { type: 'true_false', correct: true },
      });
    qIds.push((res.body as { question: { id: string } }).question.id);
  }
  const set = await request(ctx.app)
    .post('/api/question-sets')
    .set('Authorization', hostAuth)
    .send({ name: 'Bộ realtime' });
  const setId = (set.body as { set: { id: string } }).set.id;
  await request(ctx.app)
    .post(`/api/question-sets/${setId}/items`)
    .set('Authorization', hostAuth)
    .send({ questionIds: qIds, round: 'warmup' });
  const rules = structuredClone(WARMUP_PRESETS[0]!.rules);
  rules.individual.questionsPerPlayer = 1;
  rules.shared.questionCount = 2;
  const script = await request(ctx.app)
    .post('/api/scripts')
    .set('Authorization', hostAuth)
    .send({
      name: 'Kịch bản realtime',
      settings: {
        breakSeconds: 0,
        soundEffects: false,
        allowNegativeScore: false,
        onTurnDisconnect: 'skip',
      },
      rounds: [{ type: 'warmup', preset: 'olympia', source: { kind: 'set', setId }, rules }],
    });
  const scriptId = (script.body as { script: { id: string } }).script.id;
  await request(ctx.app)
    .patch(`/api/rooms/${room.id}`)
    .set('Authorization', hostAuth)
    .send({ scriptId });

  const p1 = await joinAsGuest(ctx, room.id, 'Minh Anh', 'player');
  const p2 = await joinAsGuest(ctx, room.id, 'Bảo Ngọc', 'player');
  const spectator = await joinAsGuest(ctx, room.id, 'Khán giả', 'spectator');
  const hostClient = await connect(host.accessToken, room.id);
  const p1Client = await connect(p1.accessToken, room.id);
  const p2Client = await connect(p2.accessToken, room.id);
  const specClient = await connect(spectator.accessToken, room.id);

  const started = nextMatchState(p1Client, (v) => v.status === 'running');
  const res = await request(ctx.app)
    .post(`/api/rooms/${room.id}/match`)
    .set('Authorization', hostAuth)
    .send({ skipReady: true });
  expect(res.status).toBe(201);
  await started;
  return { roomId: room.id, host, p1, hostClient, p1Client, p2Client, specClient };
}

describe('Realtime trận đấu', () => {
  it('mỗi đối tượng nhận đúng view; đáp án chỉ tới Host trước khi công bố (BR-RT-01)', async () => {
    const m = await liveMatch();
    const playerSees = nextMatchState(m.p1Client, (v) => v.round.question?.phase === 'showing');
    const specSees = nextMatchState(m.specClient, (v) => v.round.question?.phase === 'showing');
    const hostSees = nextMatchState(m.hostClient, (v) => v.round.question?.phase === 'showing');
    expect(await hostCommand(m.hostClient, m.roomId, { type: 'next_question' })).toEqual({
      ok: true,
    });
    const [p, s, h] = await Promise.all([playerSees, specSees, hostSees]);
    expect(p.audience).toBe('player');
    expect(p.mySeat).toBe(1);
    expect(s.audience).toBe('spectator');
    expect(h.audience).toBe('host');
    expect(h.round.question?.correctAnswer).toEqual({ type: 'true_false', correct: true });
    expect(p.round.question?.correctAnswer).toBeNull();
    expect(s.round.question?.correctAnswer).toBeNull();
    expect(s.log).toEqual([]);

    // Kết nối lại: đồng bộ trạng thái hiện tại (BR-RC-02).
    const sync = await ack<MatchView | null>(m.p2Client, 'match:sync', { roomId: m.roomId });
    expect(sync.ok && sync.data?.mySeat).toBe(2);
  });

  it('server từ chối hành động trái vai trò (BR-SPEC-01, BR-ROLE-05)', async () => {
    const m = await liveMatch();
    await hostCommand(m.hostClient, m.roomId, { type: 'next_question' });
    await hostCommand(m.hostClient, m.roomId, { type: 'start_timer' });
    const ref = await ack<MatchView | null>(m.hostClient, 'match:sync', { roomId: m.roomId });
    const questionRef = ref.ok ? ref.data!.round.question!.ref : '';

    const specAnswer = await ack(m.specClient, 'match:answer', {
      roomId: m.roomId,
      actionId: randomUUID(),
      questionRef,
      answer: { type: 'true_false', value: true },
    });
    expect(specAnswer.ok ? null : specAnswer.error.code).toBe(CommonErrorCode.Forbidden);
    const specBuzz = await ack(m.specClient, 'match:buzz', {
      roomId: m.roomId,
      actionId: randomUUID(),
      questionRef,
    });
    expect(specBuzz.ok).toBe(false);
    const playerCommand = await hostCommand(m.p1Client, m.roomId, { type: 'end_match' });
    expect(playerCommand.ok ? null : playerCommand.error.code).toBe(CommonErrorCode.Forbidden);
    const notTurn = await ack(m.p2Client, 'match:answer', {
      roomId: m.roomId,
      actionId: randomUUID(),
      questionRef,
      answer: { type: 'true_false', value: true },
    });
    expect(notTurn.ok ? null : notTurn.error.code).toBe(MatchErrorCode.NotYourTurn);

    const answered = await ack(m.p1Client, 'match:answer', {
      roomId: m.roomId,
      actionId: randomUUID(),
      questionRef,
      answer: { type: 'true_false', value: true },
    });
    expect(answered.ok).toBe(true);
  });

  it('Super Admin giám sát giữa trận: nhận bản khán giả, không thấy đáp án, không điều khiển/trả lời (BR-ROLE-04)', async () => {
    const m = await liveMatch();
    const admin = await createUserAndLogin(ctx, { systemRole: 'super_admin' });
    const adminClient = await connect(admin.accessToken, m.roomId);

    const sync = await ack<MatchView | null>(adminClient, 'match:sync', { roomId: m.roomId });
    expect(sync.ok && sync.data?.audience).toBe('spectator');

    const adminSees = nextMatchState(adminClient, (v) => v.round.question?.phase === 'showing');
    await hostCommand(m.hostClient, m.roomId, { type: 'next_question' });
    const view = await adminSees;
    expect(view.audience).toBe('spectator');
    expect(view.round.question?.correctAnswer).toBeNull();

    const command = await hostCommand(adminClient, m.roomId, { type: 'end_match' });
    expect(command.ok).toBe(false);
    const answer = await ack(adminClient, 'match:answer', {
      roomId: m.roomId,
      actionId: randomUUID(),
      questionRef: view.round.question!.ref,
      answer: { type: 'true_false', value: true },
    });
    expect(answer.ok).toBe(false);
  });

  it('Host mất kết nối: trận tạm dừng cho mọi người (4.5)', async () => {
    const m = await liveMatch();
    const paused = nextMatchState(m.p1Client, (v) => v.status === 'paused');
    m.hostClient.disconnect();
    const view = await paused;
    expect(view.pause?.reason).toBe('host_disconnected');
  });
});
