import { createContext, useContext } from 'react';

/** Trạng thái kết nối âm thanh/hình ảnh dùng chung cho các thành phần AV. */

export type AvStatus = 'off' | 'unsupported' | 'connecting' | 'ready' | 'unavailable';

export interface AvContextValue {
  status: AvStatus;
  /** Được phát camera/micro (Host, Player); khán giả chỉ xem/nghe. */
  canPublish: boolean;
  /** Tắt tiếng phát lại trên máy này (nút loa của khán giả). */
  speakerOff: boolean;
  setSpeakerOff: (value: boolean) => void;
  retry: () => void;
}

export const AvContext = createContext<AvContextValue>({
  status: 'off',
  canPublish: false,
  speakerOff: false,
  setSpeakerOff: () => undefined,
  retry: () => undefined,
});

export function useAv(): AvContextValue {
  return useContext(AvContext);
}

const PREFS_KEY = 'olympia.av';

/** Lựa chọn bật camera/micro của người dùng (tiện ích theo máy, không bắt buộc lưu được). */
export function readDevicePrefs(): { camera: boolean; microphone: boolean } {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { camera?: unknown; microphone?: unknown };
      return { camera: parsed.camera !== false, microphone: parsed.microphone !== false };
    }
  } catch {
    // Bỏ qua: trình duyệt chặn bộ nhớ.
  }
  return { camera: true, microphone: true };
}

export function writeDevicePrefs(prefs: { camera: boolean; microphone: boolean }): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Bỏ qua.
  }
}
