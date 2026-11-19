import { AvErrorCode, avPolicyResponseSchema, avTokenResponseSchema } from '@olympia/shared';
import { TokenVerifier } from 'livekit-server-sdk';
import request from 'supertest';
import {
  createOpenRoom,
  createTestContext,
  joinAsGuest,
  type TestContext,
} from '../../test/test-context';
import { createLivekitGateway } from './av-gateway';
import { avRoomName } from './av.service';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

function bearer(token: string) {
  return `Bearer ${token}`;
}

async function tokenFor(roomId: string, accessToken: string) {
  return request(ctx.app)
    .post(`/api/rooms/${roomId}/av/token`)
    .set('Authorization', bearer(accessToken));
}

/** Phòng tự duyệt với 2 Player khách và 1 khán giả. */
async function roomWithMembers() {
  const { host, room } = await createOpenRoom(ctx, { room: { autoApprove: true } });
  const p1 = await joinAsGuest(ctx, room.id, 'An', 'player');
  const p2 = await joinAsGuest(ctx, room.id, 'Bình', 'player');
  const spectator = await joinAsGuest(ctx, room.id, 'Khán giả', 'spectator');
  return { host, room, p1, p2, spectator };
}

describe('Token video POST /api/rooms/:roomId/av/token', () => {
  it('cấp theo vai trò: Host và Player phát được, khán giả chỉ xem/nghe (BR-AV-04)', async () => {
    const { host, room, p1, spectator } = await roomWithMembers();

    const hostRes = await tokenFor(room.id, host.accessToken);
    expect(hostRes.status).toBe(200);
    expect(avTokenResponseSchema.parse(hostRes.body)).toMatchObject({
      url: 'ws://livekit.test',
      identity: `u:${host.user.id}`,
      canPublish: true,
    });

    const playerRes = await tokenFor(room.id, p1.accessToken);
    expect(playerRes.body).toMatchObject({ identity: `g:${p1.guest.id}`, canPublish: true });

    const spectatorRes = await tokenFor(room.id, spectator.accessToken);
    expect(spectatorRes.body).toMatchObject({ canPublish: false });

    const issued = ctx.fakeAv.tokens.filter((t) => t.room === avRoomName(room.id));
    expect(issued.map((t) => [JSON.parse(t.metadata) as unknown, t.sources])).toEqual([
      [{ role: 'host', participantId: null }, ['camera', 'microphone']],
      [{ role: 'player', participantId: p1.participant.id }, ['camera', 'microphone']],
      [{ role: 'spectator', participantId: spectator.participant.id }, null],
    ]);
  });

  it('người ngoài phòng, người chờ duyệt không nhận được token', async () => {
    const { room } = await createOpenRoom(ctx);
    const pending = await joinAsGuest(ctx, room.id, 'Chờ duyệt', 'player');
    expect((await tokenFor(room.id, pending.accessToken)).status).toBe(403);
    const other = await createOpenRoom(ctx);
    expect((await tokenFor(room.id, other.host.accessToken)).status).toBe(403);
    expect((await request(ctx.app).post(`/api/rooms/${room.id}/av/token`)).status).toBe(401);
  });

  it('máy chủ video lỗi: trả AV_UNAVAILABLE, không ảnh hưởng phòng (BR-AV-02)', async () => {
    const { host, room } = await createOpenRoom(ctx);
    ctx.fakeAv.setFailing(true);
    try {
      const res = await tokenFor(room.id, host.accessToken);
      expect(res.status).toBe(503);
      expect((res.body as { error: { code: string } }).error.code).toBe(AvErrorCode.Unavailable);
    } finally {
      ctx.fakeAv.setFailing(false);
    }
  });
});

