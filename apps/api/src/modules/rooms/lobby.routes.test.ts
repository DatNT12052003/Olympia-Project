import {
  apiErrorBodySchema,
  CSRF_HEADER,
  joinRoomResponseSchema,
  type RoomState,
} from '@olympia/shared';
import request from 'supertest';
import {
  createOpenRoom,
  createTestContext,
  createUserAndLogin,
  joinAsGuest,
  type TestContext,
} from '../../test/test-context';
import type { RoomEvents } from './room-events';

let ctx: TestContext;
const events: { kind: string; roomId: string; key?: string; reason?: string }[] = [];

beforeAll(async () => {
  ctx = await createTestContext();
  const recorder: RoomEvents = {
    stateChanged: (roomId) => events.push({ kind: 'state', roomId }),
    removed: (roomId, key, reason) => events.push({ kind: 'removed', roomId, key, reason }),
    closed: (roomId) => events.push({ kind: 'closed', roomId }),
  };
  ctx.attachRoomEvents(recorder);
});

afterAll(async () => {
  await ctx.close();
});

function join(roomId: string, body: object, auth?: string) {
  const req = request(ctx.app).post(`/api/rooms/${roomId}/join`).set(CSRF_HEADER, '1');
  return (auth ? req.set('Authorization', auth) : req).send(body);
}

const as = (auth: string) => ({
  post: (path: string, body: object = {}) =>
    request(ctx.app).post(path).set('Authorization', auth).send(body),
  put: (path: string, body: object) =>
    request(ctx.app).put(path).set('Authorization', auth).send(body),
  delete: (path: string) => request(ctx.app).delete(path).set('Authorization', auth),
  get: (path: string) => request(ctx.app).get(path).set('Authorization', auth),
});

function code(body: unknown): string {
  return apiErrorBodySchema.parse(body).error.code;
}

function hostState(roomId: string): Promise<RoomState> {
  return ctx.lobbyService.buildState(roomId, 'host');
}

