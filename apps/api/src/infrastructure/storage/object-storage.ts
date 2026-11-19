import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** Thông tin tệp đã lưu. `null` khi không tồn tại. */
export interface StoredObjectInfo {
  sizeBytes: number;
  contentType: string | undefined;
}

/**
 * Object storage S3-compatible (DL-025: SeaweedFS khi dev). Trình duyệt upload/tải trực tiếp
 * qua presigned URL; API chỉ cấp URL và kiểm tra tệp sau khi upload.
 */
export interface ObjectStorage {
  presignPut(key: string, contentType: string, expiresInSeconds: number): Promise<string>;
  presignGet(key: string, expiresInSeconds: number): Promise<string>;
  head(key: string): Promise<StoredObjectInfo | null>;
  /** Đọc `length` byte đầu (kiểm tra chữ ký định dạng tệp). */
  readHead(key: string, length: number): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
  /** Tạo bucket nếu chưa có (môi trường dev). */
  ensureBucket(): Promise<void>;
  ping(): Promise<void>;
}

export interface S3StorageConfig {
  endpoint: string;
  /** Endpoint trình duyệt dùng trong presigned URL (khác `endpoint` khi API gọi qua mạng nội bộ). */
  publicEndpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

function isNotFound(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === 'NotFound' || e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404;
}

export function createS3ObjectStorage(config: S3StorageConfig): ObjectStorage {
  const base = {
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // Presigned URL không kèm checksum mặc định của SDK (trình duyệt không tính CRC32).
    requestChecksumCalculation: 'WHEN_REQUIRED' as const,
    responseChecksumValidation: 'WHEN_REQUIRED' as const,
  };
  const client = new S3Client({ ...base, endpoint: config.endpoint });
  const signer =
    config.publicEndpoint === config.endpoint
      ? client
      : new S3Client({ ...base, endpoint: config.publicEndpoint });
  const Bucket = config.bucket;

  return {
    presignPut: (key, contentType, expiresIn) =>
      getSignedUrl(signer, new PutObjectCommand({ Bucket, Key: key, ContentType: contentType }), {
        expiresIn,
      }),
    presignGet: (key, expiresIn) =>
      getSignedUrl(signer, new GetObjectCommand({ Bucket, Key: key }), { expiresIn }),
    async head(key) {
      try {
        const result = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return { sizeBytes: result.ContentLength ?? 0, contentType: result.ContentType };
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },
    async readHead(key, length) {
      const result = await client.send(
        new GetObjectCommand({ Bucket, Key: key, Range: `bytes=0-${length - 1}` }),
      );
      return result.Body ? await result.Body.transformToByteArray() : new Uint8Array();
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
    async ensureBucket() {
      try {
        await client.send(new HeadBucketCommand({ Bucket }));
      } catch (error) {
        if (!isNotFound(error)) throw error;
        await client.send(new CreateBucketCommand({ Bucket }));
      }
    },
    async ping() {
      await client.send(new HeadBucketCommand({ Bucket }));
    },
  };
}

/** Object storage trong bộ nhớ cho test: URL giả, nội dung đặt trực tiếp bằng `put`. */
export function createMemoryObjectStorage() {
  const objects = new Map<string, { body: Uint8Array; contentType: string }>();
  const storage: ObjectStorage & {
    put(key: string, body: Uint8Array, contentType: string): void;
    has(key: string): boolean;
  } = {
    presignPut: (key) => Promise.resolve(`http://storage.test/upload/${encodeURIComponent(key)}`),
    presignGet: (key) => Promise.resolve(`http://storage.test/${encodeURIComponent(key)}?sig=1`),
    head: (key) => {
      const object = objects.get(key);
      return Promise.resolve(
        object ? { sizeBytes: object.body.length, contentType: object.contentType } : null,
      );
    },
    readHead: (key, length) =>
      Promise.resolve(objects.get(key)?.body.slice(0, length) ?? new Uint8Array()),
    delete: (key) => {
      objects.delete(key);
      return Promise.resolve();
    },
    ensureBucket: () => Promise.resolve(),
    ping: () => Promise.resolve(),
    put: (key, body, contentType) => {
      objects.set(key, { body, contentType });
    },
    has: (key) => objects.has(key),
  };
  return storage;
}

export type MemoryObjectStorage = ReturnType<typeof createMemoryObjectStorage>;
