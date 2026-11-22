import {
  apiErrorBodySchema,
  matchShortAnswer,
  type QuestionInput,
  questionListSchema,
  questionSetDetailSchema,
  questionViewSchema,
  publicSetDetailSchema,
  publicSetListSchema,
  reviewDetailSchema,
  reviewQueueSchema,
} from '@olympia/shared';
import request from 'supertest';
import { AdminAuditLogEntity } from '../audit/admin-audit-log.entity';
import { createTestContext, createUserAndLogin, type TestContext } from '../../test/test-context';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

/** Body phản hồi; từng trường được kiểm bằng schema dùng chung khi cần. */
interface ApiResponse {
  status: number;
  body: {
    set?: unknown;
    question?: unknown;
    media?: unknown;
    version?: unknown;
    added?: number;
    setId?: string;
    [key: string]: unknown;
  };
}

const typed = (test: request.Test) => test.then((res) => res as unknown as ApiResponse);

const as = (auth: string) => ({
  get: (path: string) => typed(request(ctx.app).get(path).set('Authorization', auth)),
  post: (path: string, body: object = {}) =>
    typed(request(ctx.app).post(path).set('Authorization', auth).send(body)),
  put: (path: string, body: object) =>
    typed(request(ctx.app).put(path).set('Authorization', auth).send(body)),
  delete: (path: string) => typed(request(ctx.app).delete(path).set('Authorization', auth)),
});

async function host(options: Parameters<typeof createUserAndLogin>[1] = {}) {
  const { user, accessToken } = await createUserAndLogin(ctx, options);
  return { user, api: as(`Bearer ${accessToken}`) };
}

function code(body: unknown): string {
  return apiErrorBodySchema.parse(body).error.code;
}

const mcq: QuestionInput = {
  content: 'Hình chóp tứ giác đều có bao nhiêu mặt phẳng đối xứng?',
  answer: { type: 'mcq', options: ['2', '3', '4', '6'], correctIndex: 2 },
  subject: 'Toán',
  grade: 11,
  difficulty: 'medium',
  rounds: ['warmup', 'finish'],
  tags: ['Hình chóp', 'đối xứng'],
};

async function createQuestion(api: ReturnType<typeof as>, input: QuestionInput = mcq) {
  const res = await api.post('/api/questions', input);
  expect(res.status).toBe(201);
  return questionViewSchema.parse((res.body as { question: unknown }).question);
}

describe('So khớp câu trả lời ngắn (BR-QB-01)', () => {
  const answer = { answer: 'Mặt cầu', acceptedAnswers: ['hình cầu'], ignoreDiacritics: false };

  it('bỏ khoảng trắng thừa, không phân biệt hoa/thường, chấp nhận đáp án tương đương', () => {
    expect(matchShortAnswer('  mặt   CẦU ', answer)).toBe(true);
    expect(matchShortAnswer('Hình Cầu', answer)).toBe(true);
    expect(matchShortAnswer('mat cau', answer)).toBe(false);
    expect(matchShortAnswer('', answer)).toBe(false);
  });

  it('tùy chọn bỏ dấu tiếng Việt, kể cả đ', () => {
    expect(matchShortAnswer('mat cau', { ...answer, ignoreDiacritics: true })).toBe(true);
    expect(
      matchShortAnswer('dong ho', {
        answer: 'Đồng hồ',
        acceptedAnswers: [],
        ignoreDiacritics: true,
      }),
    ).toBe(true);
  });
});