describe('Vào phòng (4.4)', () => {
  it('người chơi vào sảnh chờ ở trạng thái chờ duyệt; Host duyệt thì được xếp ghế trống', async () => {
    const { room, hostAuth } = await createOpenRoom(ctx);
    const user = await createUserAndLogin(ctx, { displayName: 'Minh Anh' });

    const res = await join(room.id, { role: 'player' }, `Bearer ${user.accessToken}`);
    const { participant } = joinRoomResponseSchema.parse(res.body);

    expect(res.status).toBe(201);
    expect(participant).toMatchObject({
      displayName: 'Minh Anh',
      kind: 'user',
      role: 'player',
      status: 'pending',
      seat: null,
    });
    expect((await hostState(room.id)).pending.map((p) => p.id)).toEqual([participant.id]);

    await as(hostAuth)
      .post(`/api/rooms/${room.id}/participants/${participant.id}/approve`)
      .expect(204);

    const state = await hostState(room.id);
    expect(state.pending).toHaveLength(0);
    expect(state.players).toMatchObject([{ id: participant.id, status: 'approved', seat: 1 }]);
  });

  it('phòng tự động duyệt cho người chơi ngồi ghế trống thấp nhất', async () => {
    const { room } = await createOpenRoom(ctx, { room: { autoApprove: true } });

    const first = await joinAsGuest(ctx, room.id, 'An', 'player');
    const second = await joinAsGuest(ctx, room.id, 'Bình', 'player');

    expect(first.participant).toMatchObject({ status: 'approved', seat: 1 });
    expect(second.participant).toMatchObject({ status: 'approved', seat: 2 });
  });

  it('không vượt số người chơi (BR-JOIN-01); đủ chỗ thì chỉ vào được làm khán giả', async () => {
    const { room } = await createOpenRoom(ctx, { room: { maxPlayers: 2, autoApprove: true } });
    await joinAsGuest(ctx, room.id, 'An', 'player');
    await joinAsGuest(ctx, room.id, 'Bình', 'player');

    const third = await join(room.id, { role: 'player', displayName: 'Chi' });
    const spectator = await join(room.id, { role: 'spectator', displayName: 'Chi' });

    expect(third.status).toBe(409);
    expect(code(third.body)).toBe('ROOM_FULL');
    expect(spectator.status).toBe(201);
  });

  it('nhiều người vào đồng thời không vượt số ghế', async () => {
    const { room } = await createOpenRoom(ctx, { room: { maxPlayers: 3, autoApprove: true } });

    const results = await Promise.all(
      ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'].map((name) =>
        join(room.id, { role: 'player', displayName: name }),
      ),
    );

    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    const seats = (await hostState(room.id)).players.map((p) => p.seat).sort();
    expect(seats).toEqual([1, 2, 3]);
  });

  it('tên hiển thị không trùng trong phòng, kể cả với Host (BR-AUTH-04)', async () => {
    const { room } = await createOpenRoom(ctx, { host: { displayName: 'Cô Thu Hà' } });
    await joinAsGuest(ctx, room.id, 'Minh Anh');

    const duplicate = await join(room.id, { role: 'spectator', displayName: 'MINH ANH' });
    const hostName = await join(room.id, { role: 'spectator', displayName: 'cô thu hà' });

    expect(duplicate.status).toBe(409);
    expect(code(duplicate.body)).toBe('DISPLAY_NAME_TAKEN');
    expect(code(hostName.body)).toBe('DISPLAY_NAME_TAKEN');
  });

  it('tài khoản bị trùng tên đổi được tên trong phòng', async () => {
    const { room } = await createOpenRoom(ctx);
    await joinAsGuest(ctx, room.id, 'Người test');
    const user = await createUserAndLogin(ctx, { displayName: 'Người test' });
    const auth = `Bearer ${user.accessToken}`;

    const clash = await join(room.id, { role: 'spectator' }, auth);
    const renamed = await join(room.id, { role: 'spectator', displayName: 'Người test 2' }, auth);

    expect(clash.status).toBe(409);
    expect(joinRoomResponseSchema.parse(renamed.body).participant.displayName).toBe('Người test 2');
  });

  it('phòng không cho phép khách thì khách không vào được', async () => {
    const { room } = await createOpenRoom(ctx, { room: { allowGuests: false } });

    const res = await join(room.id, { role: 'spectator', displayName: 'Khách' });

    expect(res.status).toBe(403);
    expect(code(res.body)).toBe('GUESTS_NOT_ALLOWED');
  });

  it('phòng có mật khẩu: sai mật khẩu bị từ chối', async () => {
    const { room } = await createOpenRoom(ctx, { room: { password: 'bi-mat-123' } });

    const wrong = await join(room.id, { role: 'spectator', displayName: 'Anh', password: 'sai' });
    const right = await join(room.id, {
      role: 'spectator',
      displayName: 'Anh',
      password: 'bi-mat-123',
    });

    expect(wrong.status).toBe(403);
    expect(code(wrong.body)).toBe('WRONG_ROOM_PASSWORD');
    expect(right.status).toBe(201);
  });

  it('Host không tham gia phòng của mình (BR-ROLE-03)', async () => {
    const { room, hostAuth } = await createOpenRoom(ctx);

    const res = await join(room.id, { role: 'player' }, hostAuth);

    expect(code(res.body)).toBe('HOST_CANNOT_JOIN');
  });

  it('vào lại khi đang ở trong phòng trả về lượt tham gia hiện có', async () => {
    const { room } = await createOpenRoom(ctx);
    const user = await createUserAndLogin(ctx);
    const auth = `Bearer ${user.accessToken}`;

    const first = joinRoomResponseSchema.parse(
      (await join(room.id, { role: 'player' }, auth)).body,
    );
    const again = joinRoomResponseSchema.parse(
      (await join(room.id, { role: 'player' }, auth)).body,
    );

    expect(again.participant.id).toBe(first.participant.id);
  });

  it('phiên khách chỉ có hiệu lực trong phòng đã vào (DL-028)', async () => {
    const roomA = await createOpenRoom(ctx);
    const roomB = await createOpenRoom(ctx);
    const guest = await joinAsGuest(ctx, roomA.room.id, 'Khách A');
    const auth = `Bearer ${guest.accessToken}`;

    const otherRoomMe = await as(auth).get(`/api/rooms/${roomB.room.id}/me`);
    const joinOther = joinRoomResponseSchema.parse(
      (await join(roomB.room.id, { role: 'spectator', displayName: 'Khách B' }, auth)).body,
    );

    expect(otherRoomMe.status).toBe(403);
    // Vào phòng khác bằng phiên cũ: được cấp danh tính khách mới.
    expect(joinOther.guestSession?.guest.id).not.toBe(guest.guest.id);
    expect(joinOther.guestSession?.guest.roomId).toBe(roomB.room.id);
  });

  it('phòng nháp không vào được', async () => {
    const host = await createUserAndLogin(ctx);
    const draft = await as(`Bearer ${host.accessToken}`).post('/api/rooms', {
      name: 'Nháp',
      maxPlayers: 2,
      visibility: 'private',
    });

    const res = await join((draft.body as { room: { id: string } }).room.id, {
      role: 'spectator',
      displayName: 'Anh',
    });

    expect(code(res.body)).toBe('ROOM_NOT_OPEN');
  });
});

