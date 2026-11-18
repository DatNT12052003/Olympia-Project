import { hash, verify } from '@node-rs/argon2';

/** Băm mật khẩu bằng Argon2id (tham số mặc định của thư viện: m=19 MiB, t=2, p=1 theo OWASP). */
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(passwordHash: string, password: string): Promise<boolean>;
  /**
   * Chạy một lần verify giả khi email không tồn tại, để thời gian phản hồi không tiết lộ
   * email nào đã đăng ký.
   */
  verifyDummy(password: string): Promise<void>;
}

export async function createArgon2PasswordHasher(): Promise<PasswordHasher> {
  const dummyHash = await hash('olympia-dummy-password');
  return {
    hash: (password) => hash(password),
    async verify(passwordHash, password) {
      try {
        return await verify(passwordHash, password);
      } catch {
        return false;
      }
    },
    async verifyDummy(password) {
      await verify(dummyHash, password).catch(() => false);
    },
  };
}
