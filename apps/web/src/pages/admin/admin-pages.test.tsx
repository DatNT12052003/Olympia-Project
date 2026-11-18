import type { AdminUser } from '@olympia/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
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
};

function signInAs(systemRole: 'member' | 'manager' | 'super_admin') {
  withStoredSession();
  return sessionResponse(makeUser({ systemRole }));
}

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

  it('Manager khóa tài khoản kèm lý do, không thấy phần phân quyền', async () => {
    const session = signInAs('manager');
    let current = member;
    const { requests } = mockApi({
      'POST /auth/refresh': () => jsonResponse(session),
      'GET /admin/users': () => jsonResponse({ items: [current], page: 1, pageSize: 20, total: 1 }),
      'GET /admin/organizations': () => jsonResponse({ items: [] }),
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

    const list = await screen.findByRole('list', { name: 'Danh sách tài khoản' });
    expect(within(list).getByText('Trần Bình')).toBeInTheDocument();
    expect(within(list).queryByText('Phân quyền')).not.toBeInTheDocument();

    await userEvent.click(within(list).getByRole('button', { name: 'Khóa' }));
    await userEvent.click(screen.getByRole('button', { name: 'Xác nhận khóa' }));
    expect(screen.getByText('Cần nhập lý do khóa.')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Lý do khóa Trần Bình'), 'Spam phòng');
    await userEvent.click(screen.getByRole('button', { name: 'Xác nhận khóa' }));

    expect(await screen.findByText('Lý do khóa: Spam phòng')).toBeInTheDocument();
    expect(within(list).getByText('Đã khóa')).toBeInTheDocument();
    expect(requests.find((r) => r.path.endsWith('/lock'))?.body).toEqual({ reason: 'Spam phòng' });
  });

  it('tìm kiếm gửi bộ lọc lên server', async () => {
    const session = signInAs('super_admin');
    const { requests } = mockApi({
      'POST /auth/refresh': () => jsonResponse(session),
      'GET /admin/users': () => jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 }),
      'GET /admin/organizations': () => jsonResponse({ items: [] }),
    });
    renderApp('/quan-tri');

    await userEvent.type(await screen.findByLabelText('Tìm theo email hoặc tên'), 'binh');
    await userEvent.click(screen.getByRole('button', { name: 'Tìm' }));

    expect(await screen.findByText('Không có tài khoản phù hợp.')).toBeInTheDocument();
    expect(requests.map((r) => r.path)).toContain('/admin/users?page=1&pageSize=20&search=binh');
  });

  it('Super Admin đổi vai trò tài khoản', async () => {
    const session = signInAs('super_admin');
    const { requests } = mockApi({
      'POST /auth/refresh': () => jsonResponse(session),
      'GET /admin/users': () => jsonResponse({ items: [member], page: 1, pageSize: 20, total: 1 }),
      'GET /admin/organizations': () => jsonResponse({ items: [] }),
      [`PATCH /admin/users/${member.id}`]: () =>
        jsonResponse({ user: { ...member, systemRole: 'manager' } }),
    });
    renderApp('/quan-tri');

    await userEvent.click(await screen.findByText('Phân quyền'));
    await userEvent.selectOptions(screen.getByLabelText('Vai trò'), 'manager');

    await expect
      .poll(() => requests.find((r) => r.method === 'PATCH')?.body)
      .toEqual({ systemRole: 'manager' });
  });
});
