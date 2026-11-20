import { createHash, randomBytes } from 'node:crypto';

/** Token ngẫu nhiên 256 bit, dùng cho refresh token và token một lần gửi qua email. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Băm token trước khi lưu. Token có entropy cao nên SHA-256 là đủ (không cần hàm băm chậm);
 * lộ DB không làm lộ token dùng được.
 */
export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
