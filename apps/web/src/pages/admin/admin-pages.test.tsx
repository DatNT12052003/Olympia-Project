import type { AdminUser } from '@olympia/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { formatLastActive, initials } from '../../features/admin/format-activity';
import { makeUser, mockApi, sessionResponse, withStoredSession } from '../../test/mock-api';
import { jsonResponse, renderApp } from '../../test/render';

const member: AdminUser = {
  id: '00000000-0000-4000-8000-0000000000a1',
  email: 'binh@example.com',
  displayName: 'Trần Bình',
  emailVerified: true,
  systemRole: 'member',
  canHost: true,
  status: 'active',
  lockedAt: null,
  lockedReason: null,
  organizationId: null,
  createdAt: new Date().toISOString(),
  lastActiveAt: null,
};

function signInAs(systemRole: 'member' | 'manager' | 'super_admin') {
  withStoredSession();
  return sessionResponse(makeUser({ systemRole }));
}

const usersTable = () => screen.findByRole('table', { name: 'Danh sách tài khoản' });

describe('Trang quản trị', () => {
  it('thành viên thường không vào được và không thấy liên kết Quản trị', async () => {
    const session = signInAs('member');
    mockApi({ 'POST /auth/refresh': () => jsonResponse(session) });
    renderApp('/quan-tri');

    expect(
      await screen.findByRole('heading', { name: 'Bạn không có quyền truy cập trang này' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Quản trị' })).not.toBeInTheDocument();
  });

  it('Manager khóa tài khoản qua hộp thoại có lý do, không có quyền phân quyền', async () => {
    const session = signInAs('manager');
    let current = member;
    const { requests } = mockApi({
      'POST /auth/refresh': () => jsonResponse(session),
      'GET /admin/users': () => jsonResponse({ items: [current], page: 1, pageSize: 20, total: 1 }),
      'GET /admin/organizations': () =>
        jsonResponse({
          items: [
            {
              id: '00000000-0000-4000-8000-0000000000f1',
              name: 'THPT Nguyễn Du',
              managerIds: [],
              memberCount: 1,
              createdAt: new Date().toISOString(),
            },
          ],
        }),
      [`POST /admin/users/${member.id}/lock`]: ({ body }) => {
        current = {
          ...member,
          status: 'locked',
          lockedAt: new Date().toISOString(),
          lockedReason: (body as { reason: string }).reason,
        };
        return jsonResponse({ user: current });
      },
    });
    renderApp('/quan-tri');

    const table = await usersTable();
    expect(within(table).getByText('Trần Bình')).toBeInTheDocument();
    expect(within(table).getByText('Hoạt động')).toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: 'Phân quyền' })).not.toBeInTheDocument();
    expect(await screen.findByText('Tổ chức: THPT Nguyễn Du · 1 tài khoản')).toBeInTheDocument();

    await userEvent.click(within(table).getByRole('button', { name: 'Khóa' }));
    const dialog = screen.getByRole('dialog', { name: 'Khóa tài khoản Trần Bình' });
    expect(within(dialog).getByLabelText('Lý do khóa')).toHaveFocus();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Khóa tài khoản' }));
    expect(within(dialog).getByText('Cần nhập lý do khóa.')).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText('Lý do khóa'), 'Spam phòng');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Khóa tài khoản' }));

    expect(await within(table).findByText('Lý do: Spam phòng')).toBeInTheDocument();
    expect(within(table).getByText('Đã khóa')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(requests.find((r) => r.path.endsWith('/lock'))?.body).toEqual({ reason: 'Spam phòng' });
  });

  it('hộp thoại đóng bằng phím Esc', async () => {
    const session = signInAs('manager');
    mockApi({
      'POST /auth/refresh': () => jsonResponse(session),
      'GET /admin/users': () => jsonResponse({ items: [member], page: 1, pageSize: 20, total: 1 }),
      'GET /admin/organizations': () => jsonResponse({ items: [] }),
    });
    renderApp('/quan-tri');

    await userEvent.click(within(await usersTable()).getByRole('button', { name: 'Khóa' }));
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('tài khoản chưa xác minh có nút gửi lại email xác minh', async () => {
    const session = signInAs('manager');
    const unverified = { ...member, emailVerified: false };
    const { requests } = mockApi({
      'POST /auth/refresh': () => jsonResponse(session),
      'GET /admin/users': () =>
        jsonResponse({ items: [unverified], page: 1, pageSize: 20, total: 1 }),
      'GET /admin/organizations': () => jsonResponse({ items: [] }),
      [`POST /admin/users/${member.id}/verification-email`]: () =>
        new Response(null, { status: 202 }),
    });
    renderApp('/quan-tri');

    const table = await usersTable();
    expect(within(table).getByText('Chưa xác minh email')).toBeInTheDocument();
    await userEvent.click(within(table).getByRole('button', { name: 'Gửi lại email' }));

    expect(await within(table).findByText('Đã gửi lại email xác minh.')).toBeInTheDocument();
    expect(requests.some((r) => r.path.endsWith('/verification-email'))).toBe(true);
  });

  it('tìm kiếm gửi bộ lọc lên server', async () => {
    const session = signInAs('super_admin');
    const { requests } = mockApi({
      'POST /auth/refresh': () => jsonResponse(session),
      'GET /admin/users': () => jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 }),
      'GET /admin/organizations': () => jsonResponse({ items: [] }),
    });
    renderApp('/quan-tri');

    await userEvent.type(await screen.findByLabelText('Tìm theo tên hoặc email'), 'binh');
    await userEvent.click(screen.getByRole('button', { name: 'Tìm' }));

    expect(await screen.findByText('Không có tài khoản phù hợp.')).toBeInTheDocument();
    expect(requests.map((r) => r.path)).toContain('/admin/users?page=1&pageSize=20&search=binh');
  });

  it('Super Admin đổi vai trò trong hộp thoại phân quyền', async () => {
    const session = signInAs('super_admin');
    const { requests } = mockApi({
      'POST /auth/refresh': () => jsonResponse(session),
      'GET /admin/users': () => jsonResponse({ items: [member], page: 1, pageSize: 20, total: 1 }),
      'GET /admin/organizations': () => jsonResponse({ items: [] }),
      [`PATCH /admin/users/${member.id}`]: () =>
        jsonResponse({ user: { ...member, systemRole: 'manager' } }),
    });
    renderApp('/quan-tri');

    await userEvent.click(within(await usersTable()).getByRole('button', { name: 'Phân quyền' }));
    const dialog = screen.getByRole('dialog', { name: 'Phân quyền Trần Bình' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Vai trò'), 'manager');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));

    await expect
      .poll(() => requests.find((r) => r.method === 'PATCH')?.body)
      .toEqual({ systemRole: 'manager' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Định dạng hiển thị', () => {
  it('thời điểm hoạt động gần nhất theo cách viết của thiết kế', () => {
    const now = new Date(2026, 10, 18, 21, 0);

    expect(formatLastActive(null, now)).toBe('Chưa đăng nhập');
    expect(formatLastActive(new Date(2026, 10, 18, 20, 52).toISOString(), now)).toMatch(
      /^Hôm nay, 20:52$/,
    );
    expect(formatLastActive(new Date(2026, 10, 17, 9, 0).toISOString(), now)).toBe('Hôm qua');
    expect(formatLastActive(new Date(2026, 10, 16, 9, 0).toISOString(), now)).toBe('2 ngày trước');
    expect(formatLastActive(new Date(2026, 10, 1, 9, 0).toISOString(), now)).toBe('01/11/2026');
  });

  it('chữ cái đầu lấy từ hai từ cuối của tên', () => {
    expect(initials('Nguyễn Thu Hà')).toBe('TH');
    expect(initials('đức')).toBe('Đ');
  });
});
