import type { MatchView } from '@olympia/shared';
import { type ChildProcess, spawn } from 'node:child_process';
import { resolve } from 'node:path';
import {
  Api,
  arg,
  type ClientSocket,
  command,
  connect,
  createAccelerationScript,
  emitAck,
  hostEmail,
  joinRoom,
  login,
  seedHosts,
  sleep,
  subscribe,
  waitForMatch,
} from './common';

/**
 * Kiểm thử khôi phục (mục 5 kế hoạch, mục 16 Reliability, DL-013): chạy 2 instance API dùng
 * chung PostgreSQL/Redis, mở trận trên instance A, tắt cứng A (SIGKILL) khi đồng hồ trả lời đang
 * chạy, rồi cho mọi client kết nối lại vào B (như load balancer chuyển hướng). Đạt khi:
 * - mọi client đồng bộ lại được trận với đúng điểm (không mất điểm);
 * - đồng hồ đang chạy vẫn kết thúc trên B và Host điều khiển tiếp được;
 * - tổng thời gian khôi phục ≤ 30 giây.
 *
 * Cách chạy (cần `npm run services:up` và `apps/api/.env`):
 *   npm run load:recovery -w @olympia/api
 */

const apiDir = resolve(__dirname, '../../..');
const portA = Number(arg('port-a', '3201'));
const portB = Number(arg('port-b', '3202'));
const databaseUrl = arg(
  'database-url',
  process.env.DATABASE_URL ?? 'postgres://olympia:olympia@localhost:5440/olympia',
);
const limitMs = Number(arg('limit-ms', '30000'));
const TIMER_SECONDS = 5;

function startInstance(port: number): ChildProcess {
  const child = spawn(
    process.execPath,
    ['--env-file-if-exists=.env', '--conditions=development', '--import', 'tsx', 'src/main.ts'],
    {
      cwd: apiDir,
      env: {
        ...process.env,
        PORT: String(port),
        DATABASE_URL: databaseUrl,
        API_RATE_LIMIT_PER_MINUTE: '0',
        LOG_LEVEL: 'warn',
      },
      stdio: ['ignore', 'inherit', 'inherit'],
    },
  );
  return child;
}

async function waitHealthy(port: number): Promise<void> {
  for (let i = 0; i < 120; i += 1) {
    try {
      const res = await fetch(`http://localhost:${port}/api/health/live`);
      if (res.ok) return;
    } catch {
      // Chưa sẵn sàng.
    }
    await sleep(500);
  }
  throw new Error(`Instance :${port} không khởi động được`);
}

async function sync(socket: ClientSocket, roomId: string): Promise<MatchView> {
  const result = await emitAck<MatchView | null>(socket, 'match:sync', { roomId });
  if (!result.ok || !result.data) throw new Error('match:sync thất bại');
  return result.data;
}

const scoresOf = (view: MatchView) => view.players.map((p) => `${p.seat}:${p.score}`).join(',');

