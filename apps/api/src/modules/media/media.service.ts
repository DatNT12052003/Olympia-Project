import { randomUUID } from 'node:crypto';
import {
  type CreateUploadResponse,
  type createUploadRequestSchema,
  MEDIA_RULES,
  type MediaView,
  mediaKindOf,
  QuestionErrorCode,
} from '@olympia/shared';
import { In, type DataSource } from 'typeorm';
import type { z } from 'zod';
import type { LimiterFactory } from '../../infrastructure/rate-limit/rate-limiter';
import type { ObjectStorage } from '../../infrastructure/storage/object-storage';
import type { UserPrincipal } from '../../shared/auth/principal';
import {
  AppError,
  BadRequestError,
  NotFoundError,
  TooManyRequestsError,
} from '../../shared/errors/app-error';
import { MediaAssetEntity } from './media-asset.entity';

/** Presigned URL upload hết hạn sau 10 phút; URL đọc sau 1 giờ. */
const UPLOAD_URL_TTL_SECONDS = 600;
const READ_URL_TTL_SECONDS = 3600;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'audio/mpeg': 'mp3',
};

/** Kiểm tra chữ ký đầu tệp khớp định dạng khai báo (không tin content type từ client). */
export function matchesSignature(contentType: string, head: Uint8Array): boolean {
  const ascii = (start: number, end: number) => String.fromCharCode(...head.slice(start, end));
  switch (contentType) {
    case 'image/jpeg':
      return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    case 'image/png':
      return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => head[i] === b);
    case 'image/webp':
      return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
    case 'video/mp4':
      return ascii(4, 8) === 'ftyp';
    case 'audio/mpeg':
      return ascii(0, 3) === 'ID3' || (head[0] === 0xff && ((head[1] ?? 0) & 0xe0) === 0xe0);
    default:
      return false;
  }
}

function formatMb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

export interface MediaServiceDeps {
  dataSource: DataSource;
  storage: ObjectStorage;
  limiters: LimiterFactory;
  now?: () => Date;
}

export function createMediaService({
  dataSource,
  storage,
  limiters,
  now = () => new Date(),
}: MediaServiceDeps) {
  const repo = dataSource.getRepository(MediaAssetEntity);
  const uploadLimiter = limiters({ keyPrefix: 'media-upload', points: 60, durationSeconds: 3600 });

  async function toView(asset: MediaAssetEntity): Promise<MediaView> {
    return {
      id: asset.id,
      kind: asset.kind,
      contentType: asset.contentType,
      sizeBytes: asset.sizeBytes,
      url: await storage.presignGet(asset.storageKey, READ_URL_TTL_SECONDS),
    };
  }

  function assertAllowed(contentType: string, sizeBytes: number) {
    const kind = mediaKindOf(contentType);
    if (!kind) {
      throw new BadRequestError(
        'Định dạng không được hỗ trợ. Dùng ảnh JPG, PNG, WEBP; video MP4; âm thanh MP3.',
        QuestionErrorCode.MediaTypeNotAllowed,
      );
    }
    const { maxBytes } = MEDIA_RULES[kind];
    if (sizeBytes > maxBytes) {
      throw new AppError(
        413,
        QuestionErrorCode.MediaTooLarge,
        `Tệp vượt dung lượng cho phép (${kind === 'image' ? 'ảnh' : kind === 'video' ? 'video' : 'âm thanh'} tối đa ${formatMb(maxBytes)}).`,
      );
    }
    return kind;
  }

  return {
    /** Cấp presigned URL để trình duyệt upload thẳng lên object storage (BR-QB-02). */
    async createUpload(
      actor: UserPrincipal,
      input: z.output<typeof createUploadRequestSchema>,
    ): Promise<CreateUploadResponse> {
      const blocked = await uploadLimiter.consume(actor.userId);
      if (blocked !== null) throw new TooManyRequestsError(blocked);
      const kind = assertAllowed(input.contentType, input.sizeBytes);

      const id = randomUUID();
      const storageKey = `media/${actor.userId}/${id}.${EXTENSIONS[input.contentType] ?? 'bin'}`;
      await repo.insert({
        id,
        ownerUserId: actor.userId,
        kind,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        storageKey,
        originalName: input.fileName,
        status: 'pending',
      });
      const uploadUrl = await storage.presignPut(
        storageKey,
        input.contentType,
        UPLOAD_URL_TTL_SECONDS,
      );
      return {
        mediaId: id,
        uploadUrl,
        headers: { 'Content-Type': input.contentType },
        expiresAt: new Date(now().getTime() + UPLOAD_URL_TTL_SECONDS * 1000).toISOString(),
      };
    },

    /**
     * Xác nhận đã upload: kiểm tra dung lượng thật và chữ ký định dạng; tệp không hợp lệ bị xóa.
     */
    async complete(actor: UserPrincipal, mediaId: string): Promise<MediaView> {
      const asset = await repo.findOneBy({ id: mediaId, ownerUserId: actor.userId });
      if (!asset) throw new NotFoundError('Không tìm thấy tệp.');
      if (asset.status === 'ready') return toView(asset);

      const info = await storage.head(asset.storageKey);
      if (!info) {
        throw new BadRequestError(
          'Chưa nhận được tệp. Hãy upload lại.',
          QuestionErrorCode.MediaNotReady,
        );
      }
      const reject = async (message: string, code: string = QuestionErrorCode.MediaInvalid) => {
        await storage.delete(asset.storageKey);
        await repo.delete({ id: asset.id });
        throw new BadRequestError(message, code);
      };
      try {
        assertAllowed(asset.contentType, info.sizeBytes);
      } catch (error) {
        if (error instanceof AppError) await reject(error.message, error.code);
        throw error;
      }
      const head = await storage.readHead(asset.storageKey, 16);
      if (!matchesSignature(asset.contentType, head)) {
        await reject('Nội dung tệp không đúng định dạng đã chọn.');
      }

      asset.sizeBytes = info.sizeBytes;
      asset.status = 'ready';
      asset.readyAt = now();
      await repo.save(asset);
      return toView(asset);
    },

    /**
     * Media dùng được cho câu hỏi: đã upload xong và thuộc người dùng, hoặc là media câu hỏi đang
     * gắn sẵn (ví dụ câu hỏi sao chép từ bộ public).
     */
    async assertUsable(actor: UserPrincipal, mediaId: string, currentMediaId: string | null) {
      const asset = await repo.findOneBy({ id: mediaId });
      const allowed = asset && (asset.ownerUserId === actor.userId || asset.id === currentMediaId);
      if (!asset || !allowed)
        throw new BadRequestError('Tệp media không hợp lệ.', QuestionErrorCode.MediaInvalid);
      if (asset.status !== 'ready') {
        throw new BadRequestError('Tệp media chưa upload xong.', QuestionErrorCode.MediaNotReady);
      }
      return asset;
    },

    /** View (kèm URL đọc tạm thời) cho nhiều media một lần. */
    async viewsFor(ids: (string | null)[]): Promise<Map<string, MediaView>> {
      const unique = [...new Set(ids.filter((id): id is string => id !== null))];
      if (unique.length === 0) return new Map();
      const assets = await repo.findBy({ id: In(unique), status: 'ready' });
      const views = await Promise.all(assets.map(toView));
      return new Map(views.map((view) => [view.id, view]));
    },
  };
}

export type MediaService = ReturnType<typeof createMediaService>;
