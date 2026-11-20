import { createServer, type Server } from 'node:http';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import type { RequestHandler } from 'express';

/**
 * Metrics dạng text của Prometheus (P8, DL-053): số phòng, kết nối, độ trễ HTTP, trạng thái tiến
 * trình. Tự viết thay cho thư viện vì chỉ cần counter/gauge/histogram cơ bản. Endpoint chạy trên
 * cổng riêng (`METRICS_PORT`) chỉ mở trong mạng nội bộ Docker, không qua reverse proxy công khai.
 */

type Labels = Record<string, string>;

function labelKey(labels: Labels): string {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([k, v]) => `${k}="${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`,
    )
    .join(',');
}

function line(name: string, labels: string, value: number): string {
  return `${name}${labels ? `{${labels}}` : ''} ${Number.isFinite(value) ? value : 0}`;
}

interface Metric {
  render(): string[];
}

export class Counter implements Metric {
  private readonly values = new Map<string, number>();
  constructor(
    readonly name: string,
    readonly help: string,
  ) {}
  inc(labels: Labels = {}, by = 1): void {
    const key = labelKey(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + by);
  }
  render(): string[] {
    return [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} counter`,
      ...[...this.values].map(([k, v]) => line(this.name, k, v)),
    ];
  }
}

/** Gauge đọc giá trị lúc Prometheus lấy số liệu. */
export class Gauge implements Metric {
  constructor(
    readonly name: string,
    readonly help: string,
    private readonly collect: () => number | Promise<number>,
  ) {}
  private last = 0;
  async refresh(): Promise<void> {
    try {
      this.last = await this.collect();
    } catch {
      // Giữ giá trị cũ khi nguồn tạm lỗi.
    }
  }
  render(): string[] {
    return [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} gauge`,
      line(this.name, '', this.last),
    ];
  }
}

export class Histogram implements Metric {
  private readonly series = new Map<string, { counts: number[]; sum: number; count: number }>();
  constructor(
    readonly name: string,
    readonly help: string,
    private readonly buckets: number[],
  ) {}
  observe(value: number, labels: Labels = {}): void {
    const key = labelKey(labels);
    let s = this.series.get(key);
    if (!s) {
      s = { counts: this.buckets.map(() => 0), sum: 0, count: 0 };
      this.series.set(key, s);
    }
    this.buckets.forEach((b, i) => {
      if (value <= b) s.counts[i]! += 1;
    });
    s.sum += value;
    s.count += 1;
  }
  render(): string[] {
    const out = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    for (const [key, s] of this.series) {
      const sep = key ? `${key},` : '';
      this.buckets.forEach((b, i) =>
        out.push(line(`${this.name}_bucket`, `${sep}le="${b}"`, s.counts[i]!)),
      );
      out.push(line(`${this.name}_bucket`, `${sep}le="+Inf"`, s.count));
      out.push(line(`${this.name}_sum`, key, s.sum));
      out.push(line(`${this.name}_count`, key, s.count));
    }
    return out;
  }
}

export interface MetricsSources {
  /** Số kết nối Socket.IO trên instance này. */
  connections: () => number;
  /** Số phòng đang mở/đang thi (toàn hệ thống). */
  activeRooms: () => Promise<number>;
  /** Số trận đang chạy (toàn hệ thống). */
  runningMatches: () => Promise<number>;
}

export function createMetrics() {
  const eventLoop = monitorEventLoopDelay({ resolution: 20 });
  eventLoop.enable();
  const httpDuration = new Histogram(
    'olympia_http_request_duration_seconds',
    'Thời gian xử lý request REST theo phương thức và mã trạng thái.',
    [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  );
  const realtimeEvents = new Counter(
    'olympia_realtime_events_total',
    'Số sự kiện realtime client gửi lên, theo tên sự kiện.',
  );
  const clientErrors = new Counter(
    'olympia_client_errors_total',
    'Số lỗi giao diện trình duyệt gửi về (giám sát lỗi frontend).',
  );
  const gauges: Gauge[] = [];
  const metrics: Metric[] = [httpDuration, realtimeEvents, clientErrors];

  gauges.push(
    new Gauge(
      'olympia_process_resident_memory_bytes',
      'Bộ nhớ RSS của tiến trình.',
      () => process.memoryUsage().rss,
    ),
    new Gauge(
      'olympia_process_heap_used_bytes',
      'Heap V8 đang dùng.',
      () => process.memoryUsage().heapUsed,
    ),
    new Gauge('olympia_event_loop_delay_p99_seconds', 'Độ trễ event loop p99 (giây).', () => {
      const value = eventLoop.percentile(99) / 1e9;
      eventLoop.reset();
      return value;
    }),
    new Gauge('olympia_process_uptime_seconds', 'Thời gian tiến trình đã chạy.', () =>
      process.uptime(),
    ),
  );

  async function render(): Promise<string> {
    await Promise.all(gauges.map((g) => g.refresh()));
    return [...metrics, ...gauges].flatMap((m) => m.render()).join('\n') + '\n';
  }

  return {
    httpDuration,
    realtimeEvents,
    clientErrors,

    /** Gắn nguồn số liệu nghiệp vụ sau khi các module đã khởi tạo. */
    attach(sources: MetricsSources): void {
      gauges.push(
        new Gauge(
          'olympia_realtime_connections',
          'Kết nối Socket.IO trên instance này.',
          sources.connections,
        ),
        new Gauge('olympia_active_rooms', 'Phòng đang mở hoặc đang thi.', sources.activeRooms),
        new Gauge('olympia_running_matches', 'Trận đang diễn ra.', sources.runningMatches),
      );
    },

    /** Middleware đo thời gian request REST (bỏ qua health check). */
    httpMiddleware(): RequestHandler {
      return (req, res, next) => {
        if (req.path.startsWith('/api/health')) {
          next();
          return;
        }
        const start = process.hrtime.bigint();
        res.on('finish', () => {
          const seconds = Number(process.hrtime.bigint() - start) / 1e9;
          httpDuration.observe(seconds, { method: req.method, status: String(res.statusCode) });
        });
        next();
      };
    },

    render,

    /** Máy chủ `/metrics` riêng; `port = 0` tắt. */
    listen(port: number): Server | null {
      if (port <= 0) return null;
      const server = createServer((req, res) => {
        if (req.url !== '/metrics') {
          res.writeHead(404).end();
          return;
        }
        render()
          .then((body) => {
            res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' });
            res.end(body);
          })
          .catch(() => res.writeHead(500).end());
      });
      server.listen(port);
      return server;
    },
  };
}

export type Metrics = ReturnType<typeof createMetrics>;
