import type { MatchView } from '@olympia/shared';
import { writeFileSync } from 'node:fs';
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
  summarize,
  waitForMatch,
} from './common';

/**
 * Kiểm thử tải (mục 16, BR-NFR-01, DL-052): mở nhiều phòng song song, mỗi phòng 1 Host + Player
 * (khách) + khán giả, chơi vòng Tăng tốc ở chế độ thủ công. Đo:
 * - `sync`: từ lúc Host gửi lệnh tới lúc từng người trong phòng nhận trạng thái mới (chỉ tiêu
 *   ≤ 300 ms p95);
 * - `answer`: thời gian ack câu trả lời khi mọi Player gửi cùng lúc;
 * - lỗi kết nối/lệnh. Không đo video (LiveKit, chỉ tiêu riêng).
 *
 * Ví dụ (local, API ở :3000, cần `API_RATE_LIMIT_PER_MINUTE=0` trên API đích):
 *   npm run load:test -w @olympia/api -- --rooms=20 --spectators=6 --questions=5 \
 *     --database-url=postgres://olympia:olympia@localhost:5440/olympia
 */

const target = arg('target', 'http://localhost:3000');
const rooms = Number(arg('rooms', '10'));
const playersPerRoom = Number(arg('players', '4'));
const spectatorsPerRoom = Number(arg('spectators', '4'));
const questions = Math.min(20, Number(arg('questions', '5')));
const roomsPerHost = Number(arg('rooms-per-host', '5'));
const databaseUrl = arg('database-url', '');
const output = arg('output', 'load-test-result.json');
const syncTargetMs = Number(arg('sync-target-ms', '300'));

const syncLatencies: number[] = [];
const answerLatencies: number[] = [];
const subscribeLatencies: number[] = [];
const errors: Record<string, number> = {};
let connections = 0;

function recordError(kind: string, error: unknown): void {
  errors[kind] = (errors[kind] ?? 0) + 1;
  if ((errors[kind] ?? 0) <= 3)
    console.warn(`[${kind}]`, error instanceof Error ? error.message : error);
}

async function timedSubscribe(socket: ClientSocket, roomId: string): Promise<void> {
  const start = performance.now();
  await subscribe(socket, roomId);
  subscribeLatencies.push(performance.now() - start);
}

/** Gửi lệnh Host và đo thời gian tới khi mọi socket trong phòng nhận bản thỏa `predicate`. */
async function broadcastLatency(
  host: ClientSocket,
  audience: ClientSocket[],
  roomId: string,
  cmd: Parameters<typeof command>[2],
  predicate: (view: MatchView) => boolean,
): Promise<void> {
  const waits = audience.map((socket) =>
    waitForMatch(socket, predicate, 15_000, `trạng thái sau lệnh ${cmd.type}`),
  );
  const start = performance.now();
  const ack = await command(host, roomId, cmd);
  if (!ack.ok) throw new Error(`${cmd.type}: ${ack.error.code}`);
  const received = await Promise.allSettled(waits);
  for (const r of received) {
    if (r.status === 'fulfilled') syncLatencies.push(r.value - start);
    else recordError('sync-timeout', r.reason);
  }
}

