import { randomUUID } from 'node:crypto';
import {
  adminRoomListSchema,
  AuthErrorCode,
  auditLogListSchema,
  CSRF_HEADER,
  publicSettingsSchema,
  ReportErrorCode,
  reportListSchema,
  RoomErrorCode,
  systemSettingsResponseSchema,
} from '@olympia/shared';
import request from 'supertest';
import { In } from 'typeorm';
import {
  createOpenRoom,
  createTestContext,
  createUser,
  createUserAndLogin,
  joinAsGuest,
  login,
  type TestContext,
  tokenFromLastMail,
} from '../../test/test-context';
import { AdminAuditLogEntity } from '../audit/admin-audit-log.entity';
import { OrganizationEntity } from '../organizations/organization.entity';
import { OrganizationManagerEntity } from '../organizations/organization-manager.entity';
import { QuestionSetVersionEntity } from '../question-bank/question-set-version.entity';
import { RoomBanEntity } from '../rooms/room-ban.entity';
import { RoomEntity } from '../rooms/room.entity';
import { SystemSettingEntity } from '../settings/system-setting.entity';
import { UserEntity } from '../users/user.entity';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  // Cấu hình hệ thống dùng chung database test: trả lại mặc định cho các file test khác.
  await ctx.dataSource.getRepository(SystemSettingEntity).clear();
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
    patch: (url: string, body: object) =>
      request(ctx.app).patch(url).set('Authorization', auth).send(body),
  };
}

function errorCode(body: unknown): string {
  return (body as { error: { code: string } }).error.code;
}

async function organizationWithManager() {
  const org = await ctx.dataSource
    .getRepository(OrganizationEntity)
    .save({ name: `Trường ${randomUUID().slice(0, 8)}` });
  const manager = await createUserAndLogin(ctx, { systemRole: 'manager' });
  await ctx.dataSource
    .getRepository(OrganizationManagerEntity)
    .insert({ organizationId: org.id, userId: manager.user.id });
  return { org, manager: authed(manager.accessToken), managerId: manager.user.id };
}

describe('Cấu hình hệ thống /api/admin/settings (DL-049)', () => {
  it('chỉ Super Admin xem/sửa; giá trị áp dụng ngay cho giới hạn phòng và reaction', async () => {
    const admin = authed(
      (await createUserAndLogin(ctx, { systemRole: 'super_admin' })).accessToken,
    );
    const manager = authed((await createUserAndLogin(ctx, { systemRole: 'manager' })).accessToken);
    expect((await manager.get('/api/admin/settings')).status).toBe(403);

    const current = systemSettingsResponseSchema.parse(
      (await admin.get('/api/admin/settings')).body,
    );
    expect(current.settings.reactions).toEqual(['👍', '❤️', '😂', '🔥']);
    expect(current.defaults.maxActiveRoomsPerHost).toBe(5);

    expect((await admin.patch('/api/admin/settings', { reactions: [] })).status).toBe(400);
    expect((await admin.patch('/api/admin/settings', { unknown: 1 })).status).toBe(400);
    const updated = systemSettingsResponseSchema.parse(
      (
        await admin.patch('/api/admin/settings', {
          maxActiveRoomsPerHost: 1,
          reactions: ['👏', '🎉'],
          imageMaxMb: 2,
        })
      ).body,
    );
    expect(updated.settings).toMatchObject({ maxActiveRoomsPerHost: 1, imageMaxMb: 2 });
    expect(updated.updatedAt).not.toBeNull();

    const publicSettings = publicSettingsSchema.parse(
      (await request(ctx.app).get('/api/settings/public')).body,
    );
    expect(publicSettings).toMatchObject({
      reactions: ['👏', '🎉'],
      mediaMaxBytes: { image: 2 * 1024 * 1024 },
    });

    // Giới hạn phòng mới có hiệu lực ngay (DL-031).
    const { host } = await createOpenRoom(ctx);
    const second = await authed(host.accessToken).post('/api/rooms', {
      name: 'Phòng thứ hai',
      maxPlayers: 4,
      visibility: 'private',
      open: true,
    });
    expect(second.status).toBe(409);
    expect(errorCode(second.body)).toBe(RoomErrorCode.RoomLimitReached);

    const logs = await ctx.dataSource
      .getRepository(AdminAuditLogEntity)
      .findBy({ action: 'system.settings_update' });
    expect(logs.some((l) => 'maxActiveRoomsPerHost' in l.details)).toBe(true);

    await admin.patch('/api/admin/settings', {
      maxActiveRoomsPerHost: 5,
      reactions: ['👍', '❤️', '😂', '🔥'],
      imageMaxMb: 5,
    });
  });
});

