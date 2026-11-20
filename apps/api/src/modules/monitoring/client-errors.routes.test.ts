import request from 'supertest';
import { createTestContext, type TestContext } from '../../test/test-context';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});

afterAll(async () => {
  await ctx.close();
});

describe('POST /api/client-errors', () => {
  it('nhận báo lỗi giao diện hợp lệ hoặc không, luôn trả 204 (không lộ gì cho client)', async () => {
    await request(ctx.app)
      .post('/api/client-errors')
      .send({ message: 'TypeError: x is undefined', path: '/phong/abc', kind: 'error' })
      .expect(204);
    await request(ctx.app).post('/api/client-errors').send({ nonsense: true }).expect(204);
  });
});