describe('Host quản lý sảnh chờ (BR-JOIN-03)', () => {
  it('đổi ghế: ghế đã có người thì hai người đổi chỗ', async () => {
    const { room, hostAuth } = await createOpenRoom(ctx, { room: { autoApprove: true } });
    const a = await joinAsGuest(ctx, room.id, 'An', 'player');
    const b = await joinAsGuest(ctx, room.id, 'Bình', 'player');

    await as(hostAuth)
      .put(`/api/rooms/${room.id}/participants/${a.participant.id}/seat`, { seat: 2 })
      .expect(204);
    await as(hostAuth)
      .put(`/api/rooms/${room.id}/participants/${b.participant.id}/seat`, { seat: 4 })
      .expect(204);

    const seats = Object.fromEntries(
      (await hostState(room.id)).players.map((p) => [p.displayName, p.seat]),
    );
    expect(seats).toEqual({ An: 2, Bình: 4 });
  });

  it('không xếp ghế vượt số người chơi của phòng', async () => {
    const { room, hostAuth } = await createOpenRoom(ctx, {
      room: { maxPlayers: 2, autoApprove: true },
    });
    const a = await joinAsGuest(ctx, room.id, 'An', 'player');

    const res = await as(hostAuth).put(
      `/api/rooms/${room.id}/participants/${a.participant.id}/seat`,
      { seat: 3 },
    );

    expect(res.status).toBe(400);
  });

  it('chuyển người chơi thành khán giả giải phóng ghế', async () => {
    const { room, hostAuth } = await createOpenRoom(ctx, { room: { autoApprove: true } });
    const a = await joinAsGuest(ctx, room.id, 'An', 'player');

    await as(hostAuth)
      .put(`/api/rooms/${room.id}/participants/${a.participant.id}/role`, { role: 'spectator' })
      .expect(204);

    const state = await hostState(room.id);
    expect(state.players).toHaveLength(0);
    expect(state.spectators.items).toMatchObject([{ id: a.participant.id, seat: null }]);
  });

  it('kick: người bị mời ra vào lại được; ban: không vào lại được', async () => {
    const { room, hostAuth } = await createOpenRoom(ctx);
    const user = await createUserAndLogin(ctx);
    const auth = `Bearer ${user.accessToken}`;
    const first = joinRoomResponseSchema.parse(
      (await join(room.id, { role: 'spectator' }, auth)).body,
    );

    await as(hostAuth)
      .post(`/api/rooms/${room.id}/participants/${first.participant.id}/kick`)
      .expect(204);
    expect(events.at(-2)).toMatchObject({
      kind: 'removed',
      reason: 'kicked',
      key: `u:${user.user.id}`,
    });
    const second = joinRoomResponseSchema.parse(
      (await join(room.id, { role: 'spectator' }, auth)).body,
    );

    await as(hostAuth)
      .post(`/api/rooms/${room.id}/participants/${second.participant.id}/ban`)
      .expect(204);
    const third = await join(room.id, { role: 'spectator' }, auth);

    expect(third.status).toBe(403);
    expect(code(third.body)).toBe('BANNED_FROM_ROOM');
  });

  it('từ chối người chờ duyệt', async () => {
    const { room, hostAuth } = await createOpenRoom(ctx);
    const pending = await joinAsGuest(ctx, room.id, 'Chờ', 'player');

    await as(hostAuth)
      .post(`/api/rooms/${room.id}/participants/${pending.participant.id}/reject`)
      .expect(204);

    expect((await hostState(room.id)).pending).toHaveLength(0);
    expect(events.at(-2)).toMatchObject({ kind: 'removed', reason: 'rejected' });
  });

  it('người không phải Host không quản lý được sảnh chờ', async () => {
    const { room } = await createOpenRoom(ctx, { room: { autoApprove: true } });
    const a = await joinAsGuest(ctx, room.id, 'An', 'player');
    const b = await joinAsGuest(ctx, room.id, 'Bình', 'player');
    const stranger = await createUserAndLogin(ctx);

    const byGuest = await as(`Bearer ${b.accessToken}`).post(
      `/api/rooms/${room.id}/participants/${a.participant.id}/kick`,
    );
    const byStranger = await as(`Bearer ${stranger.accessToken}`).post(
      `/api/rooms/${room.id}/participants/${a.participant.id}/kick`,
    );

    // Khách không phải tài khoản; người lạ không phải Host.
    expect(byGuest.status).toBe(403);
    expect(byStranger.status).toBe(403);
  });
});

