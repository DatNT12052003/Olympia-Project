import type { AvGateway, AvParticipant, AvSource, AvTokenInput } from './av-gateway';

/** Gateway LiveKit giả cho test: ghi lại token đã cấp và lệnh gửi tới SFU. */
export function createFakeAvGateway() {
  const participants = new Map<string, AvParticipant[]>();
  const calls: { op: string; room: string; identity?: string; sources?: AvSource[] }[] = [];
  const tokens: AvTokenInput[] = [];
  let failing = false;

  const gateway: AvGateway = {
    createToken(input) {
      if (failing) return Promise.reject(new Error('livekit down'));
      tokens.push(input);
      return Promise.resolve(`fake-token:${input.identity}`);
    },
    listParticipants(room) {
      if (failing) return Promise.reject(new Error('livekit down'));
      return Promise.resolve(participants.get(room) ?? []);
    },
    setSources(room, identity, sources) {
      calls.push({ op: 'setSources', room, identity, sources });
      return Promise.resolve();
    },
    muteTrack(room, identity) {
      calls.push({ op: 'muteTrack', room, identity });
      return Promise.resolve();
    },
    removeParticipant(room, identity) {
      calls.push({ op: 'removeParticipant', room, identity });
      return Promise.resolve();
    },
    deleteRoom(room) {
      calls.push({ op: 'deleteRoom', room });
      return Promise.resolve();
    },
  };

  return {
    gateway,
    calls,
    tokens,
    /** Đặt danh sách người đang kết nối phòng LiveKit (theo token đã cấp). */
    join(room: string, input: AvTokenInput, tracks: AvParticipant['tracks'] = []) {
      const list = (participants.get(room) ?? []).filter((p) => p.identity !== input.identity);
      list.push({ identity: input.identity, metadata: input.metadata, tracks });
      participants.set(room, list);
    },
    setFailing(value: boolean) {
      failing = value;
    },
  };
}

export type FakeAvGateway = ReturnType<typeof createFakeAvGateway>;
