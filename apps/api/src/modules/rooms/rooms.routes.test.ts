import {
  apiErrorBodySchema,
  hostRoomListSchema,
  hostRoomSchema,
  ROOM_CODE_ALPHABET,
  roomPreviewSchema,
} from '@olympia/shared';
import request from 'supertest';
import {
  createOpenRoom,
  createTestContext,
  createUserAndLogin,
  joinAsGuest,
  type TestContext,
} from '../../test/test-context';
import { RoomEntity } from './room.entity';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext({ maxActiveRoomsPerHost: 2 });
});

afterAll(async () => {
  await ctx.close();
});

const as = (auth: string) => ({
  get: (path: string) => request(ctx.app).get(path).set('Authorization', auth),
  post: (path: string, body: object = {}) =>
    request(ctx.app).post(path).set('Authorization', auth).send(body),
  patch: (path: string, body: object) =>
    request(ctx.app).patch(path).set('Authorization', auth).send(body),
  delete: (path: string) => request(ctx.app).delete(path).set('Authorization', auth),
});

function code(body: unknown): string {
  return apiErrorBodySchema.parse(body).error.code;
}

function roomOf(body: unknown) {
  return hostRoomSchema.parse((body as { room: unknown }).room);
}

const baseRoom = { name: 'Lớp 12A1 – Ôn thi', maxPlayers: 4, visibility: 'private' };

