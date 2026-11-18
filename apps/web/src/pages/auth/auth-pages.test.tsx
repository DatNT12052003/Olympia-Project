import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { safeNextPath } from '../../features/auth/next-path';
import {
  errorResponse,
  makeUser,
  mockApi,
  sessionResponse,
  withStoredSession,
} from '../../test/mock-api';
import { jsonResponse, renderApp } from '../../test/render';

const accountNav = () => screen.getByRole('navigation', { name: 'Tài khoản' });

describe('Đăng nhập', () => {
  it('chưa đăng nhập vào trang tài khoản thì chuyển tới đăng nhập, xong quay lại', async () => {
    const { requests } = mockApi({
      'POST /auth/login': () => jsonResponse(sessionResponse(makeUser())),
    });
    const { router } = renderApp('/tai-khoan');

    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?next=%2Ftai-khoan');

    await userEvent.type(screen.getByLabelText('Email'), '  AN@example.com ');
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'Mat-khau-123');
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByRole('heading', { name: 'Tài khoản' })).toBeInTheDocument();
    expect(requests.find((r) => r.path === '/auth/login')?.body).toEqual({
      email: 'an@example.com',
      password: 'Mat-khau-123',
    });
    expect(accountNav()).toHaveTextContent('Nguyễn An');
    expect(localStorage.getItem('olympia.session')).toBe('1');
  });

  it('hiển thị lỗi từ server khi sai thông tin', async () => {
    mockApi({
      'POST /auth/login': () =>
        errorResponse(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng.'),
    });
    renderApp('/dang-nhap');

    await userEvent.type(await screen.findByLabelText('Email'), 'an@example.com');
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'sai');
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Email hoặc mật khẩu không đúng.');
  });

  it('kiểm tra dữ liệu trước khi gửi', async () => {
    const { requests } = mockApi({});
    renderApp('/dang-nhap');

    await userEvent.click(await screen.findByRole('button', { name: 'Đăng nhập' }));

    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Email không hợp lệ.');
    expect(screen.getByLabelText('Mật khẩu')).toHaveAttribute('aria-invalid', 'true');
    expect(requests.filter((r) => r.path.startsWith('/auth'))).toHaveLength(0);
  });

  it('khôi phục phiên khi tải lại trang', async () => {
    withStoredSession();
    mockApi({ 'POST /auth/refresh': () => jsonResponse(sessionResponse()) });
    renderApp('/');

    await waitFor(() => expect(accountNav()).toHaveTextContent('Nguyễn An'));
    expect(screen.queryByRole('link', { name: 'Quản trị' })).not.toBeInTheDocument();
  });

  it('chỉ chuyển hướng nội bộ sau đăng nhập (chống open redirect)', () => {
    expect(safeNextPath('/tai-khoan?tab=1')).toBe('/tai-khoan?tab=1');
    expect(safeNextPath('//evil.example')).toBe('/');
    expect(safeNextPath('/\\evil.example')).toBe('/');
    expect(safeNextPath('https://evil.example')).toBe('/');
    expect(safeNextPath(null)).toBe('/');
  });
});

describe('Đăng ký', () => {
  it('báo lỗi từng trường, kể cả chưa đồng ý chính sách', async () => {
    mockApi({});
    renderApp('/dang-ky');

    await userEvent.type(await screen.findByLabelText('Mật khẩu'), 'ngan');
    await userEvent.click(screen.getByRole('button', { name: 'Đăng ký' }));

    expect(screen.getByLabelText('Mật khẩu')).toHaveAccessibleDescription(
      /Tối thiểu 8 ký tự\.\s*Mật khẩu tối thiểu 8 ký tự\./,
    );
    expect(screen.getByText('Bạn cần đồng ý chính sách quyền riêng tư.')).toBeInTheDocument();
  });

  it('đăng ký xong vào trang tài khoản, nhắc xác minh email và gửi lại được', async () => {
    const user = makeUser({ emailVerified: false });
    const { requests } = mockApi({
      'POST /auth/register': () => jsonResponse(sessionResponse(user), 201),
      'POST /auth/verify-email/resend': () => new Response(null, { status: 202 }),
    });
    renderApp('/dang-ky');

    await userEvent.type(await screen.findByLabelText('Email'), 'an@example.com');
    await userEvent.type(screen.getByLabelText('Tên hiển thị'), 'Nguyễn An');
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'Mat-khau-123');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Đăng ký' }));

    expect(await screen.findByText('Email chưa được xác minh.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Gửi lại email xác minh' }));

    expect(await screen.findByText('Đã gửi. Liên kết có hiệu lực 24 giờ.')).toBeInTheDocument();
    expect(requests.find((r) => r.path === '/auth/register')?.body).toMatchObject({
      acceptPrivacyPolicy: true,
    });
    expect(
      requests.find((r) => r.path === '/auth/verify-email/resend')?.headers.get('Authorization'),
    ).toBe('Bearer access-1');
  });

  it('hiển thị lỗi email đã được đăng ký', async () => {
    mockApi({
      'POST /auth/register': () => errorResponse(409, 'EMAIL_TAKEN', 'Email đã được đăng ký.'),
    });
    renderApp('/dang-ky');

    await userEvent.type(await screen.findByLabelText('Email'), 'an@example.com');
    await userEvent.type(screen.getByLabelText('Tên hiển thị'), 'Nguyễn An');
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'Mat-khau-123');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Đăng ký' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Email đã được đăng ký.');
  });
});

