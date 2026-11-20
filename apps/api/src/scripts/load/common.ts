import type {
  Ack,
  ClientToServerEvents,
  HostCommand,
  MatchView,
  ServerToClientEvents,
} from '@olympia/shared';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { createDataSource } from '../../infrastructure/database/data-source';
import { createArgon2PasswordHasher } from '../../modules/auth/password-hasher';
import { UserEntity } from '../../modules/users/user.entity';

/**
 * Hàm dùng chung cho công cụ kiểm thử tải và khôi phục (P8, BR-NFR-01). Đi qua đúng REST +
 * Socket.IO như trình duyệt, nên số đo phản ánh độ trễ người dùng thấy (trừ mạng tới client).
 */

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const LOAD_PASSWORD = 'Load-Test-Pass-123';
const CSRF = { 'x-olympia-csrf': '1' };

export function hostEmail(index: number): string {
  return `load-host-${String(index).padStart(4, '0')}@load.olympia.test`;
}

/** Tạo (hoặc làm mới) tài khoản Host đã xác minh cho kiểm thử tải. Cần quyền ghi DB. */
export async function seedHosts(databaseUrl: string, count: number): Promise<void> {
  const dataSource = createDataSource(databaseUrl);
  await dataSource.initialize();
  try {
    const repo = dataSource.getRepository(UserEntity);
    const hasher = await createArgon2PasswordHasher();
    const passwordHash = await hasher.hash(LOAD_PASSWORD);
    for (let i = 0; i < count; i += 1) {
      const email = hostEmail(i);
      const existing = await repo.findOneBy({ email });
      await repo.save(
        repo.create({
          ...(existing ?? {}),
          email,
          passwordHash,
          displayName: `Host tải ${i}`,
          systemRole: 'member',
          emailVerifiedAt: existing?.emailVerifiedAt ?? new Date(),
          canHost: true,
          status: 'active',
          lockedAt: null,
          privacyAcceptedAt: existing?.privacyAcceptedAt ?? new Date(),
        }),
      );
    }
  } finally {
    await dataSource.destroy();
  }
}

export class Api {
  constructor(
    readonly baseUrl: string,
    readonly token: string | null = null,
  ) {}

  withToken(token: string): Api {
    return new Api(this.baseUrl, token);
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}/api${path}`, {
      method,
      headers: {
        ...CSRF,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 200)}`);
    return (text ? JSON.parse(text) : undefined) as T;
  }

  post<T>(path: string, body: unknown = {}): Promise<T> {
    return this.request<T>('POST', path, body);
  }
}

export async function login(api: Api, email: string): Promise<Api> {
  const { accessToken } = await api.post<{ accessToken: string }>('/auth/login', {
    email,
    password: LOAD_PASSWORD,
  });
  return api.withToken(accessToken);
}

/** Kịch bản một vòng Tăng tốc (mọi Player trả lời cùng lúc): bài kiểm tra đồng thời nặng nhất. */
export async function createAccelerationScript(
  host: Api,
  questions: number,
  timeSeconds = 30,
): Promise<string> {
  const ids: string[] = [];
  for (let i = 0; i < questions; i += 1) {
    const { question } = await host.post<{ question: { id: string } }>('/questions', {
      content: `Câu tải ${i + 1}: ${i} + 1 = ${i + 1}?`,
      answer: { type: 'true_false', correct: true },
    });
    ids.push(question.id);
  }
  const { set } = await host.post<{ set: { id: string } }>('/question-sets', {
    name: `Bộ tải ${randomUUID().slice(0, 8)}`,
  });
  await host.post(`/question-sets/${set.id}/items`, { questionIds: ids, round: 'acceleration' });
  const { script } = await host.post<{ script: { id: string } }>('/scripts', {
    name: `Kịch bản tải ${randomUUID().slice(0, 8)}`,
    settings: {
      breakSeconds: 0,
      soundEffects: false,
      allowNegativeScore: false,
      onTurnDisconnect: 'skip',
      tiebreakEnabled: false,
    },
    rounds: [
      {
        type: 'acceleration',
        preset: 'load',
        source: { kind: 'set', setId: set.id },
        rules: {
          questionCount: questions,
          timeSeconds,
          rankPoints: [40, 30, 20, 10],
          allowResubmit: false,
        },
      },
    ],
  });
  return script.id;
}

export interface Member {
  name: string;
  token: string;
  participantId: string;
}

export async function joinRoom(
  api: Api,
  roomId: string,
  name: string,
  role: 'player' | 'spectator',
): Promise<Member> {
  const body = await api.post<{
    participant: { id: string };
    guestSession: { accessToken: string };
  }>(`/rooms/${roomId}/join`, { role, displayName: name });
  return { name, token: body.guestSession.accessToken, participantId: body.participant.id };
}

export async function connect(baseUrl: string, token: string): Promise<ClientSocket> {
  const socket: ClientSocket = io(baseUrl, {
    transports: ['websocket'],
    auth: { token },
    reconnection: true,
    reconnectionDelay: 250,
    reconnectionDelayMax: 1000,
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Kết nối realtime quá thời gian')), 15_000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  return socket;
}

export async function emitAck<T>(
  socket: ClientSocket,
  event: keyof ClientToServerEvents,
  payload: object,
  timeoutMs = 10_000,
): Promise<Ack<T>> {
  const timed = socket.timeout(timeoutMs);
  // Tên sự kiện động: bỏ kiểm tra kiểu theo từng sự kiện của Socket.IO.
  const emit = timed.emitWithAck.bind(timed) as unknown as (
    event: string,
    payload: object,
  ) => Promise<Ack<T>>;
  return emit(event, payload);
}

export async function subscribe(socket: ClientSocket, roomId: string): Promise<void> {
  const result = await emitAck(socket, 'room:subscribe', { roomId });
  if (!result.ok) throw new Error(`room:subscribe: ${result.error.code}`);
}

export async function command(
  socket: ClientSocket,
  roomId: string,
  cmd: HostCommand,
): Promise<Ack> {
  return emitAck(socket, 'match:command', { roomId, actionId: randomUUID(), command: cmd });
}

/**
 * Chờ bản trạng thái trận thỏa điều kiện; trả thời điểm nhận (ms). Promise được gắn sẵn `catch`
 * rỗng để lỗi hết giờ khi chưa ai `await` không làm sập tiến trình (vẫn ném khi được `await`).
 */
export function waitForMatch(
  socket: ClientSocket,
  predicate: (view: MatchView) => boolean,
  timeoutMs = 15_000,
  label = 'trạng thái trận',
): Promise<number> {
  const promise = new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('match:state', handler);
      reject(new Error(`Hết giờ chờ ${label}`));
    }, timeoutMs);
    const handler = (view: MatchView) => {
      if (!predicate(view)) return;
      clearTimeout(timer);
      socket.off('match:state', handler);
      resolve(performance.now());
    };
    socket.on('match:state', handler);
  });
  promise.catch(() => undefined);
  return promise;
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)]!;
}

export function summarize(values: number[]) {
  return {
    count: values.length,
    p50: Math.round(percentile(values, 50)),
    p95: Math.round(percentile(values, 95)),
    p99: Math.round(percentile(values, 99)),
    max: Math.round(values.length ? Math.max(...values) : Number.NaN),
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Đọc tham số dạng `--ten=gia-tri` (hoặc biến môi trường `LOAD_TEN`). */
export function arg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const fromArgv = process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
  const fromEnv = process.env[`LOAD_${name.toUpperCase().replace(/-/g, '_')}`];
  return fromArgv ?? fromEnv ?? fallback;
}
