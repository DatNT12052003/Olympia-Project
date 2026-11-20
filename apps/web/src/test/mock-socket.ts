import { act } from '@testing-library/react';

type Listener = (...args: unknown[]) => void;
type ServerHandler = (payload: unknown, ack?: (result: unknown) => void) => void;

/**
 * Socket.IO giả cho test: `connect()` phát sự kiện `connect`; `emit` từ client được chuyển tới
 * `serverHandlers`; test gọi `serverPush` để giả lập server phát sự kiện.
 */
export class FakeSocket {
  connected = false;
  active = true;
  readonly emitted: { event: string; payload: unknown }[] = [];
  private readonly listeners = new Map<string, Listener[]>();

  constructor(readonly options: unknown) {}

  on(event: string, listener: Listener): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }

  removeAllListeners(): this {
    this.listeners.clear();
    return this;
  }

  connect(): this {
    this.connected = true;
    queueMicrotask(() => this.fire('connect'));
    return this;
  }

  disconnect(): this {
    this.connected = false;
    return this;
  }

  emit(event: string, payload?: unknown, ack?: (result: unknown) => void): this {
    this.emitted.push({ event, payload });
    serverHandlers[event]?.(payload, ack);
    return this;
  }

  /** `socket.timeout(ms).emit(...)`: ack nhận thêm tham số lỗi đầu tiên (`null` khi thành công). */
  timeout(_ms: number) {
    return {
      emit: (event: string, payload: unknown, ack?: (err: Error | null, result: unknown) => void) =>
        this.emit(event, payload, (result) => ack?.(null, result)),
    };
  }

  fire(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }
}

let serverHandlers: Record<string, ServerHandler> = {};
export const sockets: FakeSocket[] = [];

/** Thay `io()` của socket.io-client: `vi.mock('socket.io-client', () => socketIoMock)`. */
export const socketIoMock = {
  io: (options: unknown) => {
    const socket = new FakeSocket(options);
    sockets.push(socket);
    return socket;
  },
};

export function mockSocketServer(handlers: Record<string, ServerHandler>): void {
  serverHandlers = handlers;
  sockets.length = 0;
}

export function lastSocket(): FakeSocket {
  const socket = sockets.at(-1);
  if (!socket) throw new Error('Chưa có socket nào được tạo');
  return socket;
}

/** Giả lập server phát một sự kiện tới client. */
export function serverPush(event: string, ...args: unknown[]): void {
  act(() => lastSocket().fire(event, ...args));
}
