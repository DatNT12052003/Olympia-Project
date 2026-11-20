import { randomUUID } from 'node:crypto';
import {
  type HostCommand,
  MatchErrorCode,
  type MatchView,
  type ScriptDetail,
  type ScriptInput,
  ScriptErrorCode,
  WARMUP_PRESETS,
  type WarmupRules,
  type WarmupView,
} from '@olympia/shared';
import request from 'supertest';
import {
  createOpenRoom,
  createTestContext,
  createUserAndLogin,
  joinAsGuest,
  type TestContext,
} from '../../test/test-context';
import { RoomEntity } from '../rooms/room.entity';
import { MatchPlayerEntity } from './match-player.entity';
import {
  MatchAnswerEntity,
  MatchInterventionEntity,
  MatchScoreEventEntity,
} from './match-records.entity';
import type { MatchViews } from './match-runtime';
import { MatchEntity } from './match.entity';

let ctx: TestContext;
const published: MatchViews[] = [];

beforeAll(async () => {
  ctx = await createTestContext();
  ctx.game.runtime.attachPublisher({ publish: (views) => published.push(views) });
});

afterAll(async () => {
  await ctx.close();
});

function authed(token: string) {
  const auth = `Bearer ${token}`;
  return {
    get: (url: string) => request(ctx.app).get(url).set('Authorization', auth),
    post: (url: string, body?: object) =>
      request(ctx.app)
        .post(url)
        .set('Authorization', auth)
        .send(body ?? {}),
    put: (url: string, body: object) =>
      request(ctx.app).put(url).set('Authorization', auth).send(body),
    patch: (url: string, body: object) =>
      request(ctx.app).patch(url).set('Authorization', auth).send(body),
    delete: (url: string) => request(ctx.app).delete(url).set('Authorization', auth),
  };
}

type Api = ReturnType<typeof authed>;

function warmupRules(
  patch: { questionsPerPlayer?: number; shared?: boolean; sharedCount?: number } = {},
): WarmupRules {
  const base = structuredClone(WARMUP_PRESETS[0]!.rules);
  base.individual.enabled = (patch.questionsPerPlayer ?? 2) > 0;
  base.individual.questionsPerPlayer = Math.max(1, patch.questionsPerPlayer ?? 2);
  base.shared.enabled = patch.shared ?? true;
  base.shared.questionCount = patch.sharedCount ?? 2;
  return base;
}

/** Bộ đề có `count` câu trắc nghiệm xếp vào vòng Khởi động (đáp án đúng: phương án C). */
async function createWarmupSet(api: Api, count: number): Promise<string> {
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const res = await api.post('/api/questions', {
      content: `Câu hỏi khởi động ${i + 1}`,
      answer: { type: 'mcq', options: ['2', '3', '4', '6'], correctIndex: 2 },
      rounds: ['warmup'],
    });
    expect(res.status).toBe(201);
    ids.push((res.body as { question: { id: string } }).question.id);
  }
  const set = await api.post('/api/question-sets', { name: `Bộ đề ${randomUUID().slice(0, 6)}` });
  expect(set.status).toBe(201);
  const setId = (set.body as { set: { id: string } }).set.id;
  const added = await api.post(`/api/question-sets/${setId}/items`, {
    questionIds: ids,
    round: 'warmup',
  });
  expect(added.status).toBe(200);
  return setId;
}

async function createScript(
  api: Api,
  setId: string | null,
  rules: WarmupRules,
): Promise<ScriptDetail> {
  const input: ScriptInput = {
    name: 'Khởi động – Toán 11',
    settings: {
      breakSeconds: 30,
      soundEffects: true,
      allowNegativeScore: false,
      onTurnDisconnect: 'pause',
    },
    rounds: [
      {
        type: 'warmup',
        preset: 'olympia',
        source: setId ? { kind: 'set', setId } : null,
        rules,
      },
    ],
  };
  const res = await api.post('/api/scripts', input);
  expect(res.status).toBe(201);
  return (res.body as { script: ScriptDetail }).script;
}

interface Arena {
  roomId: string;
  host: Api;
  hostUserId: string;
  players: { token: string; key: string; seat: number }[];
}