describe('Ngân hàng câu hỏi (5.1, 5.2)', () => {
  it('chỉ tài khoản có quyền Host mới dùng được', async () => {
    const anonymous = await request(ctx.app).get('/api/questions');
    const unverified = await host({ emailVerified: false });
    const revoked = await host({ canHost: false });

    expect(anonymous.status).toBe(401);
    expect((await unverified.api.get('/api/questions')).status).toBe(403);
    expect((await revoked.api.get('/api/questions')).status).toBe(403);
  });

  it('tạo đủ ba dạng đáp án và kiểm tra dữ liệu theo dạng', async () => {
    const { api } = await host();

    const created = await createQuestion(api);
    const tf = await createQuestion(api, {
      content: 'Đường thẳng vuông góc với hai đường cắt nhau thì vuông góc với mặt phẳng.',
      answer: { type: 'true_false', correct: true },
    });
    const short = await createQuestion(api, {
      content: 'Tập hợp điểm cách đều một điểm cố định trong không gian?',
      answer: { type: 'short_answer', answer: 'Mặt cầu', acceptedAnswers: ['hình cầu'] },
    });
    const badIndex = await api.post('/api/questions', {
      ...mcq,
      answer: { type: 'mcq', options: ['A', 'B'], correctIndex: 2 },
    });
    const tooFewOptions = await api.post('/api/questions', {
      ...mcq,
      answer: { type: 'mcq', options: ['A'], correctIndex: 0 },
    });
    const empty = await api.post('/api/questions', { ...mcq, content: '   ' });

    expect(created).toMatchObject({
      subject: 'Toán',
      grade: 11,
      rounds: ['warmup', 'finish'],
      tags: ['hình chóp', 'đối xứng'],
      media: null,
    });
    expect(tf.answer).toEqual({ type: 'true_false', correct: true });
    expect(short.answer).toEqual({
      type: 'short_answer',
      answer: 'Mặt cầu',
      acceptedAnswers: ['hình cầu'],
      ignoreDiacritics: false,
    });
    for (const res of [badIndex, tooFewOptions, empty]) {
      expect(res.status).toBe(400);
      expect(code(res.body)).toBe('VALIDATION_ERROR');
    }
  });

  it('lọc theo môn/lớp/độ khó/vòng/dạng, tìm kiếm không dấu và gợi ý bộ lọc', async () => {
    const { api } = await host();
    await createQuestion(api);
    await createQuestion(api, {
      content: 'Thủ đô của Việt Nam là gì?',
      answer: { type: 'short_answer', answer: 'Hà Nội' },
      subject: 'Địa lý',
      grade: 9,
      difficulty: 'easy',
      rounds: ['acceleration'],
    });

    const list = async (query: string) =>
      questionListSchema.parse((await api.get(`/api/questions?${query}`)).body);

    expect((await list('')).total).toBe(2);
    expect((await list('q=thu%20do')).items.map((q) => q.subject)).toEqual(['Địa lý']);
    expect((await list('q=ha%20noi')).total).toBe(1);
    expect((await list('subject=to%C3%A1n')).total).toBe(1);
    expect((await list('grade=9&difficulty=easy')).total).toBe(1);
    expect((await list('round=finish')).total).toBe(1);
    expect((await list('answerType=mcq')).total).toBe(1);
    expect((await list('tag=%C4%91%E1%BB%91i%20x%E1%BB%A9ng')).total).toBe(1);
    expect((await list('media=none')).total).toBe(2);

    const facets = (await api.get('/api/questions/facets')).body as {
      subjects: string[];
      grades: number[];
    };
    expect(facets).toMatchObject({ subjects: ['Địa lý', 'Toán'], grades: [9, 11], total: 2 });
  });

  it('Host chỉ thấy và sửa câu hỏi của mình; ẩn câu hỏi là xóa mềm (BR-QB-03)', async () => {
    const owner = await host();
    const other = await host();
    const question = await createQuestion(owner.api);

    expect((await other.api.get(`/api/questions/${question.id}`)).status).toBe(404);
    expect((await other.api.put(`/api/questions/${question.id}`, mcq)).status).toBe(404);
    expect((await other.api.post('/api/questions/delete', { ids: [question.id] })).body).toEqual({
      deleted: 0,
    });

    const updated = await owner.api.put(`/api/questions/${question.id}`, {
      ...mcq,
      content: 'Câu hỏi đã sửa',
    });
    expect(updated.status).toBe(200);
    expect(questionViewSchema.parse(updated.body.question).content).toBe('Câu hỏi đã sửa');

    const deleted = await owner.api.post('/api/questions/delete', { ids: [question.id] });
    expect(deleted.body).toEqual({ deleted: 1 });
    expect((await owner.api.get(`/api/questions/${question.id}`)).status).toBe(404);
    expect(questionListSchema.parse((await owner.api.get('/api/questions')).body).total).toBe(0);
  });
});