async function runRoom(hostApi: Api, scriptId: string, index: number): Promise<void> {
  const { room } = await hostApi.post<{ room: { id: string } }>('/rooms', {
    name: `Phòng tải ${index}`,
    maxPlayers: playersPerRoom,
    visibility: 'private',
    autoApprove: true,
    controlMode: 'manual',
    allowSpectators: true,
    maxSpectators: Math.max(spectatorsPerRoom, 1),
    scriptId,
    open: true,
  });
  const anon = new Api(target);
  const hostSocket = await connect(target, hostApi.token!);
  connections += 1;
  await timedSubscribe(hostSocket, room.id);

  const players: ClientSocket[] = [];
  const spectators: ClientSocket[] = [];
  const joins = [
    ...Array.from({ length: playersPerRoom }, (_, i) => ['player', `Người chơi ${i + 1}`] as const),
    ...Array.from(
      { length: spectatorsPerRoom },
      (_, i) => ['spectator', `Khán giả ${i + 1}`] as const,
    ),
  ];
  for (const [n, [role, name]] of joins.entries()) {
    // Giới hạn chống lấp phòng: 15 lượt vào/phút/IP/phòng.
    if (n > 0 && n % 15 === 0) await sleep(61_000);
    const member = await joinRoom(anon, room.id, name, role);
    const socket = await connect(target, member.token);
    connections += 1;
    await timedSubscribe(socket, room.id);
    (role === 'player' ? players : spectators).push(socket);
  }
  const everyone = [hostSocket, ...players, ...spectators];

  const started = Promise.all(
    everyone.map((s) => waitForMatch(s, (v) => v.status === 'running', 15_000, 'trận bắt đầu')),
  );
  await hostApi.post(`/rooms/${room.id}/match`, { skipReady: true });
  await started;

  for (let q = 0; q < questions; q += 1) {
    let ref = '';
    await broadcastLatency(hostSocket, everyone, room.id, { type: 'next_question' }, (v) => {
      const question = v.round.question;
      if (!question || question.phase !== 'showing') return false;
      ref = question.ref;
      return true;
    });
    await broadcastLatency(
      hostSocket,
      everyone,
      room.id,
      { type: 'start_timer' },
      (v) => v.round.question?.phase === 'answering',
    );
    // Mọi Player trả lời cùng lúc (Tăng tốc): không mất, không trùng (mục 16 Concurrency).
    const judging = waitForMatch(
      hostSocket,
      (v) => v.round.question?.phase === 'judging',
      15_000,
      'chấm câu (mọi Player đã trả lời)',
    );
    await Promise.all(
      players.map(async (socket) => {
        const start = performance.now();
        const ack = await emitAck(socket, 'match:answer', {
          roomId: room.id,
          actionId: crypto.randomUUID(),
          questionRef: ref,
          answer: { type: 'true_false', value: true },
        });
        answerLatencies.push(performance.now() - start);
        if (!ack.ok) recordError(`answer-${ack.error.code}`, ack.error.message);
      }),
    );
    await judging;
    await broadcastLatency(
      hostSocket,
      everyone,
      room.id,
      { type: 'reveal' },
      (v) => v.round.question?.phase === 'revealed',
    );
  }

  await command(hostSocket, room.id, { type: 'end_match' });
  await hostApi.post(`/rooms/${room.id}/close`).catch(() => undefined);
  for (const socket of everyone) socket.disconnect();
}

async function main(): Promise<void> {
  const hostsNeeded = Math.ceil(rooms / roomsPerHost);
  if (databaseUrl) {
    console.log(`Tạo ${hostsNeeded} tài khoản Host kiểm thử…`);
    await seedHosts(databaseUrl, hostsNeeded);
  }
  const api = new Api(target);
  const hosts: { api: Api; scriptId: string }[] = [];
  for (let i = 0; i < hostsNeeded; i += 1) {
    const hostApi = await login(api, hostEmail(i));
    hosts.push({ api: hostApi, scriptId: await createAccelerationScript(hostApi, questions) });
  }

  console.log(
    `Chạy ${rooms} phòng × (1 Host + ${playersPerRoom} Player + ${spectatorsPerRoom} khán giả), ${questions} câu…`,
  );
  const started = performance.now();
  const results = await Promise.allSettled(
    Array.from({ length: rooms }, (_, i) => {
      const host = hosts[Math.floor(i / roomsPerHost)]!;
      return runRoom(host.api, host.scriptId, i);
    }),
  );
  results.forEach((r) => r.status === 'rejected' && recordError('room-failed', r.reason));

  const summary = {
    target,
    rooms,
    playersPerRoom,
    spectatorsPerRoom,
    questions,
    connections,
    durationSeconds: Math.round((performance.now() - started) / 1000),
    roomsCompleted: results.filter((r) => r.status === 'fulfilled').length,
    syncMs: summarize(syncLatencies),
    answerAckMs: summarize(answerLatencies),
    subscribeAckMs: summarize(subscribeLatencies),
    errors,
    syncTargetMs,
  };
  const passed =
    summary.roomsCompleted === rooms &&
    Object.keys(errors).length === 0 &&
    summary.syncMs.p95 <= syncTargetMs;
  writeFileSync(output, JSON.stringify({ ...summary, passed }, null, 2));
  console.log(JSON.stringify({ ...summary, passed }, null, 2));
  process.exit(passed ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
