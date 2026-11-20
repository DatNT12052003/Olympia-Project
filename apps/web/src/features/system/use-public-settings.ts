import {
  DEFAULT_REACTIONS,
  MEDIA_RULES,
  type PublicSettings,
  publicSettingsSchema,
} from '@olympia/shared';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../lib/api-client';

/** Giá trị dùng khi chưa tải được cấu hình (mặc định của đặc tả). */
export const FALLBACK_PUBLIC_SETTINGS: PublicSettings = {
  reactions: DEFAULT_REACTIONS,
  mediaMaxBytes: {
    image: MEDIA_RULES.image.maxBytes,
    video: MEDIA_RULES.video.maxBytes,
    audio: MEDIA_RULES.audio.maxBytes,
  },
};

/** Cấu hình hệ thống mà giao diện cần: reaction đang bật, dung lượng media (DL-049). */
export function usePublicSettings(): PublicSettings {
  const query = useQuery({
    queryKey: ['settings', 'public'],
    queryFn: ({ signal }) => apiGet('/settings/public', { schema: publicSettingsSchema, signal }),
    staleTime: 60_000,
  });
  return query.data ?? FALLBACK_PUBLIC_SETTINGS;
}