describe('Media câu hỏi (BR-QB-02)', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

  async function upload(api: ReturnType<typeof as>, contentType = 'image/png', size = png.length) {
    const res = await api.post('/api/media/uploads', {
      fileName: 'hinh.png',
      contentType,
      sizeBytes: size,
    });
    return res;
  }

  function keyOf(uploadUrl: string): string {
    return decodeURIComponent(uploadUrl.split('/upload/')[1]!);
  }

  it('từ chối định dạng không hỗ trợ và tệp quá dung lượng', async () => {
    const { api } = await host();
    const gif = await upload(api, 'image/gif');
    const big = await upload(api, 'image/png', 5 * 1024 * 1024 + 1);

    expect(gif.status).toBe(400);
    expect(code(gif.body)).toBe('MEDIA_TYPE_NOT_ALLOWED');
    expect(big.status).toBe(413);
    expect(code(big.body)).toBe('MEDIA_TOO_LARGE');
  });

  it('kiểm tra tệp sau khi upload: sai chữ ký định dạng thì xóa tệp', async () => {
    const { api } = await host();
    const res = await upload(api);
    const { mediaId, uploadUrl } = res.body as { mediaId: string; uploadUrl: string };

    const notUploaded = await api.post(`/api/media/${mediaId}/complete`);
    expect(code(notUploaded.body)).toBe('MEDIA_NOT_READY');

    ctx.storage.put(
      keyOf(uploadUrl),
      new TextEncoder().encode('<html>not a png</html>'),
      'image/png',
    );
    const fake = await api.post(`/api/media/${mediaId}/complete`);
    expect(fake.status).toBe(400);
    expect(code(fake.body)).toBe('MEDIA_INVALID');
    expect(ctx.storage.has(keyOf(uploadUrl))).toBe(false);
  });

  it('gắn ảnh đã upload vào câu hỏi; không dùng được media của người khác', async () => {
    const owner = await host();
    const other = await host();
    const res = await upload(owner.api);
    const { mediaId, uploadUrl } = res.body as { mediaId: string; uploadUrl: string };
    ctx.storage.put(keyOf(uploadUrl), png, 'image/png');

    const completed = await owner.api.post(`/api/media/${mediaId}/complete`);
    expect(completed.status).toBe(200);
    expect(completed.body.media).toMatchObject({
      id: mediaId,
      kind: 'image',
      sizeBytes: png.length,
    });

    const question = await createQuestion(owner.api, { ...mcq, mediaId });
    expect(question.media).toMatchObject({ id: mediaId, kind: 'image' });
    expect(question.media?.url).toContain('http://storage.test/');

    const stolen = await other.api.post('/api/questions', { ...mcq, mediaId });
    expect(stolen.status).toBe(400);
    expect(code(stolen.body)).toBe('MEDIA_INVALID');
  });
});

describe('Bộ đề (5.3)', () => {
  it('thêm câu hỏi của mình, xếp theo vòng, chọn ngẫu nhiên theo tiêu chí', async () => {
    const { api } = await host();
    const other = await host();
    const a = await createQuestion(api);
    const b = await createQuestion(api, { ...mcq, content: 'Câu B', rounds: ['acceleration'] });
    const c = await createQuestion(api, {
      ...mcq,
      content: 'Câu C',
      rounds: ['acceleration'],
      difficulty: 'hard',
    });
    const foreign = await createQuestion(other.api);

    const created = await api.post('/api/question-sets', {
      name: 'Toán 11 – Bộ 1',
      subject: 'Toán',
    });
    expect(created.status).toBe(201);
    const set = questionSetDetailSchema.parse(created.body.set);

    const append = await api.post(`/api/question-sets/${set.id}/items`, {
      questionIds: [a.id],
      round: 'warmup',
    });
    expect(append.body.added).toBe(1);
    const rejected = await api.post(`/api/question-sets/${set.id}/items`, {
      questionIds: [foreign.id],
    });
    expect(rejected.status).toBe(400);

    const random = await api.post(`/api/question-sets/${set.id}/random`, {
      count: 5,
      round: 'acceleration',
      difficulty: 'hard',
    });
    expect(random.body.added).toBe(1);
    const afterRandom = questionSetDetailSchema.parse(random.body.set);
    expect(afterRandom.items.map((i) => [i.question.id, i.round])).toEqual([
      [a.id, 'warmup'],
      [c.id, 'acceleration'],
    ]);
    expect(afterRandom.roundCounts).toEqual({ warmup: 1, acceleration: 1 });

    // Câu B (trắc nghiệm) còn khớp vòng nhưng bị loại theo dạng câu.
    const byType = await api.post(`/api/question-sets/${set.id}/random`, {
      count: 5,
      round: 'acceleration',
      answerType: 'true_false',
    });
    expect(byType.body.added).toBe(0);

    const replaced = await api.put(`/api/question-sets/${set.id}/items`, {
      items: [
        { questionId: b.id, round: 'acceleration' },
        { questionId: a.id, round: null },
      ],
    });
    const detail = questionSetDetailSchema.parse(replaced.body.set);
    expect(detail.items.map((i) => [i.question.id, i.round])).toEqual([
      [b.id, 'acceleration'],
      [a.id, null],
    ]);

    // Câu hỏi bị ẩn thì rời khỏi bộ đề đang soạn.
    await api.post('/api/questions/delete', { ids: [b.id] });
    const afterDelete = questionSetDetailSchema.parse(
      (await api.get(`/api/question-sets/${set.id}`)).body.set,
    );
    expect(afterDelete.questionCount).toBe(1);
    expect((await other.api.get(`/api/question-sets/${set.id}`)).status).toBe(404);
  });
});