describe('Xác minh email, quên và đặt lại mật khẩu', () => {
  it('xác minh email gửi token đúng một lần', async () => {
    const { requests } = mockApi({
      'POST /auth/verify-email': () => jsonResponse({ user: makeUser() }),
    });
    renderApp('/xac-minh-email?token=abcdefghijklmnopqrstuvwxyz');

    expect(await screen.findByText(/Email đã được xác minh/)).toBeInTheDocument();
    const calls = requests.filter((r) => r.path === '/auth/verify-email');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toEqual({ token: 'abcdefghijklmnopqrstuvwxyz' });
  });

  it('token xác minh hết hạn hiển thị lỗi', async () => {
    mockApi({
      'POST /auth/verify-email': () =>
        errorResponse(400, 'INVALID_ACTION_TOKEN', 'Liên kết không hợp lệ hoặc đã hết hạn.'),
    });
    renderApp('/xac-minh-email?token=abcdefghijklmnopqrstuvwxyz');

    expect(await screen.findByRole('alert')).toHaveTextContent('đã hết hạn');
  });

  it('quên mật khẩu luôn hiển thị cùng một thông báo', async () => {
    mockApi({ 'POST /auth/forgot-password': () => new Response(null, { status: 202 }) });
    renderApp('/quen-mat-khau');

    await userEvent.type(await screen.findByLabelText('Email'), 'ai-do@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Gửi liên kết' }));

    expect(await screen.findByText(/Nếu email này đã đăng ký/)).toBeInTheDocument();
  });

  it('đặt lại mật khẩu kiểm tra nhập lại và gửi token', async () => {
    const { requests } = mockApi({
      'POST /auth/reset-password': () => new Response(null, { status: 204 }),
    });
    renderApp('/dat-lai-mat-khau?token=abcdefghijklmnopqrstuvwxyz');

    await userEvent.type(await screen.findByLabelText('Mật khẩu mới'), 'Mat-khau-moi-1');
    await userEvent.type(screen.getByLabelText('Nhập lại mật khẩu mới'), 'Khac-hoan-toan');
    await userEvent.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }));
    expect(screen.getByText('Mật khẩu nhập lại không khớp.')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Nhập lại mật khẩu mới'));
    await userEvent.type(screen.getByLabelText('Nhập lại mật khẩu mới'), 'Mat-khau-moi-1');
    await userEvent.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }));

    expect(await screen.findByText(/Đã đặt lại mật khẩu/)).toBeInTheDocument();
    expect(requests.find((r) => r.path === '/auth/reset-password')?.body).toEqual({
      token: 'abcdefghijklmnopqrstuvwxyz',
      password: 'Mat-khau-moi-1',
    });
  });
});

describe('Trang tài khoản', () => {
  it('đăng xuất đưa về trạng thái chưa đăng nhập', async () => {
    withStoredSession();
    const { requests } = mockApi({
      'POST /auth/refresh': () => jsonResponse(sessionResponse()),
      'POST /auth/logout': () => new Response(null, { status: 204 }),
    });
    renderApp('/tai-khoan');

    await userEvent.click(await screen.findByRole('button', { name: 'Đăng xuất' }));

    expect(await screen.findByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(requests.some((r) => r.path === '/auth/logout')).toBe(true);
    expect(localStorage.getItem('olympia.session')).toBeNull();
  });

  it('cập nhật tên hiển thị và phản ánh lên header', async () => {
    withStoredSession();
    mockApi({
      'POST /auth/refresh': () => jsonResponse(sessionResponse()),
      'PATCH /me': ({ body }) =>
        jsonResponse({
          user: makeUser({ displayName: (body as { displayName: string }).displayName }),
        }),
    });
    renderApp('/tai-khoan');

    const input = await screen.findByLabelText('Tên hiển thị');
    await userEvent.clear(input);
    await userEvent.type(input, 'An Nguyễn');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu hồ sơ' }));

    expect(await screen.findByText('Đã lưu hồ sơ.')).toBeInTheDocument();
    expect(accountNav()).toHaveTextContent('An Nguyễn');
  });
});