async function main(): Promise<void> {
  const a = startInstance(portA);
  const b = startInstance(portB);
  const stopAll = () => {
    for (const child of [a, b]) if (child.exitCode === null) child.kill('SIGKILL');
  };
  process.on('exit', stopAll);
  try {
    await Promise.all([waitHealthy(portA), waitHealthy(portB)]);
    const urlA = `http://localhost:${portA}`;
    const urlB = `http://localhost:${portB}`;

    await seedHosts(databaseUrl, 1);
    const hostApi = await login(new Api(urlA), hostEmail(0));
    const scriptId = await createAccelerationScript(hostApi, 3, TIMER_SECONDS);
    const { room } = await hostApi.post<{ room: { id: string } }>('/rooms', {
      name: 'Phòng kiểm thử khôi phục',
      maxPlayers: 2,
      visibility: 'private',
      autoApprove: true,
      controlMode: 'manual',
      scriptId,
      open: true,
    });
    const members = [
      await joinRoom(new Api(urlA), room.id, 'Minh Anh', 'player'),
      await joinRoom(new Api(urlA), room.id, 'Bảo Ngọc', 'player'),
    ];
    const tokens = [hostApi.token!, ...members.map((m) => m.token)];
    let sockets = await Promise.all(tokens.map((t) => connect(urlA, t)));
    for (const s of sockets) await subscribe(s, room.id);
    const [host, p1, p2] = sockets as [ClientSocket, ClientSocket, ClientSocket];

    const running = waitForMatch(host, (v) => v.status === 'running');
    await hostApi.post(`/rooms/${room.id}/match`, { skipReady: true });
    await running;

    // Câu 1 trên A: cả hai trả lời, công bố → có điểm.
    await command(host, room.id, { type: 'next_question' });
    await command(host, room.id, { type: 'start_timer' });
    const q1 = (await sync(host, room.id)).round.question!.ref;
    const judging = waitForMatch(host, (v) => v.round.question?.phase === 'judging');
    for (const s of [p1, p2]) {
      await emitAck(s, 'match:answer', {
        roomId: room.id,
        actionId: crypto.randomUUID(),
        questionRef: q1,
        answer: { type: 'true_false', value: s === p1 },
      });
    }
    await judging;
    await command(host, room.id, { type: 'reveal' });
    await sleep(300);
    const before = await sync(host, room.id);
    console.log(`Điểm trước khi tắt A: ${scoresOf(before)}`);

    // Câu 2: bắt đầu đồng hồ rồi tắt cứng A.
    await command(host, room.id, { type: 'next_question' });
    await command(host, room.id, { type: 'start_timer' });
    const killedAt = performance.now();
    a.kill('SIGKILL');
    console.log('Đã tắt cứng instance A giữa lúc đồng hồ trả lời đang chạy.');
    for (const s of sockets) s.disconnect();

    // Client kết nối lại vào B.
    sockets = await Promise.all(tokens.map((t) => connect(urlB, t)));
    for (const s of sockets) await subscribe(s, room.id);
    const views = await Promise.all(sockets.map((s) => sync(s, room.id)));
    const resyncMs = performance.now() - killedAt;
    const scoresKept = views.every((v) => scoresOf(v) === scoresOf(before));
    console.log(`Đồng bộ lại trên B sau ${Math.round(resyncMs)} ms; điểm: ${scoresOf(views[0]!)}`);

    // Đồng hồ của câu 2 phải kết thúc trên B (sweeper nhận trận), rồi Host điều khiển tiếp.
    const hostB = sockets[0]!;
    if (views[0]!.round.question?.phase === 'answering') {
      await waitForMatch(hostB, (v) => v.round.question?.phase !== 'answering', limitMs + 10_000);
    }
    const timerRecoveredMs = performance.now() - killedAt;
    const reveal = await command(hostB, room.id, { type: 'reveal' });
    const controlMs = performance.now() - killedAt;
    const after = await sync(hostB, room.id);

    const result = {
      resyncMs: Math.round(resyncMs),
      timerRecoveredMs: Math.round(timerRecoveredMs),
      controlMs: Math.round(controlMs),
      timerSeconds: TIMER_SECONDS,
      scoresBefore: scoresOf(before),
      scoresAfter: scoresOf(after),
      scoresKept: scoresKept && scoresOf(after) === scoresOf(before),
      hostCommandOk: reveal.ok,
      limitMs,
    };
    // Đồng hồ còn ~TIMER_SECONDS giây khi tắt A: thời gian khôi phục tính phần vượt quá đó.
    const recoveryMs = Math.max(resyncMs, controlMs - TIMER_SECONDS * 1000);
    const passed = result.scoresKept && result.hostCommandOk && recoveryMs <= limitMs;
    console.log(JSON.stringify({ ...result, recoveryMs: Math.round(recoveryMs), passed }, null, 2));
    for (const s of sockets) s.disconnect();
    process.exitCode = passed ? 0 : 1;
  } finally {
    stopAll();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