describe('Tạo và cấu hình phòng (4.1)', () => {
  it('lưu nháp: chưa có mã phòng; mở phòng thì được cấp mã 6 ký tự', async () => {
    const { accessToken } = await createUserAndLogin(ctx);
    const auth = `Bearer ${accessToken}`;

    const draft = roomOf((await as(auth).post('/api/rooms', baseRoom)).body);
    const opened = roomOf((await as(auth).post(`/api/rooms/${draft.id}/open`)).body);

    expect(draft).toMatchObject({
      status: 'draft',
      code: null,
      allowGuests: true,
      allowSpectators: true,
      maxSpectators: 50,
      controlMode: 'manual',
      autoApprove: false,
    });
    expect(opened.status).toBe('open');
    expect(opened.code).toMatch(new RegExp(`^[${ROOM_CODE_ALPHABET}]{6}$`));
  });

  it('kiểm tra ràng buộc: tên 3–100 ký tự, 2–4 người chơi, mật khẩu chỉ cho phòng riêng tư', async () => {
    const { accessToken } = await createUserAndLogin(ctx);
    const auth = `Bearer ${accessToken}`;

    const tooShort = await as(auth).post('/api/rooms', { ...baseRoom, name: 'ab' });
    const tooMany = await as(auth).post('/api/rooms', { ...baseRoom, maxPlayers: 5 });
    const publicPassword = await as(auth).post('/api/rooms', {
      ...baseRoom,
      visibility: 'public',
      password: 'mat-khau',
    });
    const tooManySpectators = await as(auth).post('/api/rooms', {
      ...baseRoom,
      maxSpectators: 500,
    });

    expect(tooShort.status).toBe(400);
    expect(tooMany.status).toBe(400);
    expect(publicPassword.status).toBe(400);
    expect(tooManySpectators.status).toBe(400);
  });

  it('chỉ tài khoản đã xác minh và còn quyền Host mới tạo được phòng (BR-AUTH-01)', async () => {
    const unverified = await createUserAndLogin(ctx, { emailVerified: false });
    const revoked = await createUserAndLogin(ctx, { canHost: false });

    expect((await as(`Bearer ${unverified.accessToken}`).post('/api/rooms', baseRoom)).status).toBe(
      403,
    );
    expect((await as(`Bearer ${revoked.accessToken}`).post('/api/rooms', baseRoom)).status).toBe(
      403,
    );
    expect((await request(ctx.app).post('/api/rooms').send(baseRoom)).status).toBe(401);
  });

  it('mật khẩu phòng được băm, không trả về client', async () => {
    const { accessToken } = await createUserAndLogin(ctx);
    const res = await as(`Bearer ${accessToken}`).post('/api/rooms', {
      ...baseRoom,
      password: 'bi-mat-123',
    });

    const room = roomOf(res.body);
    expect(room.hasPassword).toBe(true);
    expect(res.text).not.toContain('bi-mat-123');
    const stored = await ctx.dataSource
      .getRepository(RoomEntity)
      .createQueryBuilder('r')
      .addSelect('r.passwordHash')
      .where('r.id = :id', { id: room.id })
      .getOneOrFail();
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('chuyển sang công khai thì bỏ mật khẩu; không sửa được phòng của người khác', async () => {
    const { room, hostAuth } = await createOpenRoom(ctx, { room: { password: 'bi-mat-123' } });
    const other = await createUserAndLogin(ctx);

    const updated = roomOf(
      (await as(hostAuth).patch(`/api/rooms/${room.id}`, { visibility: 'public' })).body,
    );
    const foreign = await as(`Bearer ${other.accessToken}`).patch(`/api/rooms/${room.id}`, {
      name: 'Chiếm phòng',
    });

    expect(updated).toMatchObject({ visibility: 'public', hasPassword: false });
    expect(foreign.status).toBe(404);
  });

  it('không giảm số người chơi thấp hơn số người đang trong phòng', async () => {
    const { room, hostAuth } = await createOpenRoom(ctx, { room: { autoApprove: true } });
    for (const name of ['An', 'Bình', 'Chi']) await joinAsGuest(ctx, room.id, name, 'player');

    const res = await as(hostAuth).patch(`/api/rooms/${room.id}`, { maxPlayers: 2 });

    expect(res.status).toBe(409);
  });

  it('chỉ xóa được phòng nháp', async () => {
    const { accessToken } = await createUserAndLogin(ctx);
    const auth = `Bearer ${accessToken}`;
    const draft = roomOf((await as(auth).post('/api/rooms', baseRoom)).body);
    const opened = roomOf((await as(auth).post('/api/rooms', { ...baseRoom, open: true })).body);

    expect((await as(auth).delete(`/api/rooms/${opened.id}`)).status).toBe(409);
    expect((await as(auth).delete(`/api/rooms/${draft.id}`)).status).toBe(204);
  });
});

describe('Vòng đời phòng (4.3)', () => {
  it('giới hạn số phòng đang mở mỗi Host (BR-ROOM-03)', async () => {
    const { accessToken } = await createUserAndLogin(ctx);
    const auth = `Bearer ${accessToken}`;
    const first = roomOf((await as(auth).post('/api/rooms', { ...baseRoom, open: true })).body);
    await as(auth)
      .post('/api/rooms', { ...baseRoom, open: true })
      .expect(201);

    const third = await as(auth).post('/api/rooms', { ...baseRoom, open: true });
    expect(third.status).toBe(409);
    expect(code(third.body)).toBe('ROOM_LIMIT_REACHED');

    // Đóng bớt một phòng thì mở được phòng mới.
    await as(auth).post(`/api/rooms/${first.id}/close`).expect(200);
    await as(auth)
      .post('/api/rooms', { ...baseRoom, open: true })
      .expect(201);
    const list = hostRoomListSchema.parse((await as(auth).get('/api/rooms')).body);
    expect(list).toMatchObject({ activeCount: 2, activeLimit: 2 });
  });

  it('mở phòng đồng thời nhiều lần không vượt giới hạn', async () => {
    const { accessToken } = await createUserAndLogin(ctx);
    const auth = `Bearer ${accessToken}`;
    const drafts = await Promise.all(
      [1, 2, 3, 4].map(async () => roomOf((await as(auth).post('/api/rooms', baseRoom)).body)),
    );

    const results = await Promise.all(drafts.map((d) => as(auth).post(`/api/rooms/${d.id}/open`)));

    expect(results.filter((r) => r.status === 200)).toHaveLength(2);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
  });

  it('đổi mã phòng làm mã cũ hết hiệu lực (DL-027)', async () => {
    const { room, hostAuth } = await createOpenRoom(ctx);
    const oldCode = room.code!;

    const renewed = roomOf((await as(hostAuth).post(`/api/rooms/${room.id}/code`)).body);

    expect(renewed.code).not.toBe(oldCode);
    expect((await request(ctx.app).get(`/api/rooms/lookup?code=${oldCode}`)).status).toBe(404);
    expect((await request(ctx.app).get(`/api/rooms/lookup?code=${renewed.code}`)).status).toBe(200);
  });

  it('đóng phòng: người trong phòng rời phòng, không vào được nữa', async () => {
    const { room, hostAuth } = await createOpenRoom(ctx);
    await joinAsGuest(ctx, room.id, 'Khán giả');

    const closed = roomOf((await as(hostAuth).post(`/api/rooms/${room.id}/close`)).body);
    const join = await request(ctx.app)
      .post(`/api/rooms/${room.id}/join`)
      .set('x-olympia-csrf', '1')
      .send({ role: 'spectator', displayName: 'Muộn' });

    expect(closed).toMatchObject({ status: 'closed', spectatorCount: 0 });
    expect(join.status).toBe(409);
    expect(code(join.body)).toBe('ROOM_NOT_OPEN');
  });
});

describe('Tra mã và phòng công khai (4.2)', () => {
  it('tra mã phòng (không phân biệt hoa thường) trả thông tin công khai, không lộ cấu hình', async () => {
    const { room, host } = await createOpenRoom(ctx, {
      room: { name: 'CLB Toán', password: 'bi-mat-123' },
    });

    const res = await request(ctx.app).get(`/api/rooms/lookup?code=${room.code!.toLowerCase()}`);
    const preview = roomPreviewSchema.parse((res.body as { room: unknown }).room);

    expect(preview).toMatchObject({
      id: room.id,
      name: 'CLB Toán',
      hostName: host.user.displayName,
      requiresPassword: true,
      players: { taken: 0, total: 4 },
    });
    expect(res.text).not.toContain('passwordHash');
  });

  it('mã sai định dạng trả 400, mã không tồn tại trả 404', async () => {
    expect((await request(ctx.app).get('/api/rooms/lookup?code=12')).status).toBe(400);
    expect((await request(ctx.app).get('/api/rooms/lookup?code=ZZZZZZ')).status).toBe(404);
  });

  it('danh sách công khai chỉ có phòng công khai đang mở', async () => {
    const publicRoom = await createOpenRoom(ctx, {
      room: { visibility: 'public', name: 'Công khai' },
    });
    const privateRoom = await createOpenRoom(ctx, { room: { name: 'Riêng tư' } });

    const res = await request(ctx.app).get('/api/rooms/public');
    const ids = (res.body as { items: { id: string }[] }).items.map((r) => r.id);

    expect(ids).toContain(publicRoom.room.id);
    expect(ids).not.toContain(privateRoom.room.id);
  });

  it('"Phòng thi của tôi" chỉ có phòng của mình, kèm số người', async () => {
    const { room, hostAuth } = await createOpenRoom(ctx);
    await joinAsGuest(ctx, room.id, 'Khán giả 1');
    await createOpenRoom(ctx);

    const list = hostRoomListSchema.parse((await as(hostAuth).get('/api/rooms')).body);

    expect(list.items.map((r) => r.id)).toEqual([room.id]);
    expect(list.items[0]).toMatchObject({ spectatorCount: 1, playerCount: 0 });
  });
});