/** Phòng mở với kịch bản, `playerCount` khách đã có ghế và Sẵn sàng. */
async function arena(
  options: { rules?: WarmupRules; questions?: number; playerCount?: number } = {},
): Promise<Arena> {
  const rules = options.rules ?? warmupRules();
  const { host, room } = await createOpenRoom(ctx, { room: { autoApprove: true } });
  const api = authed(host.accessToken);
  const setId = await createWarmupSet(api, options.questions ?? 8);
  const script = await createScript(api, setId, rules);
  expect((await api.patch(`/api/rooms/${room.id}`, { scriptId: script.id })).status).toBe(200);
  const players: Arena['players'] = [];
  for (let i = 0; i < (options.playerCount ?? 2); i += 1) {
    const guest = await joinAsGuest(ctx, room.id, `Người chơi ${i + 1}`, 'player');
    expect(guest.participant.seat).toBe(i + 1);
    const ready = await authed(guest.accessToken).post(`/api/rooms/${room.id}/me/ready`, {
      ready: true,
    });
    expect(ready.status).toBe(204);
    players.push({ token: guest.accessToken, key: `g:${guest.guest.id}`, seat: i + 1 });
  }
  return { roomId: room.id, host: api, hostUserId: host.user.id, players };
}

async function start(a: Arena): Promise<string> {
  const res = await a.host.post(`/api/rooms/${a.roomId}/match`);
  expect(res.status).toBe(201);
  return (res.body as { matchId: string }).matchId;
}

function command(a: Arena, matchId: string, cmd: HostCommand) {
  return ctx.game.runtime.dispatch(
    matchId,
    { type: 'command', command: cmd },
    {
      actionId: randomUUID(),
      actorUserId: a.hostUserId,
    },
  );
}

async function hostView(a: Arena): Promise<MatchView> {
  const view = await ctx.game.runtime.viewFor(a.roomId, { role: 'host', key: `u:${a.hostUserId}` });
  if (!view) throw new Error('Không có trận');
  return view;
}

describe('Kịch bản /api/scripts', () => {
  it('Host tạo, xem, sửa, nhân bản, xóa kịch bản; báo thiếu câu hỏi (BR-SCRIPT-01)', async () => {
    const { accessToken } = await createUserAndLogin(ctx);
    const api = authed(accessToken);
    const setId = await createWarmupSet(api, 5);
    const script = await createScript(api, setId, warmupRules());
    expect(script.rounds[0]?.source).toMatchObject({
      kind: 'set',
      available: 5,
      unavailable: false,
    });
    // 2 câu chung + 2 câu/người: 5 câu đủ cho 1 người → thiếu cho 2 người.
    expect(script.rounds[0]?.check.supportedPlayers).toBe(1);
    expect(script.rounds[0]?.check.issues).toHaveLength(1);

    const enough = await createScript(api, await createWarmupSet(api, 10), warmupRules());
    expect(enough.rounds[0]?.check).toEqual(
      expect.objectContaining({ supportedPlayers: 4, issues: [], fixed: 2, perPlayer: 2 }),
    );

    const list = await api.get('/api/scripts');
    expect(list.status).toBe(200);
    expect((list.body as { items: { id: string; supportedPlayers: number }[] }).items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: enough.id, supportedPlayers: 4 })]),
    );

    const copy = await api.post(`/api/scripts/${enough.id}/duplicate`);
    expect(copy.status).toBe(201);
    expect((copy.body as { script: ScriptDetail }).script.name).toContain('Bản sao');

    expect((await api.delete(`/api/scripts/${script.id}`)).status).toBe(204);
    expect((await api.get(`/api/scripts/${script.id}`)).status).toBe(404);
  });

  it('chỉ dùng bộ đề của chính mình; Player/khách không có quyền', async () => {
    const owner = authed((await createUserAndLogin(ctx)).accessToken);
    const other = authed((await createUserAndLogin(ctx)).accessToken);
    const setId = await createWarmupSet(owner, 2);
    const stolen = await other.post('/api/scripts', {
      name: 'Kịch bản lấy bộ đề người khác',
      settings: {
        breakSeconds: 0,
        soundEffects: false,
        allowNegativeScore: false,
        onTurnDisconnect: 'skip',
      },
      rounds: [
        { type: 'warmup', preset: 'olympia', source: { kind: 'set', setId }, rules: warmupRules() },
      ],
    });
    expect(stolen.status).toBe(400);
    expect((stolen.body as { error: { code: string } }).error.code).toBe(
      ScriptErrorCode.SourceUnavailable,
    );

    const script = await createScript(owner, setId, warmupRules());
    expect((await other.get(`/api/scripts/${script.id}`)).status).toBe(404);
    expect((await request(ctx.app).get('/api/scripts')).status).toBe(401);
    const unverified = await createUserAndLogin(ctx, { emailVerified: false });
    expect((await authed(unverified.accessToken).get('/api/scripts')).status).toBe(403);
  });

  it('phòng chỉ chọn được kịch bản của chính Host', async () => {
    const other = authed((await createUserAndLogin(ctx)).accessToken);
    const foreign = await createScript(other, null, warmupRules());
    const { host, room } = await createOpenRoom(ctx);
    const res = await authed(host.accessToken).patch(`/api/rooms/${room.id}`, {
      scriptId: foreign.id,
    });
    expect(res.status).toBe(400);
  });
});

