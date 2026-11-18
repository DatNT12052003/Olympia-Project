import type {
  GuestSessionResponse,
  HostRoom,
  ParticipantView,
  RoomPreview,
  RoomState,
} from '@olympia/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { errorResponse, mockApi, sessionResponse, withStoredSession } from '../../test/mock-api';
import { lastSocket, mockSocketServer, serverPush } from '../../test/mock-socket';
import { jsonResponse, renderApp } from '../../test/render';

vi.mock('socket.io-client', async () => (await import('../../test/mock-socket')).socketIoMock);

const ROOM_ID = '00000000-0000-4000-8000-0000000000a1';
const ME_ID = '00000000-0000-4000-8000-0000000000b1';
const PENDING_ID = '00000000-0000-4000-8000-0000000000b2';

function hostRoom(overrides: Partial<HostRoom> = {}): HostRoom {
  return {
    id: ROOM_ID,
    name: 'Lớp 12A1 – Ôn thi học kỳ',
    description: null,
    maxPlayers: 4,
    visibility: 'private',
    hasPassword: false,
    allowSpectators: true,
    maxSpectators: 50,
    allowGuests: true,
    autoApprove: false,
    controlMode: 'manual',
    reactionsEnabled: true,
    status: 'open',
    code: 'K7Q2XM',
    playerCount: 3,
    spectatorCount: 12,
    createdAt: new Date().toISOString(),
    openedAt: new Date().toISOString(),
    ...overrides,
  };
}

function participant(overrides: Partial<ParticipantView> = {}): ParticipantView {
  return {
    id: ME_ID,
    displayName: 'Minh Anh',
    kind: 'guest',
    role: 'player',
    status: 'approved',
    seat: 1,
    ready: false,
    connection: 'online',
    disconnectedAt: null,
    ...overrides,
  };
}

function roomState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    version: 5,
    audience: 'member',
    room: {
      id: ROOM_ID,
      name: 'Lớp 12A1 – Ôn thi học kỳ',
      code: 'K7Q2XM',
      status: 'open',
      visibility: 'private',
      controlMode: 'manual',
      maxPlayers: 4,
      allowSpectators: true,
      maxSpectators: 50,
      reactionsEnabled: true,
    },
    host: { displayName: 'Cô Thu Hà', connection: 'online' },
    players: [participant()],
    pending: [],
    spectators: { count: 0, items: [] },
    reconnectGraceSeconds: 120,
    ...overrides,
  };
}

const preview: RoomPreview = {
  id: ROOM_ID,
  code: 'K7Q2XM',
  name: 'Lớp 12A1 – Ôn thi học kỳ',
  hostName: 'Cô Thu Hà',
  status: 'open',
  visibility: 'private',
  requiresPassword: false,
  allowGuests: true,
  allowSpectators: true,
  players: { taken: 2, total: 4 },
  spectators: { taken: 0, total: 50 },
};

function guestSession(): GuestSessionResponse {
  return {
    accessToken: 'guest-token',
    accessTokenExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    sessionExpiresAt: new Date(Date.now() + 24 * 3_600_000).toISOString(),
    guest: { id: '00000000-0000-4000-8000-0000000000c1', displayName: 'Minh Anh', roomId: ROOM_ID },
  };
}