describe('Người tham gia tự thao tác', () => {
  it('người chơi có ghế bấm Sẵn sàng; khán giả thì không', async () => {
    const { room } = await createOpenRoom(ctx, { room: { autoApprove: true } });
    const player = await joinAsGuest(ctx, room.id, 'An', 'player');
    const spectator = await joinAsGuest(ctx, room.id, 'Xem');

    await as(`Bearer ${player.accessToken}`)
      .post(`/api/rooms/${room.id}/me/ready`, { ready: true })
      .expect(204);
    const bySpectator = await as(`Bearer ${spectator.accessToken}`).post(
      `/api/rooms/${room.id}/me/ready`,
      { ready: true },
    );

    expect((await hostState(room.id)).players[0]).toMatchObject({ ready: true });
    expect(bySpectator.status).toBe(409);
  });

  it('rời phòng khi chưa thi giải phóng vị trí (4.5)', async () => {
    const { room } = await createOpenRoom(ctx, { room: { autoApprove: true } });
    const player = await joinAsGuest(ctx, room.id, 'An', 'player');

    await as(`Bearer ${player.accessToken}`).delete(`/api/rooms/${room.id}/me`).expect(204);

    expect((await hostState(room.id)).players).toHaveLength(0);
    expect((await as(`Bearer ${player.accessToken}`).get(`/api/rooms/${room.id}/me`)).status).toBe(
      404,
    );
  });

  it('mỗi thay đổi tăng version trạng thái phòng (BR-RT-03)', async () => {
    const { room } = await createOpenRoom(ctx, { room: { autoApprove: true } });
    const before = (await hostState(room.id)).version;

    const player = await joinAsGuest(ctx, room.id, 'An', 'player');
    const afterJoin = (await hostState(room.id)).version;
    await as(`Bearer ${player.accessToken}`).post(`/api/rooms/${room.id}/me/ready`, {
      ready: true,
    });
    const afterReady = (await hostState(room.id)).version;

    expect(afterJoin).toBeGreaterThan(before);
    expect(afterReady).toBeGreaterThan(afterJoin);
  });

  it('bản trạng thái cho người chơi/khán giả không có danh sách chờ duyệt', async () => {
    const { room } = await createOpenRoom(ctx);
    await joinAsGuest(ctx, room.id, 'Chờ', 'player');

    expect((await ctx.lobbyService.buildState(room.id, 'member')).pending).toHaveLength(0);
    expect((await hostState(room.id)).pending).toHaveLength(1);
  });
});