describe('Bắt đầu trận POST /api/rooms/:roomId/match', () => {
  it('kiểm tra điều kiện bắt đầu: kịch bản, chế độ, số người, Sẵn sàng, đủ câu', async () => {
    const { host, room } = await createOpenRoom(ctx, { room: { autoApprove: true } });
    const api = authed(host.accessToken);
    const code = async () =>
      ((await api.post(`/api/rooms/${room.id}/match`)).body as { error: { code: string } }).error
        .code;

    expect(await code()).toBe(MatchErrorCode.NotEnoughPlayers);
    const p1 = await joinAsGuest(ctx, room.id, 'An', 'player');
    const p2 = await joinAsGuest(ctx, room.id, 'Bình', 'player');
    await authed(p1.accessToken).post(`/api/rooms/${room.id}/me/ready`, { ready: true });
    expect(await code()).toBe(MatchErrorCode.PlayersNotReady);
    await authed(p2.accessToken).post(`/api/rooms/${room.id}/me/ready`, { ready: true });
    expect(await code()).toBe(MatchErrorCode.ScriptMissing);

    const script = await createScript(api, await createWarmupSet(api, 5), warmupRules());
    await api.patch(`/api/rooms/${room.id}`, { scriptId: script.id });
    // 2 người × 2 câu + 2 câu chung = 6 > 5.
    expect(await code()).toBe(MatchErrorCode.ScriptInvalid);

    // Người chơi, khách không bắt đầu được trận.
    expect((await authed(p1.accessToken).post(`/api/rooms/${room.id}/match`)).status).toBe(403);
  });

  it('bắt đầu trận: chốt snapshot, phòng sang Đang thi, không sửa phòng được (BR-ROOM-01, BR-SCRIPT-03)', async () => {
    const a = await arena();
    const matchId = await start(a);
    const room = await ctx.dataSource.getRepository(RoomEntity).findOneByOrFail({ id: a.roomId });
    expect(room.status).toBe('in_match');
    const match = await ctx.dataSource.getRepository(MatchEntity).findOneByOrFail({ id: matchId });
    expect(match.scriptSnapshot.rounds[0]?.questions).toHaveLength(8);
    expect(await ctx.dataSource.getRepository(MatchPlayerEntity).countBy({ matchId })).toBe(2);
    expect((await a.host.post(`/api/rooms/${a.roomId}/match`)).status).toBe(409);
    expect((await a.host.patch(`/api/rooms/${a.roomId}`, { name: 'Đổi tên' })).status).toBe(409);
    expect(published.some((v) => v.host.matchId === matchId)).toBe(true);
    await command(a, matchId, { type: 'end_match' });
  });

  it('nhiều trận bắt đầu cùng lúc (nhiều hơn pool kết nối DB) không treo (kiểm thử tải P8)', async () => {
    const arenas = await Promise.all(Array.from({ length: 12 }, () => arena()));

    const results = await Promise.race([
      Promise.all(arenas.map((a) => a.host.post(`/api/rooms/${a.roomId}/match`))),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Bắt đầu trận bị treo (cạn pool DB)')), 20_000),
      ),
    ]);

    expect(results.map((r) => r.status)).toEqual(arenas.map(() => 201));
  }, 60_000);

  it('chơi một câu phần thi riêng; điểm, câu trả lời, sổ điểm và kết thúc trận được lưu bền', async () => {
    const a = await arena();
    const matchId = await start(a);
    await command(a, matchId, { type: 'next_question' });
    await command(a, matchId, { type: 'start_timer' });
    const ref = (await hostView(a)).round.question!.ref;
    const reply = await ctx.game.runtime.dispatch(
      matchId,
      {
        type: 'answer',
        seat: 1,
        questionRef: ref,
        answer: { type: 'mcq', index: 2 },
        receivedAt: Date.now(),
      },
      { actionId: randomUUID() },
    );
    expect(typeof (reply as { elapsedMs: unknown }).elapsedMs).toBe('number');
    await command(a, matchId, { type: 'judge', seat: 1, correct: true });
    await command(a, matchId, { type: 'adjust_score', seat: 2, delta: 5, reason: 'Thưởng' });
    expect((await hostView(a)).players.map((p) => p.score)).toEqual([10, 5]);

    await command(a, matchId, { type: 'end_match' });
    const match = await ctx.dataSource.getRepository(MatchEntity).findOneByOrFail({ id: matchId });
    expect(match.status).toBe('finished');
    expect(match.endedAt).not.toBeNull();
    const players = await ctx.dataSource.getRepository(MatchPlayerEntity).find({
      where: { matchId },
      order: { seat: 'ASC' },
    });
    expect(players.map((p) => p.finalScore)).toEqual([10, 5]);
    expect(await ctx.dataSource.getRepository(MatchAnswerEntity).countBy({ matchId })).toBe(1);
    const events = await ctx.dataSource
      .getRepository(MatchScoreEventEntity)
      .find({ where: { matchId } });
    expect(events.reduce((sum, e) => sum + e.delta, 0)).toBe(15);
    const interventions = await ctx.dataSource
      .getRepository(MatchInterventionEntity)
      .find({ where: { matchId } });
    expect(interventions.map((i) => i.action).sort()).toEqual(['adjust_score', 'end_match']);
    expect(interventions[0]?.actorUserId).toBe(a.hostUserId);

    const room = await ctx.dataSource.getRepository(RoomEntity).findOneByOrFail({ id: a.roomId });
    expect(room.status).toBe('open');
    expect(
      await ctx.game.runtime.viewFor(a.roomId, { role: 'host', key: `u:${a.hostUserId}` }),
    ).toBeNull();
  });

  it('nhiều Player bấm chuông cùng lúc: đúng một người giành quyền (8.5)', async () => {
    const a = await arena({ rules: warmupRules({ questionsPerPlayer: 0 }), playerCount: 4 });
    const matchId = await start(a);
    await command(a, matchId, { type: 'next_question' });
    await command(a, matchId, { type: 'start_timer' });
    const ref = (await hostView(a)).round.question!.ref;
    const replies = (await Promise.all(
      a.players.map((p) =>
        ctx.game.runtime.dispatch(
          matchId,
          { type: 'buzz', seat: p.seat, questionRef: ref, receivedAt: Date.now() },
          { actionId: randomUUID() },
        ),
      ),
    )) as { won: boolean }[];
    expect(replies.filter((r) => r.won)).toHaveLength(1);
    const winner = a.players[replies.findIndex((r) => r.won)]!.seat;
    expect(((await hostView(a)).round as WarmupView).buzz).toEqual({
      open: false,
      winnerSeat: winner,
      attemptedSeats: [winner],
    });
    await command(a, matchId, { type: 'end_match' });
  });

  it('gửi trùng cùng một hành động không bị ghi hai lần (BR-GAME-03)', async () => {
    const a = await arena();
    const matchId = await start(a);
    await command(a, matchId, { type: 'next_question' });
    await command(a, matchId, { type: 'start_timer' });
    const ref = (await hostView(a)).round.question!.ref;
    const actionId = randomUUID();
    const input = {
      type: 'answer' as const,
      seat: 1,
      questionRef: ref,
      answer: { type: 'mcq' as const, index: 1 },
      receivedAt: Date.now(),
    };
    const replies = await Promise.all(
      Array.from({ length: 5 }, () => ctx.game.runtime.dispatch(matchId, input, { actionId })),
    );
    expect(new Set(replies.map((r) => JSON.stringify(r))).size).toBe(1);
    expect(await ctx.dataSource.getRepository(MatchAnswerEntity).countBy({ matchId })).toBe(1);

    // Lần gửi khác (id mới) bị từ chối vì đã trả lời.
    await expect(
      ctx.game.runtime.dispatch(matchId, input, { actionId: randomUUID() }),
    ).rejects.toMatchObject({ code: MatchErrorCode.AnswerClosed });
    await command(a, matchId, { type: 'end_match' });
  });

  it('nhiều lệnh chấm điểm đồng thời không làm sai sổ điểm', async () => {
    const a = await arena();
    const matchId = await start(a);
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        command(a, matchId, {
          type: 'adjust_score',
          seat: (i % 2) + 1,
          delta: 3,
          reason: 'Kiểm thử đồng thời',
        }),
      ),
    );
    const view = await hostView(a);
    expect(view.players.map((p) => p.score)).toEqual([15, 15]);
    const events = await ctx.dataSource
      .getRepository(MatchScoreEventEntity)
      .find({ where: { matchId } });
    expect(events.map((e) => e.seq).sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    await command(a, matchId, { type: 'end_match' });
  });

  it('khôi phục trạng thái từ PostgreSQL khi Redis mất dữ liệu (DL-013)', async () => {
    const a = await arena();
    const matchId = await start(a);
    await command(a, matchId, { type: 'adjust_score', seat: 1, delta: 7, reason: 'Trước sự cố' });
    const keys = await ctx.redis.keys(`*match:${matchId}:*`);
    await ctx.redis.del(...keys);
    await command(a, matchId, { type: 'adjust_score', seat: 1, delta: 1, reason: 'Sau sự cố' });
    expect((await hostView(a)).players[0]?.score).toBe(8);
    await command(a, matchId, { type: 'end_match' });
  });
});
