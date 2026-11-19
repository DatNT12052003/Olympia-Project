import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P5: trận kết thúc sau vòng cuối (hoặc sau câu hỏi phụ) có lý do `completed`, phân biệt với Host
 * kết thúc sớm (`host`) và kết thúc bất thường (`abnormal`).
 */
export class MatchEndReasonCompleted1795010000000 implements MigrationInterface {
  name = 'MatchEndReasonCompleted1795010000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE matches DROP CONSTRAINT ck_matches_end_reason');
    await queryRunner.query(`
      ALTER TABLE matches ADD CONSTRAINT ck_matches_end_reason
        CHECK (end_reason IS NULL OR end_reason IN ('completed', 'host', 'abnormal'))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE matches SET end_reason = 'host' WHERE end_reason = 'completed'`,
    );
    await queryRunner.query('ALTER TABLE matches DROP CONSTRAINT ck_matches_end_reason');
    await queryRunner.query(`
      ALTER TABLE matches ADD CONSTRAINT ck_matches_end_reason
        CHECK (end_reason IS NULL OR end_reason IN ('host', 'abnormal'))
    `);
  }
}
