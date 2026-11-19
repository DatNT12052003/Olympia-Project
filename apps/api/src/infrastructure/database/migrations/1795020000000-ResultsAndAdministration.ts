import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P7: kết quả, lịch sử, thống kê (mục 9.4, 14), dữ liệu cá nhân (14.1, DL-008) và quản trị (mục 15).
 *
 * - `match_questions` / `match_question_outcomes`: câu đã dùng và kết quả theo ghế, ghi khi rời
 *   từng vòng (DL-047).
 * - `matches`: công bố đáp án sau trận (DL-048), hủy kết quả bởi Super Admin (BR-HIST-01).
 * - `users`: chờ xóa / đã xóa (DL-008), số lần bị cảnh báo (DL-050).
 * - `system_settings`: cấu hình hệ thống sửa trên web (DL-049).
 * - `reports`: báo cáo vi phạm (15.3, DL-050).
 */
export class ResultsAndAdministration1795020000000 implements MigrationInterface {
  name = 'ResultsAndAdministration1795020000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // --- Kết quả trận ---
    await queryRunner.query(`
      ALTER TABLE matches
        ADD COLUMN answers_public boolean NOT NULL DEFAULT false,
        ADD COLUMN voided_at      timestamptz,
        ADD COLUMN voided_by      uuid REFERENCES users (id) ON DELETE SET NULL,
        ADD COLUMN void_reason    varchar(500),
        ADD COLUMN room_name      varchar(100) NOT NULL DEFAULT '',
        ADD CONSTRAINT ck_matches_voided CHECK ((voided_at IS NULL) = (void_reason IS NULL))
    `);
    // Tên phòng lúc thi, để lịch sử không phụ thuộc bảng của Room Management (DL-010).
    await queryRunner.query(
      'UPDATE matches m SET room_name = r.name FROM rooms r WHERE r.id = m.room_id',
    );
    await queryRunner.query(
      "CREATE INDEX ix_matches_finished ON matches (ended_at DESC) WHERE status = 'finished'",
    );

    await queryRunner.query(`
      CREATE TABLE match_questions (
        match_id           uuid NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
        question_ref       varchar(40) NOT NULL,
        round_index        smallint NOT NULL,
        round_type         text NOT NULL,
        ordinal            smallint NOT NULL,
        source_question_id uuid,
        subject            varchar(50),
        topic              varchar(100),
        question           jsonb NOT NULL,
        PRIMARY KEY (match_id, question_ref)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_match_questions_source ON match_questions (source_question_id)',
    );

    await queryRunner.query(`
      CREATE TABLE match_question_outcomes (
        match_id     uuid NOT NULL,
        question_ref varchar(40) NOT NULL,
        seat         smallint NOT NULL,
        result       text NOT NULL,
        elapsed_ms   integer,
        buzz_won     boolean NOT NULL DEFAULT false,
        PRIMARY KEY (match_id, question_ref, seat),
        FOREIGN KEY (match_id, question_ref)
          REFERENCES match_questions (match_id, question_ref) ON DELETE CASCADE,
        CONSTRAINT ck_match_question_outcomes_result
          CHECK (result IN ('correct', 'wrong', 'skipped'))
      )
    `);

    // --- Dữ liệu cá nhân (DL-008) ---
    await queryRunner.query('ALTER TABLE users DROP CONSTRAINT ck_users_status');
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN deletion_requested_at timestamptz,
        ADD COLUMN deleted_at            timestamptz,
        ADD COLUMN warning_count         integer NOT NULL DEFAULT 0,
        ADD CONSTRAINT ck_users_status
          CHECK (status IN ('active', 'locked', 'pending_deletion', 'deleted')),
        ADD CONSTRAINT ck_users_pending_deletion
          CHECK (status <> 'pending_deletion' OR deletion_requested_at IS NOT NULL),
        ADD CONSTRAINT ck_users_deleted CHECK ((status = 'deleted') = (deleted_at IS NOT NULL))
    `);
    await queryRunner.query(
      "CREATE INDEX ix_users_pending_deletion ON users (deletion_requested_at) WHERE status = 'pending_deletion'",
    );
    await queryRunner.query(
      'ALTER TABLE user_action_tokens DROP CONSTRAINT ck_user_action_tokens_purpose',
    );
    await queryRunner.query(`
      ALTER TABLE user_action_tokens ADD CONSTRAINT ck_user_action_tokens_purpose
        CHECK (purpose IN ('email_verification', 'password_reset', 'cancel_deletion'))
    `);
    await queryRunner.query(
      'CREATE INDEX ix_match_interventions_created_at ON match_interventions (created_at)',
    );

