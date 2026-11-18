import {
  hasRoomPermission,
  hasSystemPermission,
  type PermissionSubject,
  RoomPermission,
  type RoomRole,
  SystemPermission,
} from '@olympia/shared';
import request from 'supertest';
import {
  createOpenRoom,
  createTestContext,
  createUser,
  createUserAndLogin,
  joinAsGuest,
  type TestContext,
} from '../../test/test-context';

/**
 * Ma trận phân quyền đặc tả mục 2.2 — tiêu chí hoàn thành P1.
 * Mỗi dòng là một chức năng; mỗi cột là một vai trò. Thay đổi ma trận phải sửa cả đặc tả.
 */

type SubjectName =
  'superAdmin' | 'manager' | 'host' | 'unverifiedHost' | 'revokedHost' | 'guest' | 'anonymous';

const subjects: Record<SubjectName, PermissionSubject | null> = {
  superAdmin: { kind: 'user', systemRole: 'super_admin', emailVerified: true, canHost: true },
  manager: { kind: 'user', systemRole: 'manager', emailVerified: true, canHost: true },
  host: { kind: 'user', systemRole: 'member', emailVerified: true, canHost: true },
  // BR-AUTH-01: chưa xác minh email thì chưa tạo được phòng/câu hỏi.
  unverifiedHost: { kind: 'user', systemRole: 'member', emailVerified: false, canHost: true },
  // BR-AUTH-01: Super Admin thu hồi quyền Host; vẫn tham gia được như Player/Spectator.
  revokedHost: { kind: 'user', systemRole: 'member', emailVerified: true, canHost: false },
  guest: { kind: 'guest' },
  anonymous: null,
};

const P = SystemPermission;
const systemMatrix: Record<SystemPermission, SubjectName[]> = {
  [P.ManageUsers]: ['superAdmin', 'manager'],
  [P.ConfigureSystem]: ['superAdmin'],
  [P.MonitorRooms]: ['superAdmin', 'manager'],
  [P.EnforceModeration]: ['superAdmin', 'manager'],
  [P.ModerateQuestionSets]: ['superAdmin', 'manager'],
  [P.ManageOwnQuestions]: ['superAdmin', 'manager', 'host'],
  [P.UsePublicQuestionSets]: ['superAdmin', 'manager', 'host'],
  [P.CreateRooms]: ['superAdmin', 'manager', 'host'],
  [P.ViewOwnHistory]: ['superAdmin', 'manager', 'host', 'unverifiedHost', 'revokedHost', 'guest'],
  [P.SubmitReports]: ['superAdmin', 'manager', 'host', 'unverifiedHost', 'revokedHost'],
};

describe('Ma trận quyền hệ thống (2.2)', () => {
  const cases = Object.entries(systemMatrix).flatMap(([permission, allowed]) =>
    (Object.keys(subjects) as SubjectName[]).map(
      (name) => [permission as SystemPermission, name, allowed.includes(name)] as const,
    ),
  );

  it.each(cases)('%s — %s: %s', (permission, name, expected) => {
    expect(hasSystemPermission(subjects[name], permission)).toBe(expected);
  });

  it('từ chối quyền không xác định (BR-ROLE-06)', () => {
    expect(hasSystemPermission(subjects.superAdmin, 'khong-ton-tai' as SystemPermission)).toBe(
      false,
    );
  });
});

const R = RoomPermission;
const roomMatrix: Record<RoomPermission, RoomRole[]> = {
  [R.ControlMatch]: ['host'],
  [R.Answer]: ['player'],
  [R.PublishMedia]: ['host', 'player'],
  [R.SubscribeMedia]: ['host', 'player', 'spectator', 'monitor'],
  [R.SendReaction]: ['host', 'player', 'spectator'],
  [R.ViewScoreboard]: ['host', 'player', 'spectator', 'monitor'],
};
const roomRoles: RoomRole[] = ['host', 'player', 'spectator', 'monitor'];

describe('Ma trận quyền trong phòng (2.2, BR-ROLE-04)', () => {
  const cases = Object.entries(roomMatrix).flatMap(([permission, allowed]) =>
    roomRoles.map((role) => [permission as RoomPermission, role, allowed.includes(role)] as const),
  );

  it.each(cases)('%s — %s: %s', (permission, role, expected) => {
    expect(hasRoomPermission(role, permission)).toBe(expected);
  });

  it('Spectator không trả lời, không giành quyền, không điều khiển trận', () => {
    expect(hasRoomPermission('spectator', R.Answer)).toBe(false);
    expect(hasRoomPermission('spectator', R.ControlMatch)).toBe(false);
    expect(hasRoomPermission('spectator', R.PublishMedia)).toBe(false);
  });

  it('không có vai trò trong phòng thì không có quyền nào', () => {
    for (const permission of Object.values(R)) {
      expect(hasRoomPermission(null, permission)).toBe(false);
    }
  });
});

describe('Backend áp ma trận cho REST (BR-ROLE-05)', () => {
  let ctx: TestContext;
  const tokens: Partial<Record<'superAdmin' | 'manager' | 'host' | 'guest', string>> = {};
  let targetUserId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    tokens.superAdmin = (await createUserAndLogin(ctx, { systemRole: 'super_admin' })).accessToken;
    tokens.manager = (await createUserAndLogin(ctx, { systemRole: 'manager' })).accessToken;
    tokens.host = (await createUserAndLogin(ctx)).accessToken;
    const { room } = await createOpenRoom(ctx);
    tokens.guest = (await joinAsGuest(ctx, room.id, 'Khách')).accessToken;
    targetUserId = (await createUser(ctx)).id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  type Caller = keyof typeof tokens | 'anonymous';
  const callers: Caller[] = ['superAdmin', 'manager', 'host', 'guest', 'anonymous'];

  function call(caller: Caller, method: 'get' | 'post' | 'patch', path: string, body?: object) {
    let req = request(ctx.app)[method](path);
    const token = caller === 'anonymous' ? undefined : tokens[caller];
    if (token) req = req.set('Authorization', `Bearer ${token}`);
    return body ? req.send(body) : req;
  }

  const endpoints: {
    name: string;
    method: 'get' | 'post' | 'patch';
    path: () => string;
    body?: object;
    expected: Record<Caller, number>;
  }[] = [
    {
      name: 'Xem hồ sơ của mình',
      method: 'get',
      path: () => '/api/me',
      expected: { superAdmin: 200, manager: 200, host: 200, guest: 403, anonymous: 401 },
    },
    {
      name: 'Danh sách tài khoản (quản lý tài khoản)',
      method: 'get',
      path: () => '/api/admin/users',
      expected: { superAdmin: 200, manager: 200, host: 403, guest: 403, anonymous: 401 },
    },
    {
      // Manager không cấp được vai trò (15.2).
      name: 'Phân quyền tài khoản',
      method: 'patch',
      path: () => `/api/admin/users/${targetUserId}`,
      body: { canHost: true },
      expected: { superAdmin: 200, manager: 403, host: 403, guest: 403, anonymous: 401 },
    },
    {
      name: 'Danh sách tổ chức',
      method: 'get',
      path: () => '/api/admin/organizations',
      expected: { superAdmin: 200, manager: 200, host: 403, guest: 403, anonymous: 401 },
    },
  ];

  const cases = endpoints.flatMap((endpoint) =>
    callers.map((caller) => [endpoint.name, caller, endpoint.expected[caller], endpoint] as const),
  );

  it.each(cases)('%s — %s: %i', async (_name, caller, status, endpoint) => {
    const res = await call(caller, endpoint.method, endpoint.path(), endpoint.body);
    expect(res.status).toBe(status);
  });
});