describe('Phòng thi của tôi (Host)', () => {
  it('liệt kê phòng, giới hạn phòng đang mở và lọc theo trạng thái', async () => {
    withStoredSession();
    mockApi({
      'POST /auth/refresh': () => jsonResponse(sessionResponse()),
      'GET /rooms': () =>
        jsonResponse({
          items: [
            hostRoom(),
            hostRoom({
              id: '00000000-0000-4000-8000-0000000000a2',
              name: 'Địa lý 9 – Thử nghiệm',
              status: 'draft',
              code: null,
              playerCount: 0,
              spectatorCount: 0,
            }),
          ],
          activeCount: 1,
          activeLimit: 5,
        }),
    });
    renderApp('/phong-thi');

    expect(await screen.findByText('Đang mở 1/5 phòng cho phép.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Lớp 12A1 – Ôn thi học kỳ' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mở sảnh chờ' })).toHaveAttribute(
      'href',
      `/phong/${ROOM_ID}`,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Nháp (1)' }));
    expect(screen.queryByRole('heading', { name: 'Lớp 12A1 – Ôn thi học kỳ' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Tiếp tục cấu hình' })).toHaveAttribute(
      'href',
      '/phong-thi/00000000-0000-4000-8000-0000000000a2/sua',
    );
  });

  it('tạo phòng và mở sảnh chờ', async () => {
    withStoredSession();
    const { requests } = mockApi({
      'POST /auth/refresh': () => jsonResponse(sessionResponse()),
      'POST /rooms': () => jsonResponse({ room: hostRoom() }, 201),
    });
    const { router } = renderApp('/phong-thi/tao');

    await userEvent.type(await screen.findByLabelText('Tên phòng *'), 'CLB Toán – Vòng loại');
    await userEvent.click(
      screen.getByRole('radio', {
        name: 'Công khai',
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Tạo và mở sảnh chờ' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/phong/${ROOM_ID}`));
    const create = requests.find((r) => r.method === 'POST' && r.path === '/rooms');
    expect(create?.body).toMatchObject({
      name: 'CLB Toán – Vòng loại',
      visibility: 'public',
      password: null,
      maxPlayers: 4,
      open: true,
    });
    expect(create?.headers.get('Authorization')).toBe('Bearer access-1');
  });
});

describe('Vào phòng', () => {
  it('khách vào phòng bằng link mời và nhận phiên khách gắn phòng', async () => {
    const { requests } = mockApi({
      'GET /rooms/lookup': () => jsonResponse({ room: preview }),
      'GET /rooms/public': () => jsonResponse({ items: [] }),
      [`POST /rooms/${ROOM_ID}/join`]: () =>
        jsonResponse(
          {
            participant: participant({ status: 'pending', seat: null }),
            guestSession: guestSession(),
          },
          201,
        ),
    });
    mockSocketServer({});
    const { router } = renderApp('/vao-phong/k7q2xm');

    expect(await screen.findByText('Phòng “Lớp 12A1 – Ôn thi học kỳ” đang mở')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Người chơi/ })).toBeChecked();
    expect(screen.getByText('Còn 2/4 chỗ · Host sẽ duyệt')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Tên hiển thị'), 'Minh Anh');
    await userEvent.click(screen.getByRole('button', { name: 'Vào phòng' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/phong/${ROOM_ID}`));
    const join = requests.find((r) => r.path === `/rooms/${ROOM_ID}/join`);
    expect(join?.body).toEqual({ role: 'player', displayName: 'Minh Anh' });
    expect(join?.headers.get('Authorization')).toBeNull();
    expect(localStorage.getItem('olympia.guestRoom')).toBe(ROOM_ID);
  });

  it('báo tên hiển thị bị trùng ngay tại ô nhập', async () => {
    mockApi({
      'GET /rooms/lookup': () => jsonResponse({ room: preview }),
      'GET /rooms/public': () => jsonResponse({ items: [] }),
      [`POST /rooms/${ROOM_ID}/join`]: () =>
        errorResponse(409, 'DISPLAY_NAME_TAKEN', 'Tên hiển thị đã có người dùng trong phòng.'),
    });
    renderApp('/vao-phong/K7Q2XM');

    await screen.findByText('Phòng “Lớp 12A1 – Ôn thi học kỳ” đang mở');
    await userEvent.type(screen.getByLabelText('Tên hiển thị'), 'Minh Anh');
    await userEvent.click(screen.getByRole('button', { name: 'Vào phòng' }));

    expect(await screen.findByLabelText('Tên hiển thị')).toHaveAccessibleDescription(
      'Tên hiển thị đã có người dùng trong phòng.',
    );
  });
});

describe('Sảnh chờ', () => {
  it('Host duyệt người chờ và bỏ qua trạng thái có version cũ hơn', async () => {
    withStoredSession();
    const { requests } = mockApi({
      'POST /auth/refresh': () => jsonResponse(sessionResponse()),
      [`POST /rooms/${ROOM_ID}/participants/${PENDING_ID}/approve`]: () =>
        new Response(null, { status: 204 }),
    });
    const hostState = roomState({
      audience: 'host',
      pending: [
        participant({ id: PENDING_ID, displayName: 'Thùy Linh', status: 'pending', seat: null }),
      ],
    });
    mockSocketServer({
      'room:subscribe': (_payload, ack) => ack?.({ ok: true, data: hostState }),
    });
    renderApp(`/phong/${ROOM_ID}`);

    expect(await screen.findByText('K7Q2XM')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Vị trí 1: Minh Anh' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Vị trí 2: trống' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Duyệt Thùy Linh' }));
    await waitFor(() =>
      expect(requests.some((r) => r.path.endsWith(`/participants/${PENDING_ID}/approve`))).toBe(
        true,
      ),
    );

    // Bản mới hơn được áp dụng; bản cũ hơn bị bỏ qua (BR-RT-03).
    serverPush(
      'room:state',
      roomState({
        audience: 'host',
        version: 6,
        players: [
          participant(),
          participant({ id: PENDING_ID, displayName: 'Thùy Linh', seat: 2 }),
        ],
      }),
    );
    expect(await screen.findByRole('article', { name: 'Vị trí 2: Thùy Linh' })).toBeInTheDocument();
    serverPush('room:state', hostState);
    expect(screen.getByRole('article', { name: 'Vị trí 2: Thùy Linh' })).toBeInTheDocument();
  });

  it('khách khôi phục phiên, bấm Sẵn sàng, rồi thấy thông báo khi bị mời ra', async () => {
    localStorage.setItem('olympia.guestRoom', ROOM_ID);
    const { requests } = mockApi({
      'POST /auth/guest': () => jsonResponse(guestSession()),
      [`GET /rooms/${ROOM_ID}/me`]: () => jsonResponse({ participant: participant() }),
      [`POST /rooms/${ROOM_ID}/me/ready`]: () => new Response(null, { status: 204 }),
    });
    mockSocketServer({
      'room:subscribe': (_payload, ack) => ack?.({ ok: true, data: roomState() }),
    });
    renderApp(`/phong/${ROOM_ID}`);

    const ready = await screen.findByRole('button', { name: 'Tôi đã sẵn sàng' });
    const me = requests.find((r) => r.path === `/rooms/${ROOM_ID}/me`);
    expect(me?.headers.get('Authorization')).toBe('Bearer guest-token');

    await userEvent.click(ready);
    await waitFor(() =>
      expect(requests.find((r) => r.path === `/rooms/${ROOM_ID}/me/ready`)?.body).toEqual({
        ready: true,
      }),
    );

    serverPush('disconnect', 'transport close');
    const dialog = await screen.findByRole('alertdialog', { name: 'Mất kết nối với phòng thi' });
    expect(within(dialog).getByRole('timer')).toHaveTextContent('2:00');

    serverPush('room:removed', { roomId: ROOM_ID, reason: 'kicked' });
    expect(
      await screen.findByRole('heading', { name: 'Bạn đã được mời ra khỏi phòng' }),
    ).toBeInTheDocument();
    expect(lastSocket().emitted[0]).toEqual({
      event: 'room:subscribe',
      payload: { roomId: ROOM_ID },
    });
  });

  it('báo chưa vào phòng khi server từ chối theo dõi phòng', async () => {
    mockApi({});
    mockSocketServer({
      'room:subscribe': (_payload, ack) =>
        ack?.({
          ok: false,
          error: { code: 'NOT_IN_ROOM', message: 'Bạn không ở trong phòng này.' },
        }),
    });
    renderApp(`/phong/${ROOM_ID}`);

    expect(
      await screen.findByRole('heading', { name: 'Bạn chưa vào phòng này' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nhập mã phòng' })).toHaveAttribute(
      'href',
      '/vao-phong',
    );
  });
});
