import {
  adminUserListSchema,
  adminUserSchema,
  apiErrorBodySchema,
  organizationSchema,
} from '@olympia/shared';
import request from 'supertest';
import {
  createTestContext,
  createUser,
  createUserAndLogin,
  login,
  type TestContext,
  uniqueEmail,
} from '../../test/test-context';
import { AdminAuditLogEntity } from '../audit/admin-audit-log.entity';
import { OrganizationManagerEntity } from '../organizations/organization-manager.entity';

let ctx: TestContext;
let superAdmin: { userId: string; auth: string };

beforeAll(async () => {
  ctx = await createTestContext();
  const sa = await createUserAndLogin(ctx, { systemRole: 'super_admin' });
  superAdmin = { userId: sa.user.id, auth: `Bearer ${sa.accessToken}` };
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
  put: (path: string) => request(ctx.app).put(path).set('Authorization', auth),
  delete: (path: string) => request(ctx.app).delete(path).set('Authorization', auth),
});

async function createOrganization(name = `Trường ${crypto.randomUUID()}`): Promise<string> {
  const res = await as(superAdmin.auth).post('/api/admin/organizations', { name });
  expect(res.status).toBe(201);
  return organizationSchema.parse((res.body as { organization: unknown }).organization).id;
}

/** Manager được gán quản lý một tổ chức mới, cùng một thành viên trong tổ chức đó. */
async function managerWithOrganization() {
  const organizationId = await createOrganization();
  const manager = await createUserAndLogin(ctx, { systemRole: 'manager' });
  await as(superAdmin.auth)
    .put(`/api/admin/organizations/${organizationId}/managers/${manager.user.id}`)
    .expect(204);
  const member = await createUser(ctx, { organizationId });
  return { organizationId, manager, auth: `Bearer ${manager.accessToken}`, member };
}

describe('Phạm vi Manager theo tổ chức (DL-005)', () => {
  it('Manager chỉ thấy thành viên của tổ chức mình', async () => {
    const { auth, member, organizationId } = await managerWithOrganization();
    const outsider = await createUser(ctx);
    const otherOrgMember = await createUser(ctx, { organizationId: await createOrganization() });

    const list = adminUserListSchema.parse((await as(auth).get('/api/admin/users')).body);

    expect(list.items.map((u) => u.id)).toEqual([member.id]);
    expect(list.items[0]?.organizationId).toBe(organizationId);
    await as(auth).get(`/api/admin/users/${outsider.id}`).expect(404);
    await as(auth).get(`/api/admin/users/${otherOrgMember.id}`).expect(404);
    await as(auth).post(`/api/admin/users/${outsider.id}/lock`, { reason: 'x' }).expect(404);
  });

  it('Manager không quản lý được Manager khác trong cùng tổ chức', async () => {
    const { auth, organizationId } = await managerWithOrganization();
    const otherManager = await createUser(ctx, { systemRole: 'manager', organizationId });

    await as(auth).post(`/api/admin/users/${otherManager.id}/lock`, { reason: 'x' }).expect(404);
  });

  it('Manager chỉ thấy tổ chức mình quản lý', async () => {
    const { auth, organizationId } = await managerWithOrganization();
    await createOrganization();

    const res = await as(auth).get('/api/admin/organizations');

    expect((res.body as { items: { id: string }[] }).items.map((o) => o.id)).toEqual([
      organizationId,
    ]);
  });

  it('Super Admin thấy mọi tài khoản, tìm kiếm có escape ký tự đặc biệt', async () => {
    const tag = crypto.randomUUID().slice(0, 8);
    const match = await createUser(ctx, { email: uniqueEmail(`tim_${tag}`) });
    await createUser(ctx, { email: uniqueEmail(`timX${tag}`) });

    const res = await as(superAdmin.auth).get(`/api/admin/users?search=tim_${tag}`);
    const list = adminUserListSchema.parse(res.body);

    // "_" là ký tự đại diện của LIKE; phải được hiểu là ký tự thường.
    expect(list.items.map((u) => u.id)).toEqual([match.id]);
    expect(list.total).toBe(1);
  });

  it('giới hạn kích thước trang', async () => {
    const res = await as(superAdmin.auth).get('/api/admin/users?pageSize=1000');

    expect(res.status).toBe(400);
  });
});

