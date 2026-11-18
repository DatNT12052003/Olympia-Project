import { DataSource } from 'typeorm';
import { createDataSource } from '../infrastructure/database/data-source';
import { testDatabaseUrl } from './test-database-url';

/**
 * Chạy một lần trước toàn bộ test: tạo database test (nếu chưa có) và áp dụng migration.
 * Cần PostgreSQL của `npm run services:up` (hoặc service postgres trong CI).
 */
export default async function globalSetup(): Promise<void> {
  const url = new URL(testDatabaseUrl());
  const databaseName = url.pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(databaseName)) {
    throw new Error(`Tên database test không hợp lệ: ${databaseName}`);
  }

  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = new DataSource({ type: 'postgres', url: adminUrl.toString() });
  try {
    await admin.initialize();
  } catch (error) {
    throw new Error(
      `Không kết nối được PostgreSQL cho test (${url.host}). Chạy "npm run services:up" trước.`,
      { cause: error },
    );
  }
  try {
    const rows: unknown[] = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      databaseName,
    ]);
    if (rows.length === 0) await admin.query(`CREATE DATABASE ${databaseName}`);
  } finally {
    await admin.destroy();
  }

  const dataSource = createDataSource(url.toString());
  await dataSource.initialize();
  try {
    await dataSource.runMigrations({ transaction: 'each' });
  } finally {
    await dataSource.destroy();
  }
}
