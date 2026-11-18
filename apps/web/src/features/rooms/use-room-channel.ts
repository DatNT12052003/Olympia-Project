import {
  type ClientToServerEvents,
  RealtimeConnectError,
  type RoomReaction,
  type RoomRemovedReason,
  type RoomState,
  type ServerToClientEvents,
} from '@olympia/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { roomTokenSource } from './rooms-api';

type RoomSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export type ChannelConnection = 'connecting' | 'online' | 'offline';

export interface FloatingReaction extends RoomReaction {
  key: number;
}

export interface RoomChannel {
  state: RoomState | null;
  connection: ChannelConnection;
  /** Thời điểm (ms, đồng hồ máy) mất kết nối tới server; `null` khi đang kết nối. */
  offlineSince: number | null;
  /** Lỗi khi theo dõi phòng (ví dụ không còn ở trong phòng). */
  error: { code: string; message: string } | null;
  /** Server báo người dùng không còn ở trong phòng. */
  removed: RoomRemovedReason | null;
  reactions: FloatingReaction[];
  /** Kết nối lại ngay (nút "Thử kết nối lại ngay", hoặc dùng lại tab sau khi bị thay thế). */
  reconnect: () => void;
  sendReaction: (emoji: string) => Promise<string | null>;
}

const REACTION_LIFETIME_MS = 2_600;

/**
 * Theo dõi một phòng qua Socket.IO (DL-026). Mỗi lần (kết nối lại) đăng ký phòng để nhận đủ trạng
 * thái hiện tại (BR-RC-02); bỏ qua trạng thái có version cũ hơn bản đang có (BR-RT-03). Trạng
 * thái kết nối thay đổi không tăng version nên bản cùng version vẫn được áp dụng.
 */
export function useRoomChannel(roomId: string): RoomChannel {
  const [state, setState] = useState<RoomState | null>(null);
  const [connection, setConnection] = useState<ChannelConnection>('connecting');
  const [offlineSince, setOfflineSince] = useState<number | null>(null);
  const [error, setError] = useState<RoomChannel['error']>(null);
  const [removed, setRemoved] = useState<RoomRemovedReason | null>(null);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const socketRef = useRef<RoomSocket | null>(null);
  const subscribeRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    let disposed = false;
    let reactionKey = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const tokens = roomTokenSource(roomId);

    const applyState = (next: RoomState) => {
      if (next.room.id !== roomId) return;
      setState((previous) => (previous && next.version < previous.version ? previous : next));
    };

    const socket: RoomSocket = io({
      autoConnect: false,
      transports: ['websocket'],
      // Lấy token mới mỗi lần bắt tay (kể cả khi tự kết nối lại).
      auth: (callback) => {
        void tokens.get().then((token) => callback({ token: token ?? '' }));
      },
    });
    socketRef.current = socket;

    const subscribe = () => {
      socket.emit('room:subscribe', { roomId }, (result) => {
        if (disposed) return;
        if (result.ok) {
          setError(null);
          setRemoved(null);
          applyState(result.data);
        } else {
          setError(result.error);
        }
      });
    };
    subscribeRef.current = subscribe;

    socket.on('connect', () => {
      setConnection('online');
      setOfflineSince(null);
      subscribe();
    });
    socket.on('disconnect', (reason) => {
      setConnection('offline');
      setOfflineSince((since) => since ?? Date.now());
      // Server chủ động ngắt (ví dụ phiên bị thu hồi): Socket.IO không tự kết nối lại.
      if (reason === 'io server disconnect') {
        const timer = setTimeout(() => socket.connect(), 2_000);
        timers.add(timer);
      }
    });
    socket.on('connect_error', (err) => {
      setConnection('offline');
      setOfflineSince((since) => since ?? Date.now());
      if (socket.active) return;
      // Bị từ chối khi bắt tay: làm mới token rồi thử lại.
      const retry = async () => {
        if (err.message === RealtimeConnectError.Unauthenticated) {
          const token = await tokens.refresh();
          if (!token) {
            setError({
              code: RealtimeConnectError.Unauthenticated,
              message: 'Phiên của bạn đã hết hạn. Hãy vào lại phòng.',
            });
            return;
          }
        }
        if (!disposed) socket.connect();
      };
      const timer = setTimeout(() => void retry(), 1_500);
      timers.add(timer);
    });
    socket.on('room:state', applyState);
    socket.on('room:removed', (payload) => {
      if (payload.roomId === roomId) setRemoved(payload.reason);
    });
    socket.on('room:reaction', (reaction) => {
      if (reaction.roomId !== roomId) return;
      reactionKey += 1;
      const key = reactionKey;
      setReactions((list) => [...list.slice(-19), { ...reaction, key }]);
      const timer = setTimeout(() => {
        timers.delete(timer);
        setReactions((list) => list.filter((item) => item.key !== key));
      }, REACTION_LIFETIME_MS);
      timers.add(timer);
    });

    socket.connect();

    return () => {
      disposed = true;
      for (const timer of timers) clearTimeout(timer);
      if (socket.connected) socket.emit('room:unsubscribe', { roomId });
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId]);

  const reconnect = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    if (socket.connected) subscribeRef.current();
    else {
      setConnection('connecting');
      socket.connect();
    }
  }, []);

  const sendReaction = useCallback(
    (emoji: string) =>
      new Promise<string | null>((resolve) => {
        const socket = socketRef.current;
        if (!socket?.connected) {
          resolve('Đang mất kết nối với phòng.');
          return;
        }
        socket.emit('reaction:send', { roomId, emoji }, (result) => {
          resolve(result.ok ? null : result.error.message);
        });
      }),
    [roomId],
  );

  return { state, connection, offlineSince, error, removed, reactions, reconnect, sendReaction };
}
