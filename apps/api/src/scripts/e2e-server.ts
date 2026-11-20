import { DataSource } from 'typeorm';
import { createDataSource } from '../infrastructure/database/data-source';
import { createArgon2PasswordHasher } from '../modules/auth/password-hasher';
import { UserEntity } from '../modules/users/user.entity';

/**
 * Máy chủ API cho E2E đầy đủ (Playwright `playwright.full.config.ts`): database riêng
 * `olympia_e2e` (tạo nếu chưa có, chạy migration), tài khoản Host đã xác minh, rồi khởi động API
 * như `main.ts`. Không đụng database dev. Chỉ dùng khi chạy thử local/CI.
 */

export const E2E_HOST = {
  email: 'host@e2e.olympia.test',
  password: 'E2e-Host-Pass-123',
  displayName: 'Cô Thu Hà',
};

const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '3100',
  LOG_LEVEL: 'warn',
  DATABASE_URL: 'postgres://olympia:olympia@localhost:5440/olympia_e2e',
  REDIS_URL: 'redis://localhost:6380/14',
  CORS_ORIGINS: 'http://localhost:5174',
  APP_URL: 'http://localhost:5174',
  JWT_SECRET: 'e2e-only-secret-0123456789abcdef-0123456789',
  // Nhiều trình duyệt cùng chạy từ một địa chỉ: chỉ giữ các giới hạn riêng.
  API_RATE_LIMIT_PER_MINUTE: '0',
};

async function prepareDatabase(url: string): Promise<void> {
  const target = new URL(url);
  const name = target.pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`Tên database không hợp lệ: ${name}`);
  const adminUrl = new URL(target);
  adminUrl.pathname = '/postgres';
  const admin = new DataSource({ type: 'postgres', url: adminUrl.toString() });
  await admin.initialize();
  try {
    const rows: unknown[] = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      name,
    ]);
    if (rows.length === 0) await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.destroy();
  }

  const dataSource = createDataSource(url);
  await dataSource.initialize();
  try {
    await dataSource.runMigrations({ transaction: 'each' });
    const repo = dataSource.getRepository(UserEntity);
    const hasher = await createArgon2PasswordHasher();
    const existing = await repo.findOneBy({ email: E2E_HOST.email });
    await repo.save(
      repo.create({
        ...(existing ?? {}),
        email: E2E_HOST.email,
        passwordHash: await hasher.hash(E2E_HOST.password),
        displayName: E2E_HOST.displayName,
        systemRole: 'member',
        emailVerifiedAt: existing?.emailVerifiedAt ?? new Date(),
        canHost: true,
        status: 'active',
        lockedAt: null,
        privacyAcceptedAt: existing?.privacyAcceptedAt ?? new Date(),
      }),
    );
  } finally {
    await dataSource.destroy();
  }
}

async function run(): Promise<void> {
  for (const [key, value] of Object.entries(defaults)) process.env[key] ??= value;
  await prepareDatabase(process.env.DATABASE_URL!);
  await import('../main.js');
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
