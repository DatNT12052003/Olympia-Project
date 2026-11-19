import type {
  GuestSessionResponse,
  MatchQuestionView,
  MatchView,
  ParticipantView,
  RoomState,
  ScriptDetail,
} from '@olympia/shared';
import { WARMUP_PRESETS } from '@olympia/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockApi, sessionResponse, withStoredSession } from '../../test/mock-api';
import { lastSocket, mockSocketServer, serverPush } from '../../test/mock-socket';
import { jsonResponse, renderApp } from '../../test/render';

vi.mock('socket.io-client', async () => (await import('../../test/mock-socket')).socketIoMock);

const ROOM_ID = '00000000-0000-4000-8000-0000000000a1';
const MATCH_ID = '00000000-0000-4000-8000-0000000000d1';
const ME_ID = '00000000-0000-4000-8000-0000000000b1';

function participant(overrides: Partial<ParticipantView> = {}): ParticipantView {
  return {
    id: ME_ID,
    displayName: 'Minh Anh',
    kind: 'guest',
    role: 'player',
    status: 'approved',
    seat: 1,
    ready: true,
    connection: 'online',
    disconnectedAt: null,
    ...overrides,
  };
}

function roomState(audience: RoomState['audience']): RoomState {
  return {
    version: 9,
    audience,
    room: {
      id: ROOM_ID,
      name: 'Lớp 12A1 – Ôn thi học kỳ',
      code: 'K7Q2XM',
      status: 'in_match',
      visibility: 'private',
      controlMode: 'manual',
      maxPlayers: 4,
      allowSpectators: true,
      maxSpectators: 50,
      reactionsEnabled: true,
      script: null,
    },
    host: { displayName: 'Cô Thu Hà', connection: 'online' },
    players: [participant(), participant({ id: 'p2', displayName: 'Bảo Ngọc', seat: 2 })],
    pending: [],
    spectators: { count: 3, items: [] },
    reconnectGraceSeconds: 120,
  };
}

function question(overrides: Partial<MatchQuestionView> = {}): MatchQuestionView {
  return {
    ref: '0.3',
    phase: 'answering',
    content: 'Hình chóp tứ giác đều có bao nhiêu mặt phẳng đối xứng?',
    answerType: 'mcq',
    options: ['2', '3', '4', '6'],
    media: null,
    points: { correct: 10, wrong: 0 },
    correctAnswer: null,
    explanation: null,
    answeringSeat: 1,
    answers: [{ seat: 1, state: 'none', answer: null, elapsedMs: null, suggested: null }],
    ...overrides,
  };
}

function matchView(overrides: Partial<MatchView> = {}): MatchView {
  return {
    matchId: MATCH_ID,
    roomId: ROOM_ID,
    version: 12,
    audience: 'player',
    mySeat: 1,
    status: 'running',
    endReason: null,
    pause: null,
    rounds: [{ type: 'warmup', title: 'Khởi động' }],
    roundIndex: 0,
    roundFinished: false,
    players: [
      {
        seat: 1,
        displayName: 'Minh Anh',
        kind: 'guest',
        score: 30,
        roundScores: [30],
        connection: 'online',
        disconnectedAt: null,
        eliminated: false,
      },
      {
        seat: 2,
        displayName: 'Bảo Ngọc',
        kind: 'guest',
        score: 20,
        roundScores: [20],
        connection: 'disconnected',
        disconnectedAt: new Date().toISOString(),
        eliminated: false,
      },
    ],
    timer: { endsAt: Date.now() + 5000, durationMs: 5000, remainingMs: null },
    round: {
      type: 'warmup',
      part: 'individual',
      answerMode: 'device',
      turnSeat: 1,
      questionNo: 4,
      questionTotal: 6,
      question: question(),
      buzz: null,
      history: [],
      reserves: 0,
    },
    log: [],
    serverTime: Date.now(),
    ...overrides,
  };
}

function guestSession(): GuestSessionResponse {
  return {
    accessToken: 'guest-token',
    accessTokenExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    sessionExpiresAt: new Date(Date.now() + 24 * 3_600_000).toISOString(),
    guest: { id: '00000000-0000-4000-8000-0000000000c1', displayName: 'Minh Anh', roomId: ROOM_ID },
  };
}

