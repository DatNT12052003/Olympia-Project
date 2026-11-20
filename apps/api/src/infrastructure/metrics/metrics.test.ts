import express from 'express';
import request from 'supertest';
import { createMetrics } from './metrics';

describe('Metrics Prometheus (DL-053)', () => {
  it('xuất counter, histogram request REST và gauge nghiệp vụ theo định dạng text', async () => {
    const metrics = createMetrics();
    metrics.attach({
      connections: () => 42,
      activeRooms: () => Promise.resolve(7),
      runningMatches: () => Promise.reject(new Error('DB tạm lỗi')),
    });
    const app = express();
    app.use(metrics.httpMiddleware());
    app.get('/api/rooms', (_req, res) => {
      res.json([]);
    });
    app.get('/api/health/live', (_req, res) => {
      res.json({});
    });
    await request(app).get('/api/rooms').expect(200);
    await request(app).get('/api/health/live').expect(200);
    metrics.clientErrors.inc({ kind: 'error' });

    const text = await metrics.render();

    expect(text).toContain(
      'olympia_http_request_duration_seconds_count{method="GET",status="200"} 1',
    );
    expect(text).toContain(
      'olympia_http_request_duration_seconds_bucket{method="GET",status="200",le="+Inf"} 1',
    );
    expect(text).toContain('olympia_realtime_connections 42');
    expect(text).toContain('olympia_active_rooms 7');
    // Nguồn lỗi không làm hỏng toàn bộ trang metrics.
    expect(text).toContain('olympia_running_matches 0');
    expect(text).toContain('olympia_client_errors_total{kind="error"} 1');
    expect(text).toMatch(/# TYPE olympia_process_resident_memory_bytes gauge/);
  });
});
