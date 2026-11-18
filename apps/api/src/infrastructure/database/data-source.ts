import 'reflect-metadata';
import path from 'node:path';
import { DataSource } from 'typeorm';

/**
 * Tạo DataSource PostgreSQL. Schema chỉ thay đổi qua migration; không dùng `synchronize`.
 * Entity đặt trong module nghiệp vụ với hậu tố `.entity.ts`.
 */
export function createDataSource(databaseUrl: string): DataSource {
  return new DataSource({
    type: 'postgres',
    url: databaseUrl,
    entities: [path.join(__dirname, '../../modules/**/*.entity.{ts,js}')],
    migrations: [path.join(__dirname, 'migrations/*.{ts,js}')],
    synchronize: false,
    migrationsRun: false,
    logging: false,
  });
}