describe('Giám sát phòng /api/admin/rooms và nhật ký quản trị', () => {
  it('Manager chỉ thấy phòng của tổ chức mình; đóng phòng vi phạm có ghi nhật ký', async () => {
    const { org, manager } = await organizationWithManager();
    const inOrg = await createOpenRoom(ctx, { host: { organizationId: org.id } });
    const outside = await createOpenRoom(ctx);
    const admin = authed(
      (await createUserAndLogin(ctx, { systemRole: 'super_admin' })).accessToken,
    );

    const managerRooms = adminRoomListSchema.parse((await manager.get('/api/admin/rooms')).body);
    expect(managerRooms.items.map((r) => r.id)).toContain(inOrg.room.id);
    expect(managerRooms.items.map((r) => r.id)).not.toContain(outside.room.id);
    const adminRooms = adminRoomListSchema.parse((await admin.get('/api/admin/rooms')).body);
    expect(adminRooms.items.map((r) => r.id)).toEqual(
      expect.arrayContaining([inOrg.room.id, outside.room.id]),
    );
    const member = authed(inOrg.host.accessToken);
    expect((await member.get('/api/admin/rooms')).status).toBe(403);

    expect(
      (await manager.post(`/api/admin/rooms/${outside.room.id}/close`, { reason: 'Vi phạm' }))
        .status,
    ).toBe(404);
    expect(
      (await manager.post(`/api/admin/rooms/${inOrg.room.id}/close`, { reason: 'Nội dung xấu' }))
        .status,
    ).toBe(204);
    const room = await ctx.dataSource
      .getRepository(RoomEntity)
      .findOneByOrFail({ id: inOrg.room.id });
    expect(room).toMatchObject({ status: 'closed', closedReason: 'moderation' });

    // Nhật ký quản trị: chỉ Super Admin.
    expect((await manager.get('/api/admin/audit-logs')).status).toBe(403);
    const logs = auditLogListSchema.parse(
      (await admin.get('/api/admin/audit-logs?category=room')).body,
    );
    expect(logs.items.find((l) => l.targetId === inOrg.room.id)).toMatchObject({
      action: 'room.close',
      details: { reason: 'Nội dung xấu' },
    });
  });
});