describe('Chính sách âm thanh/hình ảnh của Host (11.2)', () => {
  it('chỉ Host xem/đổi chính sách', async () => {
    const { room, p1 } = await roomWithMembers();
    const res = await request(ctx.app)
      .patch(`/api/rooms/${room.id}/av/policy`)
      .set('Authorization', bearer(p1.accessToken))
      .send({ type: 'mute_all', value: true });
    expect(res.status).toBe(403);
  });

  it('khóa mic một Player: SFU thu quyền mic, tắt track đang phát; token mới cũng không có mic', async () => {
    const { host, room, p1, p2 } = await roomWithMembers();
    await tokenFor(room.id, p1.accessToken);
    await tokenFor(room.id, p2.accessToken);
    const name = avRoomName(room.id);
    const [t1, t2] = ctx.fakeAv.tokens.filter((t) => t.room === name);
    ctx.fakeAv.join(name, t1!, [{ sid: 'TR_mic1', source: 'microphone', muted: false }]);
    ctx.fakeAv.join(name, t2!);
    ctx.fakeAv.calls.length = 0;

    const res = await request(ctx.app)
      .patch(`/api/rooms/${room.id}/av/policy`)
      .set('Authorization', bearer(host.accessToken))
      .send({ type: 'lock', participantId: p1.participant.id, mic: true });
    expect(res.status).toBe(200);
    expect(avPolicyResponseSchema.parse(res.body).policy.locks).toEqual({
      [p1.participant.id]: { mic: true, cam: false },
    });
    expect(ctx.fakeAv.calls).toEqual([
      { op: 'setSources', room: name, identity: `g:${p1.guest.id}`, sources: ['camera'] },
      { op: 'muteTrack', room: name, identity: `g:${p1.guest.id}` },
      {
        op: 'setSources',
        room: name,
        identity: `g:${p2.guest.id}`,
        sources: ['camera', 'microphone'],
      },
    ]);

    await tokenFor(room.id, p1.accessToken);
    expect(ctx.fakeAv.tokens.at(-1)?.sources).toEqual(['camera']);
  });

  it('tắt tiếng toàn phòng và "chỉ người đến lượt được nói"', async () => {
    const { host, room, p1, p2 } = await roomWithMembers();
    await tokenFor(room.id, p1.accessToken);
    await tokenFor(room.id, p2.accessToken);
    const name = avRoomName(room.id);
    for (const t of ctx.fakeAv.tokens.filter((x) => x.room === name)) ctx.fakeAv.join(name, t);
    const patch = (body: object) =>
      request(ctx.app)
        .patch(`/api/rooms/${room.id}/av/policy`)
        .set('Authorization', bearer(host.accessToken))
        .send(body);
    const lastSources = () => {
      const result = new Map<string, string[] | undefined>();
      for (const call of ctx.fakeAv.calls) {
        if (call.op === 'setSources' && call.room === name)
          result.set(call.identity!, call.sources);
      }
      return result;
    };

    await patch({ type: 'mute_all', value: true });
    expect(lastSources().get(`g:${p1.guest.id}`)).toEqual(['camera']);
    expect(lastSources().get(`g:${p2.guest.id}`)).toEqual(['camera']);
    await patch({ type: 'mute_all', value: false });

    // Trận đang diễn ra, ghế của An đang đến lượt.
    await patch({ type: 'turn_only', value: true });
    ctx.av.onMatchViews({ roomId: room.id, running: true, speakerKey: `g:${p1.guest.id}` });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(lastSources().get(`g:${p1.guest.id}`)).toEqual(['camera', 'microphone']);
    expect(lastSources().get(`g:${p2.guest.id}`)).toEqual(['camera']);

    // Trận kết thúc: mọi người nói lại được.
    ctx.av.onMatchViews({ roomId: room.id, running: false, speakerKey: null });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(lastSources().get(`g:${p2.guest.id}`)).toEqual(['camera', 'microphone']);
  });

  it('Player bị kick thì bị ngắt khỏi phòng video', async () => {
    const { host, room, p1 } = await roomWithMembers();
    const res = await request(ctx.app)
      .post(`/api/rooms/${room.id}/participants/${p1.participant.id}/kick`)
      .set('Authorization', bearer(host.accessToken));
    expect(res.status).toBe(204);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(ctx.fakeAv.calls).toContainEqual({
      op: 'removeParticipant',
      room: avRoomName(room.id),
      identity: `g:${p1.guest.id}`,
    });
  });
});

describe('Gateway LiveKit', () => {
  it('token khán giả không có quyền phát; Player chỉ phát nguồn được phép', async () => {
    const gateway = createLivekitGateway({
      apiUrl: 'http://localhost:7880',
      apiKey: 'devkey',
      apiSecret: 'secret-secret-secret-secret-secret',
    });
    const verifier = new TokenVerifier('devkey', 'secret-secret-secret-secret-secret');
    const spectator = await verifier.verify(
      await gateway.createToken({
        room: 'room-x',
        identity: 'g:1',
        name: 'Khán giả',
        metadata: '{}',
        sources: null,
      }),
    );
    expect(spectator.video).toMatchObject({
      room: 'room-x',
      roomJoin: true,
      canPublish: false,
      canSubscribe: true,
    });
    const player = await verifier.verify(
      await gateway.createToken({
        room: 'room-x',
        identity: 'g:2',
        name: 'An',
        metadata: '{}',
        sources: ['camera'],
      }),
    );
    expect(player.sub).toBe('g:2');
    expect(player.video).toMatchObject({ canPublish: true, canPublishData: false });
    expect(player.video?.canPublishSources).toEqual(['camera']);

    // Bị khóa cả mic lẫn cam: không được phát (danh sách rỗng với LiveKit là "mọi nguồn").
    const locked = await verifier.verify(
      await gateway.createToken({
        room: 'room-x',
        identity: 'g:3',
        name: 'Bình',
        metadata: '{}',
        sources: [],
      }),
    );
    expect(locked.video?.canPublish).toBe(false);
  });
});
