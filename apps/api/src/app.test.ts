import { apiErrorBodySchema, healthReportSchema } from '@olympia/shared';
import request from 'supertest';
import type { DependencyCheck } from './modules/health/health.service';
import { createTestContext, type TestContext } from './test/test-context';

const contexts: TestContext[] = [];

async function buildApp(checks: Record<string, DependencyCheck> = {}) {
  const ctx = await createTestContext({ healthChecks: checks });
  contexts.push(ctx);
  return ctx.app;
}

afterAll(async () => {
  await Promise.all(contexts.map((ctx) => ctx.close()));
});

const up: DependencyCheck = () => Promise.resolve();
const down: DependencyCheck = () => Promise.reject(new Error('connection refused: secret-host'));

describe('GET /api/health/live', () => {
  it('trả về 200 mà không kiểm tra phụ thuộc', async () => {
    const res = await request(await buildApp({ database: down })).get('/api/health/live');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('GET /api/health/ready', () => {
  it('trả về 200 khi mọi phụ thuộc hoạt động', async () => {
    const res = await request(await buildApp({ database: up, redis: up })).get('/api/health/ready');

    expect(res.status).toBe(200);
    expect(healthReportSchema.parse(res.body)).toEqual({
      status: 'ok',
      checks: { database: 'up', redis: 'up' },
    });
  });

  it('trả về 503 và đánh dấu phụ thuộc lỗi, không lộ chi tiết lỗi', async () => {
    const res = await request(await buildApp({ database: down, redis: up })).get(
      '/api/health/ready',
    );

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'degraded', checks: { database: 'down', redis: 'up' } });
    expect(JSON.stringify(res.body)).not.toContain('secret-host');
  });

  it('coi phụ thuộc quá thời gian là down', async () => {
    const hang: DependencyCheck = () => new Promise(() => undefined);
    const res = await request(await buildApp({ redis: hang })).get('/api/health/ready');

    expect(res.status).toBe(503);
    expect(healthReportSchema.parse(res.body).checks).toEqual({ redis: 'down' });
  });
});

describe('Xử lý lỗi chung', () => {
  it('trả về 404 theo hợp đồng lỗi cho route không tồn tại', async () => {
    const res = await request(await buildApp()).get('/api/khong-ton-tai');

    expect(res.status).toBe(404);
    expect(apiErrorBodySchema.parse(res.body).error.code).toBe('NOT_FOUND');
  });

  it('trả về 400 khi body JSON sai cú pháp', async () => {
    const res = await request(await buildApp())
      .post('/api/health/live')
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    expect(res.status).toBe(400);
    expect(apiErrorBodySchema.parse(res.body).error.code).toBe('BAD_REQUEST');
  });

  it('trả về 413 khi body vượt giới hạn', async () => {
    const res = await request(await buildApp())
      .post('/api/health/live')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ data: 'x'.repeat(200 * 1024) }));

    expect(res.status).toBe(413);
    expect(apiErrorBodySchema.parse(res.body).error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('gắn header bảo mật và không lộ x-powered-by', async () => {
    const res = await request(await buildApp()).get('/api/health/live');

    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('chỉ cho phép CORS từ origin đã cấu hình', async () => {
    const app = await buildApp();
    const allowed = await request(app)
      .get('/api/health/live')
      .set('Origin', 'http://localhost:5173');
    const denied = await request(app).get('/api/health/live').set('Origin', 'https://evil.example');

    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});
