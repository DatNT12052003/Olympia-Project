import express from 'express';
import request from 'supertest';
import { memoryLimiterFactory } from '../../infrastructure/rate-limit/rate-limiter';
import { silentLogger } from '../../test/test-logger';
import { createApiRateLimit } from './api-rate-limit';
import { createErrorHandler } from './error-handler';

function appWith(perMinute: number) {
  const app = express();
  app.use(createApiRateLimit(memoryLimiterFactory, perMinute));
  app.get('/ping', (_req, res) => {
    res.json({ ok: true });
  });
  app.use(createErrorHandler(silentLogger));
  return app;
}

describe('Giới hạn chung request REST', () => {
  it('vượt số request mỗi phút trả 429 kèm Retry-After', async () => {
    const app = appWith(2);
    await request(app).get('/ping').expect(200);
    await request(app).get('/ping').expect(200);
    const res = await request(app).get('/ping');

    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
    expect((res.body as { error: { code: string } }).error.code).toBe('TOO_MANY_REQUESTS');
  });

  it('0 tắt giới hạn', async () => {
    const app = appWith(0);
    for (let i = 0; i < 5; i += 1) await request(app).get('/ping').expect(200);
  });
});
