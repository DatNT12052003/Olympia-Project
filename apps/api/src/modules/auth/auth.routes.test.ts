import {
  apiErrorBodySchema,
  authSessionResponseSchema,
  CSRF_HEADER,
  guestSessionResponseSchema,
} from '@olympia/shared';
import request from 'supertest';
import { UserEntity } from '../users/user.entity';
import {
  createTestContext,
  createUser,
  createUserAndLogin,
  extractCookie,
  login,
  type TestContext,
  TEST_PASSWORD,
  tokenFromLastMail,
  uniqueEmail,
} from '../../test/test-context';
import { AuthSessionEntity } from './auth-session.entity';
import { UserActionTokenEntity } from './user-action-token.entity';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext({ loginMaxFailures: 3 });
});

afterAll(async () => {
  await ctx.close();
});

const post = (path: string) => request(ctx.app).post(`/api/auth${path}`).set(CSRF_HEADER, '1');

function errorCode(body: unknown): string {
  return apiErrorBodySchema.parse(body).error.code;
}

describe('POST /api/auth/register', () => {
  it('tạo tài khoản Host chưa xác minh, đăng nhập luôn và gửi email xác minh', async () => {
    const email = uniqueEmail('dang-ky');
    const res = await post('/register').send({
      email: `  ${email.toUpperCase()} `,
      password: TEST_PASSWORD,
      displayName: '  Nguyễn   Văn A ',
      acceptPrivacyPolicy: true,
    });

    expect(res.status).toBe(201);
    const body = authSessionResponseSchema.parse(res.body);
    expect(body.user).toMatchObject({
      email,
      displayName: 'Nguyễn Văn A',
      emailVerified: false,
      systemRole: 'member',
      canHost: true,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);

    const cookie = extractCookie(res.headers['set-cookie'], 'olympia_rt');
    const rawCookie = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('olympia_rt='),
    );
    expect(cookie).toMatch(/^olympia_rt=.+/);
    expect(rawCookie).toMatch(/HttpOnly/);
    expect(rawCookie).toMatch(/SameSite=Strict/);
    expect(rawCookie).toMatch(/Path=\/api\/auth/);

    expect(ctx.mails.at(-1)).toMatchObject({ to: email });
    expect(ctx.mails.at(-1)?.text).toContain('/xac-minh-email?token=');

    const stored = await ctx.dataSource
      .getRepository(UserEntity)
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email', { email })
      .getOneOrFail();
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('từ chối email đã đăng ký (không phân biệt hoa thường)', async () => {
    const user = await createUser(ctx);
    const res = await post('/register').send({
      email: user.email.toUpperCase(),
      password: TEST_PASSWORD,
      displayName: 'Trùng email',
      acceptPrivacyPolicy: true,
    });

    expect(res.status).toBe(409);
    expect(errorCode(res.body)).toBe('EMAIL_TAKEN');
  });

  it('bắt buộc đồng ý chính sách quyền riêng tư và mật khẩu đủ dài', async () => {
    const res = await post('/register').send({
      email: uniqueEmail(),
      password: 'ngan',
      displayName: 'A',
      acceptPrivacyPolicy: false,
    });

    expect(res.status).toBe(400);
    const details = apiErrorBodySchema.parse(res.body).error.details as { path: string[] }[];
    expect(details.map((d) => d.path[0]).sort()).toEqual([
      'acceptPrivacyPolicy',
      'displayName',
      'password',
    ]);
  });

  it('thiếu header chống CSRF thì bị từ chối', async () => {
    const res = await request(ctx.app).post('/api/auth/register').send({});

    expect(res.status).toBe(403);
    expect(errorCode(res.body)).toBe('CSRF_HEADER_MISSING');
  });
});

describe('Xác minh email', () => {
  it('token trong email xác minh tài khoản và chỉ dùng được một lần', async () => {
    const email = uniqueEmail('xac-minh');
    await post('/register').send({
      email,
      password: TEST_PASSWORD,
      displayName: 'Xác minh',
      acceptPrivacyPolicy: true,
    });
    const token = tokenFromLastMail(ctx, email);

    const first = await post('/verify-email').send({ token });
    const second = await post('/verify-email').send({ token });

    expect(first.status).toBe(200);
    expect((first.body as { user: { emailVerified: boolean } }).user.emailVerified).toBe(true);
    expect(second.status).toBe(400);
    expect(errorCode(second.body)).toBe('INVALID_ACTION_TOKEN');
  });

  it('token hết hạn không dùng được', async () => {
    const user = await createUser(ctx, { emailVerified: false });
    const { accessToken } = await login(ctx, user.email);
    await post('/verify-email/resend').set('Authorization', `Bearer ${accessToken}`).expect(202);
    const token = tokenFromLastMail(ctx, user.email);
    await ctx.dataSource
      .getRepository(UserActionTokenEntity)
      .update({ userId: user.id }, { expiresAt: new Date(Date.now() - 1000) });

    const res = await post('/verify-email').send({ token });

    expect(res.status).toBe(400);
    expect(errorCode(res.body)).toBe('INVALID_ACTION_TOKEN');
  });

  it('gửi lại email làm vô hiệu token cũ', async () => {
    const user = await createUser(ctx, { emailVerified: false });
    const { accessToken } = await login(ctx, user.email);
    const auth = `Bearer ${accessToken}`;
    await post('/verify-email/resend').set('Authorization', auth).expect(202);
    const oldToken = tokenFromLastMail(ctx, user.email);
    await post('/verify-email/resend').set('Authorization', auth).expect(202);
    const newToken = tokenFromLastMail(ctx, user.email);

    expect((await post('/verify-email').send({ token: oldToken })).status).toBe(400);
    expect((await post('/verify-email').send({ token: newToken })).status).toBe(200);
  });

  it('không gửi lại khi email đã xác minh; khách/ẩn danh không gọi được', async () => {
    const { accessToken } = await createUserAndLogin(ctx);

    const verified = await post('/verify-email/resend').set(
      'Authorization',
      `Bearer ${accessToken}`,
    );
    const anonymous = await post('/verify-email/resend');

    expect(verified.status).toBe(409);
    expect(errorCode(verified.body)).toBe('EMAIL_ALREADY_VERIFIED');
    expect(anonymous.status).toBe(401);
  });
});

describe('POST /api/auth/login', () => {
  it('đăng nhập đúng trả access token dùng được cho /api/me', async () => {
    const user = await createUser(ctx);
    const { accessToken } = await login(ctx, user.email.toUpperCase());

    const me = await request(ctx.app).get('/api/me').set('Authorization', `Bearer ${accessToken}`);

    expect(me.status).toBe(200);
    expect((me.body as { user: { id: string } }).user.id).toBe(user.id);
  });

  it('sai mật khẩu và email không tồn tại trả cùng một lỗi', async () => {
    const user = await createUser(ctx);

    const wrongPassword = await post('/login').send({
      email: user.email,
      password: 'sai-mat-khau',
    });
    const unknownEmail = await post('/login').send({ email: uniqueEmail(), password: 'x' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(errorCode(wrongPassword.body)).toBe('INVALID_CREDENTIALS');
  });

  it('báo số lần thử còn lại trước khi bị tạm khóa', async () => {
    const user = await createUser(ctx);

    const first = await post('/login').send({ email: user.email, password: 'sai' });
    const second = await post('/login').send({ email: user.email, password: 'sai' });

    // Context test đặt giới hạn 3 lần / 15 phút.
    expect(apiErrorBodySchema.parse(first.body).error.details).toEqual({
      remainingAttempts: 2,
      lockoutMinutes: 15,
    });
    expect(apiErrorBodySchema.parse(second.body).error.details).toEqual({
      remainingAttempts: 1,
      lockoutMinutes: 15,
    });
  });

  it('khóa đăng nhập tạm thời sau số lần sai liên tiếp (BR-AUTH-03)', async () => {
    const user = await createUser(ctx);
    for (let i = 0; i < 3; i += 1) {
      await post('/login').send({ email: user.email, password: 'sai' }).expect(401);
    }

    // Kể cả mật khẩu đúng cũng bị chặn cho tới hết cửa sổ thời gian.
    const blocked = await post('/login').send({ email: user.email, password: TEST_PASSWORD });

    expect(blocked.status).toBe(429);
    expect(errorCode(blocked.body)).toBe('TOO_MANY_REQUESTS');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('đăng nhập thành công xóa bộ đếm sai liên tiếp', async () => {
    const user = await createUser(ctx);
    for (let i = 0; i < 2; i += 1) {
      await post('/login').send({ email: user.email, password: 'sai' }).expect(401);
    }
    await login(ctx, user.email);
    for (let i = 0; i < 2; i += 1) {
      await post('/login').send({ email: user.email, password: 'sai' }).expect(401);
    }

    await login(ctx, user.email);
  });

  it('tài khoản bị khóa không đăng nhập được (BR-AUTH-02)', async () => {
    const user = await createUser(ctx, { status: 'locked' });

    const res = await post('/login').send({ email: user.email, password: TEST_PASSWORD });

    expect(res.status).toBe(403);
    expect(errorCode(res.body)).toBe('ACCOUNT_LOCKED');
  });
});

describe('Refresh token xoay vòng', () => {
  it('đổi refresh token mỗi lần làm mới và cấp access token mới', async () => {
    const { user, refreshCookie } = await createUserAndLogin(ctx);

    const res = await post('/refresh').set('Cookie', refreshCookie);

    expect(res.status).toBe(200);
    expect(authSessionResponseSchema.parse(res.body).user.id).toBe(user.id);
    const rotated = extractCookie(res.headers['set-cookie'], 'olympia_rt');
    expect(rotated).not.toBe(refreshCookie);
    await post('/refresh').set('Cookie', rotated).expect(200);
  });

  it('dùng lại refresh token cũ thu hồi cả phiên (phát hiện token bị đánh cắp)', async () => {
    const { refreshCookie, accessToken } = await createUserAndLogin(ctx);
    const first = await post('/refresh').set('Cookie', refreshCookie).expect(200);
    const rotated = extractCookie(first.headers['set-cookie'], 'olympia_rt');

    const reuse = await post('/refresh').set('Cookie', refreshCookie);
    const afterReuse = await post('/refresh').set('Cookie', rotated);
    const me = await request(ctx.app).get('/api/me').set('Authorization', `Bearer ${accessToken}`);

    expect(reuse.status).toBe(401);
    expect(afterReuse.status).toBe(401);
    expect(me.status).toBe(401);
    expect(ctx.revokedEvents.at(-1)?.reason).toBe('refresh_reuse');
  });

  it('không có cookie hoặc cookie rác trả 401', async () => {
    expect((await post('/refresh')).status).toBe(401);
    expect((await post('/refresh').set('Cookie', 'olympia_rt=rac')).status).toBe(401);
  });

  it('làm mới đồng thời bằng cùng một token chỉ một request thành công', async () => {
    const { refreshCookie } = await createUserAndLogin(ctx);

    const results = await Promise.all(
      Array.from({ length: 5 }, () => post('/refresh').set('Cookie', refreshCookie)),
    );

    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
  });
});

describe('POST /api/auth/logout', () => {
  it('thu hồi phiên: access token và refresh token cùng mất hiệu lực', async () => {
    const { accessToken, refreshCookie } = await createUserAndLogin(ctx);

    const res = await post('/logout').set('Cookie', refreshCookie);
    const me = await request(ctx.app).get('/api/me').set('Authorization', `Bearer ${accessToken}`);
    const refresh = await post('/refresh').set('Cookie', refreshCookie);

    expect(res.status).toBe(204);
    expect(res.headers['set-cookie']?.[0]).toMatch(/olympia_rt=;/);
    expect(me.status).toBe(401);
    expect(refresh.status).toBe(401);
    expect(ctx.revokedEvents.at(-1)?.reason).toBe('logout');
  });

  it('không ảnh hưởng phiên khác của cùng tài khoản', async () => {
    const user = await createUser(ctx);
    const phone = await login(ctx, user.email);
    const laptop = await login(ctx, user.email);

    await post('/logout').set('Cookie', phone.refreshCookie).expect(204);

    await request(ctx.app)
      .get('/api/me')
      .set('Authorization', `Bearer ${laptop.accessToken}`)
      .expect(200);
  });
});

describe('Quên / đặt lại mật khẩu', () => {
  it('link đặt lại mật khẩu có hiệu lực 30 phút', async () => {
    const user = await createUser(ctx);
    await post('/forgot-password').send({ email: user.email }).expect(202);

    const token = await ctx.dataSource
      .getRepository(UserActionTokenEntity)
      .findOneByOrFail({ userId: user.id, purpose: 'password_reset' });
    const ttlMinutes = (token.expiresAt.getTime() - token.createdAt.getTime()) / 60_000;

    expect(Math.round(ttlMinutes)).toBe(30);
    expect(ctx.mails.at(-1)?.text).toContain('30 phút');
  });

  it('luôn trả 202, chỉ gửi email khi tài khoản tồn tại', async () => {
    const user = await createUser(ctx);
    const before = ctx.mails.length;

    const unknown = await post('/forgot-password').send({ email: uniqueEmail() });
    const known = await post('/forgot-password').send({ email: user.email });

    expect(unknown.status).toBe(202);
    expect(known.status).toBe(202);
    expect(ctx.mails.slice(before).map((m) => m.to)).toEqual([user.email]);
  });

  it('đặt lại mật khẩu, đăng xuất mọi phiên, token chỉ dùng một lần', async () => {
    const user = await createUser(ctx);
    const session = await login(ctx, user.email);
    await post('/forgot-password').send({ email: user.email }).expect(202);
    const token = tokenFromLastMail(ctx, user.email);

    const reset = await post('/reset-password').send({ token, password: 'Mat-khau-moi-456' });
    const reuse = await post('/reset-password').send({ token, password: 'Mat-khau-khac-789' });

    expect(reset.status).toBe(204);
    expect(reuse.status).toBe(400);
    await request(ctx.app)
      .get('/api/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(401);
    await post('/login').send({ email: user.email, password: TEST_PASSWORD }).expect(401);
    await login(ctx, user.email, 'Mat-khau-moi-456');
  });
});

describe('POST /api/auth/change-password', () => {
  it('giữ phiên hiện tại, thu hồi các phiên khác', async () => {
    const user = await createUser(ctx);
    const current = await login(ctx, user.email);
    const other = await login(ctx, user.email);

    const wrong = await post('/change-password')
      .set('Authorization', `Bearer ${current.accessToken}`)
      .send({ currentPassword: 'sai', newPassword: 'Mat-khau-moi-456' });
    const res = await post('/change-password')
      .set('Authorization', `Bearer ${current.accessToken}`)
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'Mat-khau-moi-456' });

    expect(wrong.status).toBe(400);
    expect(res.status).toBe(204);
    await request(ctx.app)
      .get('/api/me')
      .set('Authorization', `Bearer ${current.accessToken}`)
      .expect(200);
    await request(ctx.app)
      .get('/api/me')
      .set('Authorization', `Bearer ${other.accessToken}`)
      .expect(401);
    const sessions = await ctx.dataSource
      .getRepository(AuthSessionEntity)
      .findBy({ userId: user.id });
    expect(sessions.map((s) => s.revokedReason).sort()).toEqual([null, 'password_changed']);
  });
});

describe('POST /api/auth/guest (BR-AUTH-05)', () => {
  it('cấp phiên khách 24 giờ, giữ danh tính khi làm mới và đổi tên', async () => {
    const created = await post('/guest').send({ displayName: '  Khách  vui ' });
    const cookie = extractCookie(created.headers['set-cookie'], 'olympia_guest');
    const first = guestSessionResponseSchema.parse(created.body);

    const refreshed = guestSessionResponseSchema.parse(
      (await post('/guest').set('Cookie', cookie).send({})).body,
    );
    const renamed = guestSessionResponseSchema.parse(
      (await post('/guest').set('Cookie', cookie).send({ displayName: 'Tên mới' })).body,
    );

    expect(first.guest.displayName).toBe('Khách vui');
    const ttlHours = (Date.parse(first.sessionExpiresAt) - Date.now()) / 3_600_000;
    expect(ttlHours).toBeGreaterThan(23.9);
    expect(ttlHours).toBeLessThanOrEqual(24);
    expect(refreshed.guest).toEqual(first.guest);
    expect(renamed.guest).toEqual({ id: first.guest.id, displayName: 'Tên mới' });
    // Đổi tên không kéo dài phiên khách.
    expect(Date.parse(renamed.sessionExpiresAt)).toBeLessThanOrEqual(
      Date.parse(first.sessionExpiresAt),
    );
  });

  it('không có phiên cũ thì phải nhập tên', async () => {
    const res = await post('/guest').send({});

    expect(res.status).toBe(400);
  });

  it('access token của khách không dùng được cho chức năng tài khoản', async () => {
    const { accessToken } = guestSessionResponseSchema.parse(
      (await post('/guest').send({ displayName: 'Khách' })).body,
    );

    const me = await request(ctx.app).get('/api/me').set('Authorization', `Bearer ${accessToken}`);

    expect(me.status).toBe(403);
  });

  it('cookie phiên khách không dùng được như access token', async () => {
    const created = await post('/guest').send({ displayName: 'Khách' });
    const sessionToken = extractCookie(created.headers['set-cookie'], 'olympia_guest').split(
      '=',
    )[1];

    const res = await request(ctx.app)
      .get('/api/me')
      .set('Authorization', `Bearer ${sessionToken}`);

    expect(res.status).toBe(401);
  });
});

describe('Access token', () => {
  it('token sai chữ ký hoặc sai định dạng trả 401', async () => {
    const { accessToken } = await createUserAndLogin(ctx);
    const tampered = `${accessToken.slice(0, -2)}xx`;

    for (const header of [`Bearer ${tampered}`, 'Bearer abc', `Basic ${accessToken}`]) {
      const res = await request(ctx.app).get('/api/me').set('Authorization', header);
      expect(res.status).toBe(401);
    }
  });

  it('cập nhật hồ sơ chỉ áp dụng cho chính mình', async () => {
    const { accessToken } = await createUserAndLogin(ctx);

    const res = await request(ctx.app)
      .patch('/api/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ displayName: ' Tên  mới ' });
    const extra = await request(ctx.app)
      .patch('/api/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ systemRole: 'super_admin' });

    expect(res.status).toBe(200);
    expect((res.body as { user: { displayName: string } }).user.displayName).toBe('Tên mới');
    // Không cho gán thêm trường (mass assignment).
    expect(extra.status).toBe(400);
  });
});
