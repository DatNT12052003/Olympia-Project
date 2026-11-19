import { RoomAudioRenderer, RoomContext } from '@livekit/components-react';
import { Room, RoomEvent } from 'livekit-client';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAvToken } from './av-api';
import { AvContext, type AvStatus, readDevicePrefs } from './av-context';

/**
 * Kết nối âm thanh/hình ảnh của phòng (mục 11, DL-019). Video là kênh độc lập với trạng thái trận
 * (BR-AV-02): lỗi kết nối chỉ làm các ô video rơi về ảnh đại diện, mọi thao tác thi vẫn chạy.
 *
 * `Room` của LiveKit được tạo một lần và luôn bọc nội dung trang, để kết nối xong không dựng lại
 * cây component (mất dữ liệu đang nhập).
 */

function webrtcSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.RTCPeerConnection === 'function';
}

export function AvProvider({
  roomId,
  enabled,
  canPublish,
  children,
}: {
  roomId: string;
  /** Đã ở trong phòng (không phải người chờ duyệt). */
  enabled: boolean;
  canPublish: boolean;
  children: ReactNode;
}) {
  const supported = useMemo(() => webrtcSupported(), []);
  const room = useMemo(
    () => (supported ? new Room({ adaptiveStream: true, dynacast: true }) : undefined),
    [supported],
  );
  const [speakerOff, setSpeakerOff] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  // Trạng thái theo từng lượt kết nối; lượt mới chưa có kết quả là "đang kết nối".
  const connectionKey = `${roomId}|${String(canPublish)}|${attempt}`;
  const [result, setResult] = useState<{ key: string; status: AvStatus } | null>(null);

  useEffect(() => {
    if (!room || !enabled) return;
    let cancelled = false;
    const set = (status: AvStatus) => {
      if (!cancelled) setResult({ key: connectionKey, status });
    };
    const onDisconnected = () => set('unavailable');
    const onReconnecting = () => set('connecting');
    const onReconnected = () => set('ready');
    room.on(RoomEvent.Disconnected, onDisconnected);
    room.on(RoomEvent.Reconnecting, onReconnecting);
    room.on(RoomEvent.Reconnected, onReconnected);

    void (async () => {
      try {
        const token = await fetchAvToken(roomId);
        if (cancelled) return;
        await room.connect(token.url, token.token);
        if (cancelled) return;
        set('ready');
        if (token.canPublish) {
          // Không có/không cho phép thiết bị vẫn thi được (BR-AV-01).
          const prefs = readDevicePrefs();
          await room.localParticipant.setCameraEnabled(prefs.camera).catch(() => undefined);
          await room.localParticipant.setMicrophoneEnabled(prefs.microphone).catch(() => undefined);
        }
      } catch {
        set('unavailable');
      }
    })();

    return () => {
      cancelled = true;
      room.off(RoomEvent.Disconnected, onDisconnected);
      room.off(RoomEvent.Reconnecting, onReconnecting);
      room.off(RoomEvent.Reconnected, onReconnected);
      void room.disconnect();
    };
    // Đổi vai trò (khán giả ↔ người chơi) cần token mới.
  }, [room, roomId, enabled, connectionKey]);

  const status: AvStatus = !supported
    ? 'unsupported'
    : !enabled
      ? 'off'
      : result?.key === connectionKey
        ? result.status
        : 'connecting';

  const value = useMemo(
    () => ({ status, canPublish, speakerOff, setSpeakerOff, retry }),
    [status, canPublish, speakerOff, retry],
  );

  return (
    <AvContext.Provider value={value}>
      <RoomContext.Provider value={room}>
        {children}
        {room && status === 'ready' && <RoomAudioRenderer muted={speakerOff} />}
      </RoomContext.Provider>
    </AvContext.Provider>
  );
}