describe('Khóa / mở khóa tài khoản (BR-AUTH-02)', () => {
  it('khóa tài khoản thu hồi mọi phiên, ngắt realtime và ghi nhật ký', async () => {
    const { auth, member } = await managerWithOrganization();
    const session = await login(ctx, member.email);

    const res = await as(auth).post(`/api/admin/users/${member.id}/lock`, {
      reason: 'Spam phòng công khai',
    });

    expect(res.status).toBe(200);
    expect(adminUserSchema.parse((res.body as { user: unknown }).user)).toMatchObject({
      status: 'locked',
      lockedReason: 'Spam phòng công khai',
    });
    await request(ctx.app)
      .get('/api/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(401);
    expect(ctx.revokedEvents.at(-1)).toEqual({ userId: member.id, reason: 'account_locked' });
    const logs = await ctx.dataSource
      .getRepository(AdminAuditLogEntity)
      .findBy({ targetId: member.id, action: 'user.lock' });
    expect(logs).toHaveLength(1);

    await as(auth).post(`/api/admin/users/${member.id}/unlock`).expect(200);
    await login(ctx, member.email);
  });

  it('không tự khóa chính mình', async () => {
    const res = await as(superAdmin.auth).post(`/api/admin/users/${superAdmin.userId}/lock`, {
      reason: 'thử',
    });

    expect(res.status).toBe(403);
    expect(apiErrorBodySchema.parse(res.body).error.code).toBe('SELF_MODIFICATION');
  });

  it('bắt buộc nhập lý do khóa', async () => {
    const user = await createUser(ctx);

    await as(superAdmin.auth).post(`/api/admin/users/${user.id}/lock`, { reason: ' ' }).expect(400);
  });

  it('đặt lại mật khẩu gửi email cho người dùng, không trả mật khẩu cho quản trị viên', async () => {
    const { auth, member } = await managerWithOrganization();

    const res = await as(auth).post(`/api/admin/users/${member.id}/password-reset`);

    expect(res.status).toBe(202);
    expect(res.text).toBe('');
    expect(ctx.mails.at(-1)?.to).toBe(member.email);
  });

  it('gửi lại email xác minh cho tài khoản chưa xác minh', async () => {
    const { auth, organizationId } = await managerWithOrganization();
    const unverified = await createUser(ctx, { organizationId, emailVerified: false });
    const verified = await createUser(ctx, { organizationId });

    const res = await as(auth).post(`/api/admin/users/${unverified.id}/verification-email`);
    const again = await as(auth).post(`/api/admin/users/${verified.id}/verification-email`);

    expect(res.status).toBe(202);
    expect(ctx.mails.at(-1)).toMatchObject({ to: unverified.email });
    expect(ctx.mails.at(-1)?.text).toContain('/xac-minh-email?token=');
    expect(again.status).toBe(409);
  });

  it('trả thời điểm hoạt động gần nhất, null khi chưa đăng nhập', async () => {
    const { auth, member, organizationId } = await managerWithOrganization();
    const never = await createUser(ctx, { organizationId });
    await login(ctx, member.email);

    const list = adminUserListSchema.parse((await as(auth).get('/api/admin/users')).body);
    const byId = new Map(list.items.map((u) => [u.id, u]));

    expect(byId.get(never.id)?.lastActiveAt).toBeNull();
    const lastActive = Date.parse(byId.get(member.id)?.lastActiveAt ?? '');
    expect(Date.now() - lastActive).toBeLessThan(60_000);
  });
});

describe('Phân quyền tài khoản (chỉ Super Admin)', () => {
  it('thu hồi quyền Host có hiệu lực ngay với phiên đang mở', async () => {
    const host = await createUserAndLogin(ctx);
    const meBefore = await request(ctx.app)
      .get('/api/me')
      .set('Authorization', `Bearer ${host.accessToken}`);
    expect((meBefore.body as { user: { canHost: boolean } }).user.canHost).toBe(true);

    await as(superAdmin.auth)
      .patch(`/api/admin/users/${host.user.id}`, { canHost: false })
      .expect(200);

    const principal = await ctx.authService.resolveAccessToken(host.accessToken);
    expect(principal).toMatchObject({ kind: 'user', canHost: false });
  });

  it('hạ vai trò Manager bỏ mọi phân công tổ chức', async () => {
    const { manager, organizationId } = await managerWithOrganization();

    await as(superAdmin.auth)
      .patch(`/api/admin/users/${manager.user.id}`, { systemRole: 'member' })
      .expect(200);

    const assignments = await ctx.dataSource
      .getRepository(OrganizationManagerEntity)
      .findBy({ userId: manager.user.id, organizationId });
    expect(assignments).toHaveLength(0);
  });

  it('không tự hạ vai trò của chính mình', async () => {
    await as(superAdmin.auth)
      .patch(`/api/admin/users/${superAdmin.userId}`, { systemRole: 'member' })
      .expect(403);
  });

  it('gán tổ chức không tồn tại bị từ chối; body rỗng hoặc trường lạ bị từ chối', async () => {
    const user = await createUser(ctx);
    const path = `/api/admin/users/${user.id}`;

    await as(superAdmin.auth).patch(path, { organizationId: crypto.randomUUID() }).expect(400);
    await as(superAdmin.auth).patch(path, {}).expect(400);
    await as(superAdmin.auth).patch(path, { status: 'active' }).expect(400);
  });
});

describe('Tổ chức', () => {
  it('tên tổ chức là duy nhất (không phân biệt hoa thường)', async () => {
    const name = `CLB ${crypto.randomUUID()}`;
    await createOrganization(name);

    const res = await as(superAdmin.auth).post('/api/admin/organizations', {
      name: name.toUpperCase(),
    });

    expect(res.status).toBe(409);
    expect(apiErrorBodySchema.parse(res.body).error.code).toBe('ORGANIZATION_NAME_TAKEN');
  });

  it('chỉ gán được Manager cho tài khoản có vai trò Manager', async () => {
    const organizationId = await createOrganization();
    const member = await createUser(ctx);

    const res = await as(superAdmin.auth).put(
      `/api/admin/organizations/${organizationId}/managers/${member.id}`,
    );

    expect(res.status).toBe(400);
    expect(apiErrorBodySchema.parse(res.body).error.code).toBe('NOT_A_MANAGER');
  });

  it('gán lặp lại không tạo bản ghi trùng; gỡ Manager hoạt động', async () => {
    const { organizationId, manager } = await managerWithOrganization();
    const path = `/api/admin/organizations/${organizationId}/managers/${manager.user.id}`;

    await as(superAdmin.auth).put(path).expect(204);
    const list = await as(superAdmin.auth).get('/api/admin/organizations');
    const org = (
      list.body as { items: { id: string; managerIds: string[]; memberCount: number }[] }
    ).items.find((o) => o.id === organizationId);
    expect(org).toMatchObject({ managerIds: [manager.user.id], memberCount: 1 });

    await as(superAdmin.auth).delete(path).expect(204);
    await as(superAdmin.auth).delete(path).expect(404);
  });

  it('Manager không tạo được tổ chức', async () => {
    const { auth } = await managerWithOrganization();

    await as(auth).post('/api/admin/organizations', { name: 'Không được' }).expect(403);
  });
});
