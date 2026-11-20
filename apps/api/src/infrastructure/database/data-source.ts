import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { entities } from './entities';
import { migrations } from './migrations';

/**
 * Tạo DataSource PostgreSQL. Schema chỉ thay đổi qua migration; không dùng `synchronize`.
 * Entity đặt trong module nghiệp vụ (`*.entity.ts`) và đăng ký ở `entities.ts`;
 * migration đăng ký ở `migrations/index.ts`.
 */
export function createDataSource(databaseUrl: string, poolSize?: number): DataSource {
  return new DataSource({
    type: 'postgres',
    url: databaseUrl,
    // Số kết nối tối đa của pool (driver pg mặc định 10).
    ...(poolSize ? { extra: { max: poolSize } } : {}),
    entities,
    migrations,
    synchronize: false,
    migrationsRun: false,
    logging: false,
  });
}
