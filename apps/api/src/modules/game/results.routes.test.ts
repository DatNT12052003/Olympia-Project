import { randomUUID } from 'node:crypto';
import {
  CSRF_HEADER,
  type HostCommand,
  historyListSchema,
  matchResultSchema,
  myStatsSchema,
  ResultsErrorCode,
  WARMUP_PRESETS,
  type WarmupRules,
} from '@olympia/shared';
import request from 'supertest';
import {
  createOpenRoom,
  createTestContext,
  createUserAndLogin,
  joinAsGuest,
  type TestContext,
} from '../../test/test-context';
import { AdminAuditLogEntity } from '../audit/admin-audit-log.entity';
import { UserEntity } from '../users/user.entity';
import { MatchQuestionEntity, MatchQuestionOutcomeEntity } from './match-records.entity';
import { rankPlayers } from './results.service';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
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
  };
}

function warmupRules(): WarmupRules {
  const rules = structuredClone(WARMUP_PRESETS[0]!.rules);
  rules.individual.enabled = true;
  rules.individual.questionsPerPlayer = 2;
  rules.shared.enabled = false;
  return rules;
}

/** Phòng có kịch bản Khởi động, Player ghế 1 là tài khoản, ghế 2 là khách; trận đã bắt đầu. */
async function startMatch() {
  const { host, room } = await createOpenRoom(ctx, { room: { autoApprove: true } });
  const api = authed(host.accessToken);
  const ids: string[] = [];
  for (let i = 0; i < 4; i += 1) {
    const res = await api.post('/api/questions', {
      content: `Câu hỏi thống kê ${i + 1}`,
      answer: { type: 'mcq', options: ['2', '3', '4', '6'], correctIndex: 2 },
      explanation: 'Vì 2 + 2 = 4.',
      subject: 'Toán',
      topic: 'Số học',
      rounds: ['warmup'],
    });
    ids.push((res.body as { question: { id: string } }).question.id);
  }
  const set = await api.post('/api/question-sets', { name: `Bộ ${randomUUID().slice(0, 6)}` });
  const setId = (set.body as { set: { id: string } }).set.id;
  await api.post(`/api/question-sets/${setId}/items`, { questionIds: ids, round: 'warmup' });
  const script = await api.post('/api/scripts', {
    name: 'Kịch bản thống kê',
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
  const scriptId = (script.body as { script: { id: string } }).script.id;
  expect((await api.patch(`/api/rooms/${room.id}`, { scriptId })).status).toBe(200);

  const player = await createUserAndLogin(ctx, { displayName: 'Minh Anh' });
  const joined = await request(ctx.app)
    .post(`/api/rooms/${room.id}/join`)
    .set(CSRF_HEADER, '1')
    .set('Authorization', `Bearer ${player.accessToken}`)
    .send({ role: 'player' });
  expect(joined.status).toBe(201);
  const guest = await joinAsGuest(ctx, room.id, 'Bảo Ngọc', 'player');
  const spectator = await joinAsGuest(ctx, room.id, 'Khán giả', 'spectator');
  for (const token of [player.accessToken, guest.accessToken]) {
    expect(
      (await authed(token).post(`/api/rooms/${room.id}/me/ready`, { ready: true })).status,
    ).toBe(204);
  }
  const started = await api.post(`/api/rooms/${room.id}/match`);
  expect(started.status).toBe(201);
  const matchId = (started.body as { matchId: string }).matchId;
  return { host, api, room, player, guest, spectator, matchId };
}

function command(matchId: string, hostUserId: string, cmd: HostCommand) {
  return ctx.game.runtime.dispatch(
    matchId,
    { type: 'command', command: cmd },
    { actionId: randomUUID(), actorUserId: hostUserId },
  );
}

async function answerCurrent(roomId: string, hostUserId: string, matchId: string, index: number) {
  const view = await ctx.game.runtime.viewFor(roomId, { role: 'host', key: `u:${hostUserId}` });
  const ref = view!.round.question!.ref;
  await ctx.game.runtime.dispatch(
    matchId,
    {
      type: 'answer',
      seat: 1,
      questionRef: ref,
      answer: { type: 'mcq', index },
      receivedAt: Date.now(),
    },
    { actionId: randomUUID() },
  );
}

describe('rankPlayers', () => {
  it('đồng hạng khi bằng điểm; người thắng câu hỏi phụ đứng trên (9.3)', () => {
    const players = [
      { seat: 1, score: 40 },
      { seat: 2, score: 40 },
      { seat: 3, score: 10 },
    ];
    expect([...rankPlayers(players, null).values()]).toEqual([1, 1, 3]);
    expect([...rankPlayers(players, 2).values()]).toEqual([2, 1, 3]);
  });
});

describe('Kết quả, lịch sử, thống kê /api/matches', () => {
  it('ghi câu đã dùng và kết quả; tổng kết theo vai trò; công bố đáp án; hủy kết quả', async () => {
    const m = await startMatch();
    const hostUserId = m.host.user.id;
    // Câu 1 của ghế 1: đúng; câu 2: sai. Sau đó Host kết thúc sớm.
    await command(m.matchId, hostUserId, { type: 'next_question' });
    await command(m.matchId, hostUserId, { type: 'start_timer' });
    await answerCurrent(m.room.id, hostUserId, m.matchId, 2);
    await command(m.matchId, hostUserId, { type: 'judge', seat: 1, correct: true });
    await command(m.matchId, hostUserId, { type: 'next_question' });
    await command(m.matchId, hostUserId, { type: 'start_timer' });
    await answerCurrent(m.room.id, hostUserId, m.matchId, 0);
    await command(m.matchId, hostUserId, { type: 'judge', seat: 1, correct: false });
    await command(m.matchId, hostUserId, { type: 'end_match' });

    // Mục 14: câu hỏi đã dùng và kết quả theo ghế được lưu khi rời vòng.
    const questions = await ctx.dataSource
      .getRepository(MatchQuestionEntity)
      .findBy({ matchId: m.matchId });
    expect(questions).toHaveLength(2);
    expect(questions[0]).toMatchObject({ subject: 'Toán', topic: 'Số học', roundType: 'warmup' });
    const outcomes = await ctx.dataSource
      .getRepository(MatchQuestionOutcomeEntity)
      .findBy({ matchId: m.matchId });
    expect(outcomes.map((o) => o.result).sort()).toEqual(['correct', 'wrong']);

    // Host: tổng kết đầy đủ kèm đáp án.
    const hostView = matchResultSchema.parse((await m.api.get(`/api/matches/${m.matchId}`)).body);
    expect(hostView).toMatchObject({
      roomName: 'Phòng test',
      outcome: 'ended_early',
      answersPublic: true,
      viewer: { role: 'host', canToggleAnswers: true, canVoid: false },
    });
    expect(hostView.players[0]).toMatchObject({
      seat: 1,
      displayName: 'Minh Anh',
      rank: 1,
      score: 10,
      winner: true,
      stats: { correct: 1, wrong: 1, skipped: 0, buzzWins: 0 },
    });
    expect(hostView.players[0]!.stats.avgAnswerMs).not.toBeNull();
    expect(hostView.players[0]!.roundScores).toEqual([10]);
    expect(hostView.hardQuestions).toHaveLength(1);
    expect(hostView.questions?.[0]).toMatchObject({
      explanation: 'Vì 2 + 2 = 4.',
      outcomes: [{ seat: 1, result: 'correct' }],
    });

    // Player (tài khoản), khách và khán giả của phòng xem được; người ngoài không.
    const player = authed(m.player.accessToken);
    expect(
      matchResultSchema.parse((await player.get(`/api/matches/${m.matchId}`)).body).viewer,
    ).toMatchObject({ role: 'player', seat: 1, canToggleAnswers: false });
    expect((await authed(m.guest.accessToken).get(`/api/matches/${m.matchId}`)).status).toBe(200);
    const spectatorView = await authed(m.spectator.accessToken).get(`/api/matches/${m.matchId}`);
    expect((spectatorView.body as { viewer: { role: string } }).viewer.role).toBe('spectator');
    const stranger = await createUserAndLogin(ctx);
    expect((await authed(stranger.accessToken).get(`/api/matches/${m.matchId}`)).status).toBe(404);

    // DL-048: Host tắt công bố đáp án → Player không còn thấy câu hỏi; Player không đổi được.
    expect(
      (await player.put(`/api/matches/${m.matchId}/answers-visibility`, { answersPublic: true }))
        .status,
    ).toBe(404);
    expect(
      (await m.api.put(`/api/matches/${m.matchId}/answers-visibility`, { answersPublic: false }))
        .status,
    ).toBe(204);
    expect(
      matchResultSchema.parse((await player.get(`/api/matches/${m.matchId}`)).body).questions,
    ).toBeNull();
    expect(
      matchResultSchema.parse((await m.api.get(`/api/matches/${m.matchId}`)).body).questions,
    ).toHaveLength(2);

    // Lịch sử: Host thấy trận đã tổ chức, Player thấy trận đã tham gia.
    const hosted = historyListSchema.parse((await m.api.get('/api/matches?scope=hosted')).body);
    expect(hosted.items[0]).toMatchObject({
      matchId: m.matchId,
      outcome: 'ended_early',
      winners: [{ seat: 1, displayName: 'Minh Anh', score: 10 }],
      mySeat: null,
    });
    const played = historyListSchema.parse(
      (await player.get('/api/matches?scope=played&q=Minh&days=30')).body,
    );
    expect(played.items.map((i) => [i.matchId, i.mySeat])).toEqual([[m.matchId, 1]]);
    const guestHistory = historyListSchema.parse(
      (await authed(m.guest.accessToken).get('/api/matches')).body,
    );
    expect(guestHistory.items[0]?.mySeat).toBe(2);
    expect((await player.get('/api/matches?scope=all')).status).toBe(403);
    expect(
      historyListSchema.parse((await player.get('/api/matches?status=voided')).body).total,
    ).toBe(0);

    // Thống kê Player và Host.
    const playerStats = myStatsSchema.parse((await player.get('/api/matches/stats')).body);
    expect(playerStats.player).toMatchObject({ matches: 1, wins: 1, correct: 1, answered: 2 });
    expect(playerStats.player.bySubject).toEqual([
      { subject: 'Toán', topic: 'Số học', correct: 1, total: 2 },
    ]);
    const hostStats = myStatsSchema.parse((await m.api.get('/api/matches/stats')).body);
    expect(hostStats.host).toMatchObject({ rooms: 1, matches: 1, players: 2, correct: 1 });
    expect(hostStats.host?.hardQuestions[0]).toMatchObject({ wrong: 1, total: 1 });

    // BR-HIST-01: chỉ Super Admin hủy kết quả, có lý do, ghi nhật ký; không hủy hai lần.
    expect(
      (await m.api.post(`/api/matches/${m.matchId}/void`, { reason: 'Gian lận' })).status,
    ).toBe(403);
    const admin = authed(
      (await createUserAndLogin(ctx, { systemRole: 'super_admin' })).accessToken,
    );
    expect((await admin.post(`/api/matches/${m.matchId}/void`, { reason: '' })).status).toBe(400);
    expect(
      (await admin.post(`/api/matches/${m.matchId}/void`, { reason: 'Gian lận bị phát hiện' }))
        .status,
    ).toBe(204);
    const again = await admin.post(`/api/matches/${m.matchId}/void`, { reason: 'Lần nữa' });
    expect((again.body as { error: { code: string } }).error.code).toBe(
      ResultsErrorCode.MatchAlreadyVoided,
    );
    const voided = matchResultSchema.parse((await admin.get(`/api/matches/${m.matchId}`)).body);
    expect(voided).toMatchObject({
      outcome: 'voided',
      voided: { reason: 'Gian lận bị phát hiện' },
      viewer: { role: 'staff', canVoid: false },
    });
    expect(voided.players.every((p) => !p.winner)).toBe(true);
    expect(
      await ctx.dataSource
        .getRepository(AdminAuditLogEntity)
        .existsBy({ action: 'match.void', targetId: m.matchId }),
    ).toBe(true);
    const afterVoid = myStatsSchema.parse((await player.get('/api/matches/stats')).body);
    expect(afterVoid.player).toMatchObject({ matches: 0, wins: 0, answered: 0 });
    const allHistory = historyListSchema.parse(
      (await admin.get('/api/matches?scope=all&status=voided')).body,
    );
    expect(allHistory.items.some((i) => i.matchId === m.matchId && i.winners.length === 0)).toBe(
      true,
    );

    // BR-DATA-03: tài khoản bị xóa thì kết quả cũ được ẩn danh.
    await ctx.dataSource
      .getRepository(UserEntity)
      .update(
        { id: m.player.user.id },
        { status: 'pending_deletion', deletionRequestedAt: new Date(Date.now() - 31 * 864e5) },
      );
    await ctx.dataRetention.tick();
    expect(
      (await ctx.dataSource.getRepository(UserEntity).findOneByOrFail({ id: m.player.user.id }))
        .status,
    ).toBe('deleted');
    const anonymized = matchResultSchema.parse((await m.api.get(`/api/matches/${m.matchId}`)).body);
    expect(anonymized.players.find((p) => p.seat === 1)?.displayName).toBe('Người chơi đã xóa');
  });

  it('trận chưa kết thúc chưa có tổng kết; quản trị viên đóng phòng đang thi kết thúc trận', async () => {
    const m = await startMatch();
    expect((await m.api.get(`/api/matches/${m.matchId}`)).status).toBe(404);
    expect(await ctx.game.runtime.forceEnd(m.room.id, m.host.user.id)).toBe(true);
    const result = matchResultSchema.parse((await m.api.get(`/api/matches/${m.matchId}`)).body);
    expect(result.outcome).toBe('abnormal');
  });
});