    // --- Cấu hình hệ thống (DL-049) ---
    await queryRunner.query(`
      CREATE TABLE system_settings (
        key        varchar(64) PRIMARY KEY,
        value      jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid REFERENCES users (id) ON DELETE SET NULL
      )
    `);

    // --- Báo cáo vi phạm (15.3, DL-050) ---
    await queryRunner.query(`
      CREATE TABLE reports (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        reporter_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
        target_type      text NOT NULL,
        target_id        uuid NOT NULL,
        target_label     varchar(200) NOT NULL,
        subject_user_id  uuid REFERENCES users (id) ON DELETE SET NULL,
        subject_guest_id uuid,
        subject_name     varchar(32),
        organization_id  uuid REFERENCES organizations (id) ON DELETE SET NULL,
        category         text NOT NULL,
        description      varchar(1000) NOT NULL,
        status           text NOT NULL DEFAULT 'open',
        resolution       text,
        resolution_note  varchar(500),
        resolved_by      uuid REFERENCES users (id) ON DELETE SET NULL,
        resolved_at      timestamptz,
        created_at       timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_reports_target_type CHECK (target_type IN ('question_set_version', 'room')),
        CONSTRAINT ck_reports_category
          CHECK (category IN ('wrong_answer', 'inappropriate', 'copyright', 'harassment', 'cheating', 'other')),
        CONSTRAINT ck_reports_status CHECK (status IN ('open', 'resolved')),
        CONSTRAINT ck_reports_resolution CHECK (
          resolution IS NULL
          OR resolution IN ('dismiss', 'remove_content', 'warn', 'block_guest', 'lock_account')
        ),
        CONSTRAINT ck_reports_resolved CHECK ((status = 'resolved') = (resolution IS NOT NULL))
      )
    `);
    await queryRunner.query('CREATE INDEX ix_reports_status ON reports (status, created_at DESC)');
    await queryRunner.query(
      'CREATE INDEX ix_reports_subject_user ON reports (subject_user_id) WHERE subject_user_id IS NOT NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE reports');
    await queryRunner.query('DROP TABLE system_settings');
    await queryRunner.query('DROP INDEX ix_match_interventions_created_at');
    await queryRunner.query("DELETE FROM user_action_tokens WHERE purpose = 'cancel_deletion'");
    await queryRunner.query(
      'ALTER TABLE user_action_tokens DROP CONSTRAINT ck_user_action_tokens_purpose',
    );
    await queryRunner.query(`
      ALTER TABLE user_action_tokens ADD CONSTRAINT ck_user_action_tokens_purpose
        CHECK (purpose IN ('email_verification', 'password_reset'))
    `);
    await queryRunner.query('DROP INDEX ix_users_pending_deletion');
    // Tài khoản chờ xóa/đã xóa không còn biểu diễn được: khóa lại.
    await queryRunner.query(`
      UPDATE users SET status = 'locked', locked_at = now(), locked_reason = 'Tài khoản đã xóa'
      WHERE status IN ('pending_deletion', 'deleted')
    `);
    await queryRunner.query(`
      ALTER TABLE users
        DROP CONSTRAINT ck_users_deleted,
        DROP CONSTRAINT ck_users_pending_deletion,
        DROP CONSTRAINT ck_users_status,
        DROP COLUMN warning_count,
        DROP COLUMN deleted_at,
        DROP COLUMN deletion_requested_at,
        ADD CONSTRAINT ck_users_status CHECK (status IN ('active', 'locked'))
    `);
    await queryRunner.query('DROP TABLE match_question_outcomes');
    await queryRunner.query('DROP TABLE match_questions');
    await queryRunner.query('DROP INDEX ix_matches_finished');
    await queryRunner.query(`
      ALTER TABLE matches
        DROP CONSTRAINT ck_matches_voided,
        DROP COLUMN room_name,
        DROP COLUMN void_reason,
        DROP COLUMN voided_by,
        DROP COLUMN voided_at,
        DROP COLUMN answers_public
    `);
  }
}