describe('Chia sẻ public và kiểm duyệt (5.4)', () => {
  it('luồng đầy đủ: chờ duyệt → từ chối → gửi lại → duyệt → sao chép → phiên bản mới', async () => {
    const owner = await host({ displayName: 'Cô Thu Hà' });
    const otherHost = await host();
    const manager = await host({ systemRole: 'manager' });

    const q1 = await createQuestion(owner.api);
    const q2 = await createQuestion(owner.api, {
      content: 'Thủ đô của Việt Nam?',
      answer: { type: 'short_answer', answer: 'Hà Nội' },
    });
    const set = questionSetDetailSchema.parse(
      (await owner.api.post('/api/question-sets', { name: 'Hình học không gian 11' })).body.set,
    );

    const empty = await owner.api.post(`/api/question-sets/${set.id}/publish`);
    expect(empty.status).toBe(409);
    expect(code(empty.body)).toBe('QUESTION_SET_EMPTY');

    await owner.api.post(`/api/question-sets/${set.id}/items`, { questionIds: [q1.id, q2.id] });
    const submitted = questionSetDetailSchema.parse(
      (await owner.api.post(`/api/question-sets/${set.id}/publish`)).body.set,
    );
    expect(submitted.publication.pending?.versionNo).toBe(1);

    // Chưa duyệt thì Host khác không thấy (5.4 bước 1); Host không vào được kiểm duyệt.
    const publicList = async () =>
      publicSetListSchema.parse((await otherHost.api.get('/api/public-question-sets')).body).items;
    expect((await publicList()).some((s) => s.setId === set.id)).toBe(false);
    expect((await otherHost.api.get('/api/moderation/question-sets')).status).toBe(403);

    const queue = reviewQueueSchema.parse(
      (await manager.api.get('/api/moderation/question-sets')).body,
    );
    const queued = queue.items.find((i) => i.setId === set.id)!;
    expect(queued).toMatchObject({ kind: 'new', questionCount: 2, ownerName: 'Cô Thu Hà' });

    const noReason = await manager.api.post(
      `/api/moderation/question-sets/${queued.versionId}/reject`,
      {
        reason: '',
      },
    );
    expect(noReason.status).toBe(400);
    await manager.api.post(`/api/moderation/question-sets/${queued.versionId}/reject`, {
      reason: 'Câu 2 thiếu đáp án tương đương.',
    });
    const afterReject = questionSetDetailSchema.parse(
      (await owner.api.get(`/api/question-sets/${set.id}`)).body.set,
    );
    expect(afterReject.publication).toMatchObject({
      pending: null,
      approved: null,
      rejected: { versionNo: 1, reason: 'Câu 2 thiếu đáp án tương đương.' },
    });

    // Gửi lại → duyệt → public.
    const v2 = questionSetDetailSchema.parse(
      (await owner.api.post(`/api/question-sets/${set.id}/publish`)).body.set,
    ).publication.pending!;
    expect(v2.versionNo).toBe(2);
    expect(
      (await manager.api.post(`/api/moderation/question-sets/${v2.versionId}/approve`)).status,
    ).toBe(204);
    expect(
      (await manager.api.post(`/api/moderation/question-sets/${v2.versionId}/approve`)).status,
    ).toBe(409);

    const listed = (await publicList()).find((s) => s.setId === set.id)!;
    expect(listed).toMatchObject({ versionNo: 2, questionCount: 2, mine: false });
    const publicDetail = publicSetDetailSchema.parse(
      (await otherHost.api.get(`/api/public-question-sets/${listed.versionId}`)).body.set,
    );
    expect(publicDetail.items[0]!.question.answer).toEqual(q1.answer);

    // Sao chép: bản sao thuộc Host sao chép, độc lập với bản gốc (BR-QB-05).
    const copy = await otherHost.api.post(`/api/public-question-sets/${listed.versionId}/copy`);
    expect(copy.status).toBe(201);
    const copied = questionSetDetailSchema.parse(
      (await otherHost.api.get(`/api/question-sets/${copy.body.setId}`)).body.set,
    );
    expect(copied.items.map((i) => i.question.content)).toEqual([q1.content, q2.content]);
    expect(copied.items[0]!.question.id).not.toBe(q1.id);

    // Chủ sở hữu sửa câu hỏi và gửi bản mới: bản cũ vẫn public tới khi duyệt (BR-QB-09).
    await owner.api.put(`/api/questions/${q1.id}`, { ...mcq, content: 'Nội dung đã sửa' });
    const v3 = questionSetDetailSchema.parse(
      (await owner.api.post(`/api/question-sets/${set.id}/publish`)).body.set,
    ).publication;
    expect(v3).toMatchObject({ approved: { versionNo: 2 }, pending: { versionNo: 3 } });
    expect((await publicList()).find((s) => s.setId === set.id)?.versionNo).toBe(2);

    const review = reviewDetailSchema.parse(
      (await manager.api.get(`/api/moderation/question-sets/${v3.pending!.versionId}`)).body
        .version,
    );
    expect(review).toMatchObject({ kind: 'update', approvedVersionNo: 2 });
    expect(review.changes.map((c) => [c.kind, c.question.content])).toEqual([
      ['changed', 'Nội dung đã sửa'],
    ]);
    // Bản sao không bị ảnh hưởng.
    const copyAgain = questionSetDetailSchema.parse(
      (await otherHost.api.get(`/api/question-sets/${copy.body.setId}`)).body.set,
    );
    expect(copyAgain.items[0]!.question.content).toBe(q1.content);

    await manager.api.post(`/api/moderation/question-sets/${v3.pending!.versionId}/approve`);
    expect((await publicList()).find((s) => s.setId === set.id)?.versionNo).toBe(3);
    expect((await otherHost.api.get(`/api/public-question-sets/${listed.versionId}`)).status).toBe(
      404,
    );

    const audits = await ctx.dataSource.getRepository(AdminAuditLogEntity).findBy({
      actorUserId: manager.user.id,
    });
    expect(audits.map((a) => a.action).sort()).toEqual([
      'question_set.approve',
      'question_set.approve',
      'question_set.reject',
    ]);

    // Gỡ public.
    await owner.api.post(`/api/question-sets/${set.id}/unpublish`);
    expect((await publicList()).some((s) => s.setId === set.id)).toBe(false);
  });

  it('Host khác không sửa/xóa được bộ đề public của người khác (BR-QB-06)', async () => {
    const owner = await host();
    const other = await host();
    const set = questionSetDetailSchema.parse(
      (await owner.api.post('/api/question-sets', { name: 'Bộ của chủ' })).body.set,
    );

    expect((await other.api.put(`/api/question-sets/${set.id}`, { name: 'Đổi tên' })).status).toBe(
      404,
    );
    expect((await other.api.delete(`/api/question-sets/${set.id}`)).status).toBe(404);
    expect((await other.api.post(`/api/question-sets/${set.id}/publish`)).status).toBe(404);
  });
});