describe('Báo cáo vi phạm /api/reports (15.3, DL-050)', () => {
  it('báo cáo hành vi trong phòng: chặn khách, cảnh báo tài khoản, phạm vi Manager', async () => {
    const { org, manager } = await organizationWithManager();
    const { host, room } = await createOpenRoom(ctx, {
      host: { organizationId: org.id, displayName: 'Cô Thu Hà' },
      room: { autoApprove: true },
    });
    const hostApi = authed(host.accessToken);
    const guest = await joinAsGuest(ctx, room.id, 'tuan_12a2', 'spectator');
    const member = await createUserAndLogin(ctx, { organizationId: org.id });
    await request(ctx.app)
      .post(`/api/rooms/${room.id}/join`)
      .set(CSRF_HEADER, '1')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({ role: 'spectator' });

    // Khách không gửi được báo cáo; người ngoài phòng không báo cáo được phòng.
    expect(
      (
        await authed(guest.accessToken).post('/api/reports', {
          targetType: 'room',
          targetId: room.id,
          category: 'harassment',
          description: 'Host nói lời không hay.',
        })
      ).status,
    ).toBe(403);
    const stranger = authed((await createUserAndLogin(ctx)).accessToken);
    expect(
      (
        await stranger.post('/api/reports', {
          targetType: 'room',
          targetId: room.id,
          category: 'harassment',
          description: 'Không ở trong phòng này.',
        })
      ).status,
    ).toBe(404);
    // Loại vi phạm phải phù hợp với đối tượng.
    expect(
      (
        await hostApi.post('/api/reports', {
          targetType: 'room',
          targetId: room.id,
          participantId: guest.participant.id,
          category: 'wrong_answer',
          description: 'Sai loại vi phạm.',
        })
      ).status,
    ).toBe(400);

    const guestReport = await hostApi.post('/api/reports', {
      targetType: 'room',
      targetId: room.id,
      participantId: guest.participant.id,
      category: 'harassment',
      description: 'Khán giả liên tục đổi tên hiển thị thô tục.',
    });
    expect(guestReport.status).toBe(201);
    const memberParticipant = await ctx.lobbyService.me(
      { kind: 'user', userId: member.user.id } as never,
      room.id,
    );
    const userReport = await hostApi.post('/api/reports', {
      targetType: 'room',
      targetId: room.id,
      participantId: memberParticipant.id,
      category: 'harassment',
      description: 'Gửi reaction liên tục để phá trận.',
    });
    expect(userReport.status).toBe(201);

    // Manager của tổ chức khác không thấy báo cáo phòng.
    const otherManager = (await organizationWithManager()).manager;
    const otherList = reportListSchema.parse(
      (await otherManager.get('/api/moderation/reports')).body,
    );
    expect(otherList.items.some((r) => r.targetId === room.id)).toBe(false);
    expect((await hostApi.get('/api/moderation/reports')).status).toBe(403);

    const list = reportListSchema.parse((await manager.get('/api/moderation/reports')).body);
    const onGuest = list.items.find((r) => r.id === (guestReport.body as { id: string }).id)!;
    expect(onGuest).toMatchObject({
      targetLabel: 'Phòng test',
      reporterName: 'Cô Thu Hà',
      subject: { kind: 'guest', name: 'tuan_12a2', priorReports: 0 },
      actions: ['dismiss', 'remove_content', 'block_guest'],
    });
    const onUser = list.items.find((r) => r.id === (userReport.body as { id: string }).id)!;
    expect(onUser.actions).toEqual(['dismiss', 'remove_content', 'warn', 'lock_account']);

    // Chặn phiên khách: cấm khỏi phòng.
    expect(
      (await manager.post(`/api/moderation/reports/${onGuest.id}/resolve`, { action: 'warn' }))
        .status,
    ).toBe(409);
    const blocked = await manager.post(`/api/moderation/reports/${onGuest.id}/resolve`, {
      action: 'block_guest',
      note: 'Đã xác minh qua nhật ký phòng.',
    });
    expect(blocked.status).toBe(200);
    expect(
      await ctx.dataSource
        .getRepository(RoomBanEntity)
        .existsBy({ roomId: room.id, guestId: guest.guest.id }),
    ).toBe(true);
    const twice = await manager.post(`/api/moderation/reports/${onGuest.id}/resolve`, {
      action: 'dismiss',
    });
    expect(errorCode(twice.body)).toBe(ReportErrorCode.ReportAlreadyResolved);

    // Cảnh báo: email + tăng số lần cảnh báo.
    const warned = await manager.post(`/api/moderation/reports/${onUser.id}/resolve`, {
      action: 'warn',
      note: 'Lần đầu nhắc nhở.',
    });
    expect(warned.status).toBe(200);
    expect(
      (await ctx.dataSource.getRepository(UserEntity).findOneByOrFail({ id: member.user.id }))
        .warningCount,
    ).toBe(1);
    expect(
      ctx.mails.some((m) => m.to === member.user.email && m.text.includes('Lần đầu nhắc nhở.')),
    ).toBe(true);

    const resolved = reportListSchema.parse(
      (await manager.get('/api/moderation/reports?status=resolved')).body,
    );
    expect(resolved.items.find((r) => r.id === onUser.id)).toMatchObject({
      resolution: 'warn',
      actions: [],
    });
  });

  it('báo cáo bộ câu hỏi public: gỡ nội dung', async () => {
    const owner = await createUserAndLogin(ctx);
    const ownerApi = authed(owner.accessToken);
    const q = await ownerApi.post('/api/questions', {
      content: 'Thủ đô của Việt Nam?',
      answer: { type: 'short_answer', answer: 'Hà Nội' },
    });
    const set = await ownerApi.post('/api/question-sets', { name: 'Địa lý tự nhiên châu Á' });
    const setId = (set.body as { set: { id: string } }).set.id;
    await ownerApi.post(`/api/question-sets/${setId}/items`, {
      questionIds: [(q.body as { question: { id: string } }).question.id],
    });
    await ownerApi.post(`/api/question-sets/${setId}/publish`);
    const version = await ctx.dataSource
      .getRepository(QuestionSetVersionEntity)
      .findOneByOrFail({ setId, status: 'pending' });
    const admin = authed(
      (await createUserAndLogin(ctx, { systemRole: 'super_admin' })).accessToken,
    );
    expect((await admin.post(`/api/moderation/question-sets/${version.id}/approve`)).status).toBe(
      204,
    );

    const reporter = authed((await createUserAndLogin(ctx)).accessToken);
    const created = await reporter.post('/api/reports', {
      targetType: 'question_set_version',
      targetId: version.id,
      category: 'wrong_answer',
      description: 'Câu 1 có đáp án chưa đầy đủ.',
    });
    expect(created.status).toBe(201);
    const reportId = (created.body as { id: string }).id;
    const removed = await admin.post(`/api/moderation/reports/${reportId}/resolve`, {
      action: 'remove_content',
      note: 'Đáp án sai.',
    });
    expect(removed.status).toBe(200);
    expect(
      (
        await ctx.dataSource.getRepository(QuestionSetVersionEntity).findOneByOrFail({
          id: version.id,
        })
      ).status,
    ).toBe('withdrawn');
    expect(
      await ctx.dataSource
        .getRepository(AdminAuditLogEntity)
        .countBy({ targetId: In([version.id, reportId]) }),
    ).toBeGreaterThanOrEqual(3);
  });
});

