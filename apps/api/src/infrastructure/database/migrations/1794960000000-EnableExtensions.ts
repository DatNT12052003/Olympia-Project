import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Bật extension dùng chung: `citext` cho email/tên không phân biệt hoa thường. */
export class EnableExtensions1794960000000 implements MigrationInterface {
  name = 'EnableExtensions1794960000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS citext');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP EXTENSION IF EXISTS citext');
  }
}
