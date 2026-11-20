import type { HistoryList, MatchResult, MyStats, ReportList } from '@olympia/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeUser, mockApi, sessionResponse, withStoredSession } from '../../test/mock-api';
import { jsonResponse, renderApp } from '../../test/render';

const MATCH_ID = '00000000-0000-4000-8000-0000000000c1';
const ROOM_ID = '00000000-0000-4000-8000-0000000000c2';

function result(overrides: Partial<MatchResult> = {}): MatchResult {
  return {
    matchId: MATCH_ID,
    roomId: ROOM_ID,
    roomName: 'Lớp 12A1 – Ôn thi học kỳ',
    scriptName: 'Ôn thi',
    startedAt: '2026-11-18T13:14:00.000Z',
    endedAt: '2026-11-18T13:52:00.000Z',
    outcome: 'completed',
    voided: null,
    rounds: [
      { type: 'warmup', title: 'Vòng 1 (Khởi động)' },
      { type: 'obstacle', title: 'Vòng 2 (Vượt chướng ngại vật)' },
    ],
    players: [
      {
        seat: 4,
        displayName: 'Đức Huy',
        rank: 1,
        score: 110,
        roundScores: [60, 50],
        winner: true,
        eliminated: false,
        wonTiebreak: false,
        stats: { correct: 8, wrong: 2, skipped: 1, avgAnswerMs: 3100, buzzWins: 3 },
      },
      {
        seat: 1,
        displayName: 'Minh Anh',
        rank: 2,
        score: 90,
        roundScores: [70, 20],
        winner: false,
        eliminated: false,
        wonTiebreak: false,
        stats: { correct: 7, wrong: 3, skipped: 1, avgAnswerMs: null, buzzWins: 0 },
      },
    ],
    hardQuestions: [{ ref: '0.1', content: 'Mặt cầu ngoại tiếp?', wrong: 1, total: 2 }],
    answersPublic: true,
    questions: [
      {
        ref: '0.1',
        roundIndex: 0,
        content: 'Mặt cầu ngoại tiếp?',
        media: null,
        answer: { type: 'mcq', options: ['a', 'a√3/2'], correctIndex: 1 },
        explanation: 'Bán kính bằng nửa đường chéo.',
        outcomes: [
          { seat: 1, result: 'wrong' },
          { seat: 4, result: 'correct' },
        ],
      },
    ],
    viewer: { role: 'host', seat: null, canToggleAnswers: true, canVoid: false },
    ...overrides,
  };
}

