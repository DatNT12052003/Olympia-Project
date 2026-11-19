import type { QuestionSetDetail, QuestionView, ReviewDetail } from '@olympia/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeUser, mockApi, sessionResponse, withStoredSession } from '../../test/mock-api';
import { jsonResponse, renderApp } from '../../test/render';

const Q1 = '00000000-0000-4000-8000-0000000000d1';
const SET_ID = '00000000-0000-4000-8000-0000000000e1';
const VERSION_ID = '00000000-0000-4000-8000-0000000000f1';
const now = new Date().toISOString();

function question(overrides: Partial<QuestionView> = {}): QuestionView {
  return {
    id: Q1,
    content: 'Hình chóp tứ giác đều có bao nhiêu mặt phẳng đối xứng?',
    answer: { type: 'mcq', options: ['2', '3', '4', '6'], correctIndex: 2 },
    explanation: null,
    media: null,
    subject: 'Toán',
    topic: null,
    grade: 11,
    difficulty: 'medium',
    rounds: ['warmup'],
    defaultPoints: null,
    defaultTimeSeconds: null,
    tags: ['hình chóp'],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function setDetail(overrides: Partial<QuestionSetDetail> = {}): QuestionSetDetail {
  return {
    id: SET_ID,
    name: 'Hình học không gian 11',
    description: null,
    subject: 'Toán',
    grade: 11,
    questionCount: 1,
    roundCounts: { warmup: 1 },
    publication: { approved: null, pending: null, rejected: null },
    updatedAt: now,
    items: [{ round: 'warmup', question: question() }],
    ...overrides,
  };
}

function signIn(systemRole: 'member' | 'manager' = 'member') {
  withStoredSession();
  return sessionResponse(makeUser({ systemRole }));
}

const facets = () => jsonResponse({ subjects: ['Toán'], grades: [11], total: 1 });

describe('Ngân hàng câu hỏi', () => {
  it('liệt kê câu hỏi, lọc theo vòng và ẩn câu đã chọn', async () => {
    const session = signIn();
    const { requests } = mockApi({
      'POST /auth/refresh': () => jsonResponse(session),
      'GET /questions/facets': facets,
      'GET /questions': () =>
        jsonResponse({ items: [question()], page: 1, pageSize: 20, total: 1 }),
      'GET /question-sets': () => jsonResponse({ items: [] }),
      'GET /public-question-sets': () => jsonResponse({ items: [] }),
      'POST /questions/delete': () => jsonResponse({ deleted: 1 }),
    });
    renderApp('/ngan-hang');

    const table = await screen.findByRole('table', { name: 'Câu hỏi trong ngân hàng của bạn' });
    expect(within(table).getByText('Trắc nghiệm')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Của tôi · 1' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await userEvent.selectOptions(screen.getByLabelText('Vòng'), 'finish');
    await waitFor(() =>
      expect(
        requests.some((r) => r.path.startsWith('/questions?') && r.path.includes('round=finish')),
      ).toBe(true),
    );

    await userEvent.click(screen.getByRole('checkbox', { name: /Chọn câu: Hình chóp/ }));
    expect(screen.getByText('Đã chọn 1 câu')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ẩn câu hỏi' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Ẩn câu hỏi' }),
    );

    expect(await screen.findByText('Đã ẩn 1 câu hỏi.')).toBeInTheDocument();
    expect(requests.find((r) => r.path === '/questions/delete')?.body).toEqual({ ids: [Q1] });
  });
});

describe('Soạn câu hỏi', () => {
  it('báo lỗi khi thiếu nội dung, lưu câu trắc nghiệm với đáp án đúng đã chọn', async () => {
    const session = signIn();
    const { requests } = mockApi({
      'POST /auth/refresh': () => jsonResponse(session),
      'GET /questions/facets': facets,
      'POST /questions': () => jsonResponse({ question: question() }, 201),
      'GET /questions': () => jsonResponse({ items: [], page: 1, pageSize: 20, total: 0 }),
      'GET /question-sets': () => jsonResponse({ items: [] }),
      'GET /public-question-sets': () => jsonResponse({ items: [] }),
    });
    const { router } = renderApp('/ngan-hang/cau-hoi/moi');

    await userEvent.click(await screen.findByRole('button', { name: 'Lưu câu hỏi' }));
    expect(await screen.findByLabelText(/Nội dung câu hỏi/)).toHaveAccessibleDescription(
      'Nhập nội dung câu hỏi.',
    );

    await userEvent.type(screen.getByLabelText(/Nội dung câu hỏi/), 'Thủ đô của Việt Nam?');
    for (const [key, text] of [
      ['A', 'Huế'],
      ['B', 'Hà Nội'],
      ['C', 'Đà Nẵng'],
      ['D', 'Sài Gòn'],
    ] as const) {
      await userEvent.type(screen.getByLabelText(`Phương án ${key}`), text);
    }
    await userEvent.click(screen.getByLabelText('Phương án B là đáp án đúng'));
    await userEvent.click(screen.getByLabelText('Tăng tốc'));
    await userEvent.click(screen.getByRole('button', { name: 'Lưu câu hỏi' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/ngan-hang'));
    expect(
      requests.find((r) => r.method === 'POST' && r.path === '/questions')?.body,
    ).toMatchObject({
      content: 'Thủ đô của Việt Nam?',
      answer: { type: 'mcq', options: ['Huế', 'Hà Nội', 'Đà Nẵng', 'Sài Gòn'], correctIndex: 1 },
      rounds: ['acceleration'],
    });
  });

  it('thử so khớp câu trả lời ngắn theo BR-QB-01', async () => {
    const session = signIn();
    mockApi({ 'POST /auth/refresh': () => jsonResponse(session), 'GET /questions/facets': facets });
    renderApp('/ngan-hang/cau-hoi/moi');

    await userEvent.click(await screen.findByRole('radio', { name: 'Trả lời ngắn' }));
    await userEvent.type(screen.getByLabelText('Đáp án chuẩn *'), 'Hà Nội');
    const tester = screen.getByLabelText('Thử câu trả lời của người chơi');
    await userEvent.type(tester, '  hà   NỘI ');
    expect(screen.getByText('✓ Khớp đáp án')).toBeInTheDocument();

    await userEvent.clear(tester);
    await userEvent.type(tester, 'ha noi');
    expect(screen.getByText('Không khớp – chờ Host xác nhận')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/Chấp nhận câu trả lời không dấu/));
    expect(screen.getByText('✓ Khớp đáp án')).toBeInTheDocument();
  });
});

describe('Bộ đề', () => {
  it('gửi bộ đề cho Manager duyệt', async () => {
    const session = signIn();
    const { requests } = mockApi({
      'POST /auth/refresh': () => jsonResponse(session),
      [`GET /question-sets/${SET_ID}`]: () => jsonResponse({ set: setDetail() }),
      [`POST /question-sets/${SET_ID}/publish`]: () =>
        jsonResponse({
          set: setDetail({
            publication: {
              approved: null,
              pending: { versionId: VERSION_ID, versionNo: 1, submittedAt: now },
              rejected: null,
            },
          }),
        }),
      'GET /question-sets': () => jsonResponse({ items: [] }),
    });
    renderApp(`/ngan-hang/bo-de/${SET_ID}`);

    expect(
      await screen.findByRole('heading', { name: 'Hình học không gian 11' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Khởi động/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Chia sẻ public' }));

    expect(await screen.findByText('Đã gửi bộ đề cho Manager duyệt.')).toBeInTheDocument();
    expect(screen.getByText(/đang chờ Manager duyệt/)).toBeInTheDocument();
    expect(requests.some((r) => r.path === `/question-sets/${SET_ID}/publish`)).toBe(true);
  });
});

describe('Duyệt bộ câu hỏi public', () => {
  const review: ReviewDetail = {
    versionId: VERSION_ID,
    setId: SET_ID,
    versionNo: 2,
    name: 'Hình học không gian 11',
    ownerName: 'Cô Thu Hà',
    questionCount: 1,
    kind: 'update',
    submittedAt: now,
    description: null,
    subject: 'Toán',
    grade: 11,
    status: 'pending',
    approvedVersionNo: 1,
    mediaCount: 0,
    changes: [
      {
        kind: 'changed',
        question: { ...question(), sourceQuestionId: Q1 },
      },
    ],
    items: [{ round: 'warmup', question: { ...question(), sourceQuestionId: Q1 } }],
  };

  it('Manager thấy hàng đợi, phải nhập lý do khi từ chối, duyệt được', async () => {
    const session = signIn('manager');
    let approved = false;
    const { requests } = mockApi({
      'POST /auth/refresh': () => jsonResponse(session),
      'GET /admin/organizations': () => jsonResponse({ items: [] }),
      // Sau khi duyệt, hàng đợi rỗng (panel chi tiết bị gỡ khỏi màn hình).
      'GET /moderation/question-sets': () =>
        jsonResponse({
          items: approved
            ? []
            : [
                {
                  versionId: VERSION_ID,
                  setId: SET_ID,
                  versionNo: 2,
                  name: review.name,
                  ownerName: review.ownerName,
                  questionCount: 1,
                  kind: 'update',
                  submittedAt: now,
                },
              ],
        }),
      [`GET /moderation/question-sets/${VERSION_ID}`]: () => jsonResponse({ version: review }),
      [`POST /moderation/question-sets/${VERSION_ID}/approve`]: () => {
        approved = true;
        return new Response(null, { status: 204 });
      },
    });
    renderApp('/quan-tri/duyet-noi-dung');

    expect(
      await screen.findByRole('heading', { name: 'Hình học không gian 11' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('1 bộ chờ duyệt')).toBeInTheDocument();
    expect(screen.getByText('Câu thay đổi so với bản 1')).toBeInTheDocument();
    expect(screen.getByText('Sửa')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Từ chối' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Lý do tối thiểu 5 ký tự.');

    await userEvent.click(screen.getByRole('button', { name: 'Duyệt và công khai' }));
    expect(await screen.findByText(/Đã duyệt “Hình học không gian 11”/)).toBeInTheDocument();
    expect(requests.some((r) => r.path === `/moderation/question-sets/${VERSION_ID}/approve`)).toBe(
      true,
    );
  });
});