function asGuestPlayer() {
  localStorage.setItem('olympia.guestRoom', ROOM_ID);
  mockApi({
    'POST /auth/guest': () => jsonResponse(guestSession()),
    [`GET /rooms/${ROOM_ID}/me`]: () => jsonResponse({ participant: participant() }),
  });
}

describe('Trận đấu – người chơi', () => {
  it('đến lượt: chọn đáp án và gửi kèm id hành động; không thấy đáp án đúng', async () => {
    asGuestPlayer();
    const answers: unknown[] = [];
    mockSocketServer({
      'room:subscribe': (_payload, ack) => ack?.({ ok: true, data: roomState('member') }),
      'match:sync': (_payload, ack) => ack?.({ ok: true, data: matchView() }),
      'match:answer': (payload, ack) => {
        answers.push(payload);
        ack?.({ ok: true, data: { elapsedMs: 1200 } });
      },
    });
    renderApp(`/phong/${ROOM_ID}`);

    expect(await screen.findByText(/Lượt của bạn · Câu 4\/6/)).toBeInTheDocument();
    expect(screen.queryByText(/chỉ Host thấy/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^B\s*3/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Gửi đáp án B' }));
    await waitFor(() => expect(answers).toHaveLength(1));
    expect(answers[0]).toEqual({
      roomId: ROOM_ID,
      actionId: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown,
      questionRef: '0.3',
      answer: { type: 'mcq', index: 1 },
    });

    // Server đẩy bản mới: đã gửi, chờ Host chấm.
    serverPush(
      'match:state',
      matchView({
        version: 13,
        timer: null,
        round: {
          ...matchView().round,
          question: question({
            phase: 'judging',
            answers: [
              {
                seat: 1,
                state: 'answered',
                answer: { type: 'mcq', index: 1 },
                elapsedMs: 1200,
                suggested: null,
              },
            ],
          }),
        },
      }),
    );
    expect(await screen.findByText(/chờ Host chấm/)).toBeInTheDocument();
  });

  it('phần thi chung: bấm chuông khi chuông mở', async () => {
    asGuestPlayer();
    const buzzes: unknown[] = [];
    const shared = matchView({
      round: {
        ...matchView().round,
        part: 'shared',
        turnSeat: null,
        questionNo: 7,
        questionTotal: 12,
        question: question({
          phase: 'buzzing',
          answeringSeat: null,
          answers: [],
          points: { correct: 10, wrong: 5 },
        }),
        buzz: { open: true, winnerSeat: null, attemptedSeats: [] },
      },
    });
    mockSocketServer({
      'room:subscribe': (_payload, ack) => ack?.({ ok: true, data: roomState('member') }),
      'match:sync': (_payload, ack) => ack?.({ ok: true, data: shared }),
      'match:buzz': (payload, ack) => {
        buzzes.push(payload);
        ack?.({ ok: true, data: { won: false } });
      },
    });
    renderApp(`/phong/${ROOM_ID}`);

    await userEvent.click(await screen.findByRole('button', { name: /BẤM CHUÔNG/ }));
    await waitFor(() => expect(buzzes).toHaveLength(1));
    expect(await screen.findByText('Người khác đã giành quyền trước.')).toBeInTheDocument();
  });
});

describe('Trận đấu – Host', () => {
  it('thấy đáp án, chấm và gửi lệnh điều khiển', async () => {
    withStoredSession();
    mockApi({ 'POST /auth/refresh': () => jsonResponse(sessionResponse()) });
    const commands: unknown[] = [];
    const hostView = matchView({
      audience: 'host',
      mySeat: null,
      round: {
        ...matchView().round,
        question: question({
          phase: 'judging',
          correctAnswer: { type: 'mcq', options: ['2', '3', '4', '6'], correctIndex: 2 },
          answers: [
            {
              seat: 1,
              state: 'answered',
              answer: { type: 'mcq', index: 2 },
              elapsedMs: 2310,
              suggested: 'correct',
            },
          ],
        }),
      },
      log: [{ at: Date.now(), text: 'Bảo Ngọc mất kết nối' }],
    });
    mockSocketServer({
      'room:subscribe': (_payload, ack) => ack?.({ ok: true, data: roomState('host') }),
      'match:sync': (_payload, ack) => ack?.({ ok: true, data: hostView }),
      'match:command': (payload, ack) => {
        commands.push(payload);
        ack?.({ ok: true });
      },
    });
    renderApp(`/phong/${ROOM_ID}`);

    expect(await screen.findByText(/Đáp án · chỉ Host thấy/)).toBeInTheDocument();
    expect(screen.getByText(/sau 2,31 giây · hệ thống chấm: Đúng/)).toBeInTheDocument();
    expect(screen.getByText(/Mất kết nối · 2:00|Mất kết nối · 1:59/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '✓ Xác nhận Đúng' }));
    await waitFor(() =>
      expect(commands).toEqual([
        expect.objectContaining({ command: { type: 'judge', seat: 1, correct: true } }),
      ]),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Điều chỉnh điểm' }));
    await userEvent.type(screen.getByLabelText('Số điểm (+ cộng, − trừ)'), '5');
    await userEvent.type(screen.getByLabelText('Lý do'), 'Thưởng tinh thần');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu điều chỉnh' }));
    await waitFor(() => expect(commands).toHaveLength(2));
    expect(commands[1]).toEqual(
      expect.objectContaining({
        command: { type: 'adjust_score', seat: 1, delta: 5, reason: 'Thưởng tinh thần' },
      }),
    );
    expect(lastSocket().emitted.map((e) => e.event)).toContain('match:sync');
  });
});

describe('Kịch bản', () => {
  it('tạo kịch bản vòng Khởi động từ bộ đề của mình', async () => {
    withStoredSession();
    const saved: ScriptDetail = {
      id: '00000000-0000-4000-8000-0000000000e1',
      name: 'Khởi động – Toán 11',
      settings: {
        breakSeconds: 30,
        soundEffects: true,
        allowNegativeScore: false,
        onTurnDisconnect: 'pause',
      },
      rounds: [
        {
          round: {
            type: 'warmup',
            preset: 'olympia',
            source: { kind: 'set', setId: '00000000-0000-4000-8000-0000000000f1' },
            rules: WARMUP_PRESETS[0]!.rules,
          },
          source: { kind: 'set', name: 'Toán 11', available: 40, unavailable: false },
          check: { fixed: 12, perPlayer: 6, supportedPlayers: 4, issues: [] },
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    const { requests } = mockApi({
      'POST /auth/refresh': () => jsonResponse(sessionResponse()),
      'GET /question-sets': () =>
        jsonResponse({
          items: [
            {
              id: '00000000-0000-4000-8000-0000000000f1',
              name: 'Toán 11',
              description: null,
              subject: null,
              grade: null,
              questionCount: 40,
              roundCounts: { warmup: 40 },
              publication: { approved: null, pending: null, rejected: null },
              updatedAt: new Date().toISOString(),
            },
          ],
        }),
      'GET /public-question-sets': () => jsonResponse({ items: [] }),
      'POST /scripts': () => jsonResponse({ script: saved }, 201),
      [`GET /scripts/${saved.id}`]: () => jsonResponse({ script: saved }),
    });
    const { router } = renderApp('/kich-ban/moi');

    await userEvent.type(await screen.findByLabelText('Tên kịch bản'), 'Khởi động – Toán 11');
    await screen.findByRole('option', { name: /Toán 11 \(40 câu Khởi động\)/ });
    await userEvent.selectOptions(
      screen.getByLabelText('Nguồn câu hỏi'),
      'set:00000000-0000-4000-8000-0000000000f1',
    );
    expect(screen.getByText(/Đủ câu hỏi \(40 câu\)/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Lưu kịch bản' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/kich-ban/${saved.id}`));
    const create = requests.find((r) => r.method === 'POST' && r.path === '/scripts');
    expect(create?.body).toMatchObject({
      name: 'Khởi động – Toán 11',
      rounds: [
        { type: 'warmup', source: { kind: 'set', setId: '00000000-0000-4000-8000-0000000000f1' } },
      ],
    });
  });
});