describe('Tổng kết trận /tran/:matchId', () => {
  it('bảng điểm theo vòng, thống kê, đáp án; Host tắt công bố đáp án', async () => {
    withStoredSession();
    const session = sessionResponse(makeUser());
    let current = result();
    const { requests } = mockApi({
      'POST /auth/refresh': () => jsonResponse(session),
      [`GET /matches/${MATCH_ID}`]: () => jsonResponse(current),
      [`PUT /matches/${MATCH_ID}/answers-visibility`]: ({ body }) => {
        current = { ...current, answersPublic: (body as { answersPublic: boolean }).answersPublic };
        return new Response(null, { status: 204 });
      },
    });
    renderApp(`/tran/${MATCH_ID}`);

    expect(
      await screen.findByRole('heading', { name: 'Đức Huy về đích đầu tiên' }),
    ).toBeInTheDocument();
    const podium = screen.getByRole('list', { name: 'Thứ hạng' });
    expect(within(podium).getByText('Vô địch')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Vượt CNV' })).toBeInTheDocument();
    expect(within(table).getByText('8 / 2 / 1')).toBeInTheDocument();
    expect(within(table).getByText('3,1 giây')).toBeInTheDocument();
    expect(screen.getByText('1/2 người sai')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tổ chức trận mới' })).toHaveAttribute(
      'href',
      `/phong/${ROOM_ID}`,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Xem đáp án và giải thích' }));
    const answers = screen.getByRole('region', { name: 'Đáp án và giải thích' });
    expect(within(answers).getByText('B – a√3/2')).toBeInTheDocument();
    expect(within(answers).getByText('Bán kính bằng nửa đường chéo.')).toBeInTheDocument();

    const toggle = screen.getByRole('checkbox', {
      name: 'Cho Player và khán giả xem đáp án, giải thích',
    });
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);
    expect(requests.find((r) => r.path.endsWith('/answers-visibility'))?.body).toEqual({
      answersPublic: false,
    });
    expect(await screen.findByRole('checkbox')).not.toBeChecked();
  });

  it('Super Admin hủy kết quả có lý do; người chơi chưa được xem đáp án', async () => {
    withStoredSession();
    const session = sessionResponse(makeUser({ systemRole: 'super_admin' }));
    let current = result({
      questions: null,
      answersPublic: false,
      viewer: { role: 'staff', seat: null, canToggleAnswers: false, canVoid: true },
    });
    mockApi({
      'POST /auth/refresh': () => jsonResponse(session),
      [`GET /matches/${MATCH_ID}`]: () => jsonResponse(current),
      [`POST /matches/${MATCH_ID}/void`]: ({ body }) => {
        current = {
          ...current,
          outcome: 'voided',
          voided: { at: new Date().toISOString(), reason: (body as { reason: string }).reason },
          players: current.players.map((p) => ({ ...p, winner: false })),
          viewer: { ...current.viewer, canVoid: false },
        };
        return new Response(null, { status: 204 });
      },
    });
    renderApp(`/tran/${MATCH_ID}`);

    expect(await screen.findByText('Host chưa công bố đáp án của trận này.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Tổ chức trận mới' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Hủy kết quả trận' }));
    const dialog = screen.getByRole('dialog', { name: 'Hủy kết quả trận?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Hủy kết quả' }));
    expect(within(dialog).getByText('Cần nhập lý do hủy kết quả.')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Lý do hủy'), 'Gian lận');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Hủy kết quả' }));

    expect(
      await screen.findByRole('heading', { name: 'Kết quả trận đã bị hủy' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Lý do: Gian lận/)).toBeInTheDocument();
  });

  it('trận không tìm thấy (chưa kết thúc / không tham gia) báo rõ', async () => {
    withStoredSession();
    const session = sessionResponse(makeUser());
    mockApi({ 'POST /auth/refresh': () => jsonResponse(session) });
    renderApp(`/tran/${MATCH_ID}`);
    expect(
      await screen.findByRole('heading', { name: 'Không tìm thấy kết quả trận' }),
    ).toBeInTheDocument();
  });
});

describe('Lịch sử trận /lich-su', () => {
  const stats: MyStats = {
    player: {
      matches: 3,
      wins: 1,
      correct: 17,
      answered: 25,
      bySubject: [{ subject: 'Toán', topic: 'Hình học', correct: 17, total: 25 }],
    },
    host: { rooms: 2, matches: 5, players: 17, correct: 68, answered: 100, hardQuestions: [] },
  };
  const history: HistoryList = {
    items: [
      {
        matchId: MATCH_ID,
        roomName: 'CLB Toán – Vòng loại tuần 2',
        startedAt: '2026-11-16T12:30:00.000Z',
        endedAt: '2026-11-16T13:11:00.000Z',
        durationSeconds: 41 * 60,
        players: [
          { seat: 1, displayName: 'Gia Bảo', score: 150 },
          { seat: 2, displayName: 'Phương Vy', score: 205 },
        ],
        winners: [{ seat: 2, displayName: 'Phương Vy', score: 205 }],
        outcome: 'abnormal',
        mySeat: null,
      },
    ],
    page: 1,
    pageSize: 20,
    total: 1,
  };

  it('Host xem trận đã tổ chức kèm thống kê; chuyển sang trận đã tham gia', async () => {
    withStoredSession();
    const session = sessionResponse(makeUser());
    const { requests } = mockApi({
      'POST /auth/refresh': () => jsonResponse(session),
      'GET /matches/stats': () => jsonResponse(stats),
      'GET /matches': () => jsonResponse(history),
    });
    renderApp('/lich-su');

    expect(await screen.findByRole('heading', { name: 'Lịch sử trận' })).toBeInTheDocument();
    expect(await screen.findByText('Trận đã tổ chức', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('68%')).toBeInTheDocument();
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Phương Vy · 205')).toBeInTheDocument();
    expect(within(table).getByText('41 phút')).toBeInTheDocument();
    expect(within(table).getByText('Kết thúc bất thường')).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: 'Xem kết quả' })).toHaveAttribute(
      'href',
      `/tran/${MATCH_ID}`,
    );
    expect(requests.some((r) => r.path.startsWith('/matches?scope=hosted'))).toBe(true);

    await userEvent.click(screen.getByRole('tab', { name: 'Trận đã tham gia' }));
    expect(await screen.findByText('Tỷ lệ đúng theo môn, chủ đề')).toBeInTheDocument();
    expect(screen.getByText('Toán · Hình học')).toBeInTheDocument();
    expect(requests.some((r) => r.path.startsWith('/matches?scope=played'))).toBe(true);
  });
});