describe('Xóa tài khoản và lưu trữ dữ liệu (DL-008)', () => {
  it('yêu cầu xóa: thu hồi phiên, chặn đăng nhập, giữ lại bằng liên kết email', async () => {
    const { user, accessToken } = await createUserAndLogin(ctx);
    const api = authed(accessToken);
    const del = (password: string) =>
      request(ctx.app)
        .post('/api/auth/delete-account')
        .set(CSRF_HEADER, '1')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ password });
    expect((await del('sai-mat-khau')).status).toBe(400);
    expect((await del(user.password)).status).toBe(204);
    expect((await api.get('/api/me')).status).toBe(401);
    expect(
      ctx.revokedEvents.some((e) => e.userId === user.id && e.reason === 'account_deleted'),
    ).toBe(true);

    const blocked = await request(ctx.app)
      .post('/api/auth/login')
      .set(CSRF_HEADER, '1')
      .send({ email: user.email, password: user.password });
    expect(blocked.status).toBe(403);
    expect(errorCode(blocked.body)).toBe(AuthErrorCode.AccountPendingDeletion);

    const token = tokenFromLastMail(ctx, user.email);
    const cancel = () =>
      request(ctx.app).post('/api/auth/cancel-deletion').set(CSRF_HEADER, '1').send({ token });
    expect((await cancel()).status).toBe(204);
    expect((await cancel()).status).toBe(400);
    await login(ctx, user.email);
  });

  it('hết ân hạn thì ẩn danh tài khoản; nhật ký quá 12 tháng bị xóa', async () => {
    const recent = await createUser(ctx, {
      status: 'pending_deletion',
      deletionRequestedAt: new Date(Date.now() - 5 * 864e5),
    });
    const expired = await createUser(ctx, {
      status: 'pending_deletion',
      deletionRequestedAt: new Date(Date.now() - 31 * 864e5),
    });
    const oldLog = await ctx.dataSource.getRepository(AdminAuditLogEntity).save({
      actorUserId: null,
      action: 'user.lock',
      targetType: 'user',
      targetId: recent.id,
      details: {},
      createdAt: new Date(Date.now() - 400 * 864e5),
    });
    await ctx.dataRetention.tick();

    const users = ctx.dataSource.getRepository(UserEntity);
    expect((await users.findOneByOrFail({ id: recent.id })).status).toBe('pending_deletion');
    const purged = await users.findOneByOrFail({ id: expired.id });
    expect(purged).toMatchObject({
      status: 'deleted',
      displayName: 'Người dùng đã xóa',
      email: `deleted-${expired.id}@deleted.invalid`,
      avatarUrl: null,
    });
    expect(
      await ctx.dataSource.getRepository(AdminAuditLogEntity).existsBy({ id: oldLog.id }),
    ).toBe(false);

    // Tài khoản đã xóa không khóa/mở khóa được.
    const admin = authed(
      (await createUserAndLogin(ctx, { systemRole: 'super_admin' })).accessToken,
    );
    expect(
      (await admin.post(`/api/admin/users/${expired.id}/lock`, { reason: 'Thử' })).status,
    ).toBe(409);
  });
});
