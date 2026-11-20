import { loadEnv } from '../config/env';
import { createDataSource } from '../infrastructure/database/data-source';
import { UserEntity } from '../modules/users/user.entity';

/**
 * Cấp vai trò Super Admin cho một tài khoản đã đăng ký (khởi tạo hệ thống lần đầu).
 * Cách dùng: npm run user:grant-super-admin -w @olympia/api -- <email>
 */
async function run(email: string | undefined): Promise<void> {
  if (!email) throw new Error('Cách dùng: grant-super-admin <email>');
  const dataSource = createDataSource(loadEnv().DATABASE_URL);
  await dataSource.initialize();
  try {
    const result = await dataSource
      .createQueryBuilder()
      .update(UserEntity)
      .set({ systemRole: 'super_admin' })
      .where('email = :email', { email: email.trim().toLowerCase() })
      .execute();
    if (!result.affected) throw new Error(`Không tìm thấy tài khoản ${email}. Hãy đăng ký trước.`);
    console.log(`Đã cấp vai trò Super Admin cho ${email}.`);
  } finally {
    await dataSource.destroy();
  }
}

run(process.argv[2]).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