describe('Xóa tài khoản (DL-008)', () => {
  it('xác nhận bằng mật khẩu rồi đăng xuất; giữ lại tài khoản bằng liên kết email', async () => {
    withStoredSession();
    const session = sessionResponse(makeUser());
    const { requests } = mockApi({
      'POST /auth/refresh': () => jsonResponse(session),
      'POST /auth/delete-account': () => new Response(null, { status: 204 }),
    });
    renderApp('/tai-khoan');

    await userEvent.click(await screen.findByRole('button', { name: 'Xóa tài khoản' }));
    await userEvent.click(screen.getByRole('button', { name: 'Xác nhận xóa tài khoản' }));
    expect(screen.getByText('Nhập mật khẩu để xác nhận.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Nhập mật khẩu để xác nhận'), 'Mat-khau-123');
    await userEvent.click(screen.getByRole('button', { name: 'Xác nhận xóa tài khoản' }));

    expect(await screen.findByRole('link', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(requests.find((r) => r.path === '/auth/delete-account')?.body).toEqual({
      password: 'Mat-khau-123',
    });
  });

  it('trang giữ lại tài khoản gửi token một lần', async () => {
    const { requests } = mockApi({
      'POST /auth/cancel-deletion': () => new Response(null, { status: 204 }),
    });
    renderApp('/giu-tai-khoan?token=abc123');
    expect(await screen.findByText('Đã hủy yêu cầu xóa tài khoản')).toBeInTheDocument();
    expect(requests.filter((r) => r.path === '/auth/cancel-deletion')).toHaveLength(1);
  });
});

describe('Báo cáo vi phạm /quan-tri/bao-cao', () => {
  it('Manager chọn cách xử lý phù hợp với đối tượng và xác nhận', async () => {
    withStoredSession();
    const session = sessionResponse(makeUser({ systemRole: 'manager' }));
    const open: ReportList = {
      openCount: 1,
      items: [
        {
          id: '00000000-0000-4000-8000-0000000000d1',
          targetType: 'room',
          targetId: ROOM_ID,
          targetLabel: 'Lớp 12A1 – Ôn thi học kỳ',
          subject: {
            kind: 'guest',
            userId: null,
            name: 'tuan_12a2',
            warningCount: null,
            accountStatus: null,
            priorReports: 0,
          },
          category: 'harassment',
          description: 'Khán giả liên tục đổi tên hiển thị thô tục.',
          reporterName: 'Cô Thu Hà',
          status: 'open',
          resolution: null,
          resolutionNote: null,
          resolvedByName: null,
          resolvedAt: null,
          createdAt: new Date().toISOString(),
          actions: ['dismiss', 'remove_content', 'block_guest'],
        },
      ],
    };
    let resolved = false;
    const { requests } = mockApi({
      'POST /auth/refresh': () => jsonResponse(session),
      'GET /admin/organizations': () => jsonResponse({ items: [] }),
      'GET /moderation/question-sets': () => jsonResponse({ items: [] }),
      'GET /moderation/reports': () => jsonResponse(resolved ? { openCount: 0, items: [] } : open),
      [`POST /moderation/reports/${open.items[0]!.id}/resolve`]: () => {
        resolved = true;
        return jsonResponse({
          report: { ...open.items[0]!, status: 'resolved', resolution: 'block_guest', actions: [] },
        });
      },
    });
    renderApp('/quan-tri/bao-cao');

    const detail = await screen.findByRole('region', { name: 'Quấy rối, xúc phạm' });
    expect(within(detail).getByText('Khách “tuan_12a2”')).toBeInTheDocument();
    expect(within(detail).queryByRole('radio', { name: 'Khóa tài khoản' })).not.toBeInTheDocument();
    await userEvent.click(within(detail).getByRole('button', { name: 'Xác nhận xử lý' }));
    expect(within(detail).getByText('Chọn cách xử lý.')).toBeInTheDocument();

    await userEvent.click(within(detail).getByRole('radio', { name: 'Chặn phiên khách' }));
    expect(within(detail).getByText('Cấm khách này vào lại phòng.')).toBeInTheDocument();
    await userEvent.type(within(detail).getByLabelText('Ghi chú xử lý'), 'Đã xác minh.');
    await userEvent.click(within(detail).getByRole('button', { name: 'Xác nhận xử lý' }));

    expect(await screen.findByText('Đã xử lý báo cáo: Chặn phiên khách.')).toBeInTheDocument();
    expect(requests.find((r) => r.path.endsWith('/resolve'))?.body).toEqual({
      action: 'block_guest',
      note: 'Đã xác minh.',
    });
    expect(screen.getByRole('link', { name: 'Báo cáo vi phạm' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cấu hình hệ thống' })).not.toBeInTheDocument();
  });
});
