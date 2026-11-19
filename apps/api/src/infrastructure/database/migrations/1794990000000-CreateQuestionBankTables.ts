import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ngân hàng câu hỏi, media, bộ đề và phiên bản bộ public (P2, đặc tả mục 5).
 *
 * - Câu hỏi xóa mềm (`deleted_at`, BR-QB-03).
 * - Mỗi lần chia sẻ public tạo một phiên bản chứa bản snapshot nội dung (DL-033): bản đã duyệt
 *   không đổi khi chủ sở hữu sửa câu hỏi (BR-QB-04, BR-QB-09); mỗi bộ có tối đa một phiên bản
 *   chờ duyệt và một phiên bản đang public.
 */
export class CreateQuestionBankTables1794990000000 implements MigrationInterface {
  name = 'CreateQuestionBankTables1794990000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE media_assets (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_user_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        kind           text NOT NULL,
        content_type   varchar(100) NOT NULL,
        size_bytes     integer NOT NULL,
        storage_key    text NOT NULL UNIQUE,
        original_name  varchar(255),
        status         text NOT NULL DEFAULT 'pending',
        created_at     timestamptz NOT NULL DEFAULT now(),
        ready_at       timestamptz,
        CONSTRAINT ck_media_assets_kind CHECK (kind IN ('image', 'video', 'audio')),
        CONSTRAINT ck_media_assets_status CHECK (status IN ('pending', 'ready')),
        CONSTRAINT ck_media_assets_size CHECK (size_bytes > 0)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_media_assets_owner ON media_assets (owner_user_id, created_at DESC)',
    );

    await queryRunner.query(`
      CREATE TABLE questions (
        id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_user_id        uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        answer_type          text NOT NULL,
        content              text NOT NULL,
        answer               jsonb NOT NULL,
        explanation          text,
        media_id             uuid REFERENCES media_assets (id) ON DELETE SET NULL,
        subject              varchar(50),
        topic                varchar(100),
        grade                smallint,
        difficulty           text,
        rounds               text[] NOT NULL DEFAULT '{}',
        default_points       integer,
        default_time_seconds integer,
        tags                 text[] NOT NULL DEFAULT '{}',
        search_text          text NOT NULL DEFAULT '',
        created_at           timestamptz NOT NULL DEFAULT now(),
        updated_at           timestamptz NOT NULL DEFAULT now(),
        deleted_at           timestamptz,
        CONSTRAINT ck_questions_answer_type CHECK (answer_type IN ('mcq', 'true_false', 'short_answer')),
        CONSTRAINT ck_questions_answer_matches CHECK (answer->>'type' = answer_type),
        CONSTRAINT ck_questions_content CHECK (char_length(content) BETWEEN 1 AND 2000),
        CONSTRAINT ck_questions_grade CHECK (grade BETWEEN 1 AND 12),
        CONSTRAINT ck_questions_difficulty CHECK (difficulty IN ('easy', 'medium', 'hard')),
        CONSTRAINT ck_questions_rounds CHECK (rounds <@ ARRAY['warmup', 'obstacle', 'acceleration', 'finish']),
        CONSTRAINT ck_questions_points CHECK (default_points >= 0),
        CONSTRAINT ck_questions_time CHECK (default_time_seconds > 0)
      )
    `);
    // Danh sách ngân hàng của Host (mặc định mới nhất trước), bỏ câu đã xóa mềm.
    await queryRunner.query(
      'CREATE INDEX ix_questions_owner ON questions (owner_user_id, created_at DESC) WHERE deleted_at IS NULL',
    );
    await queryRunner.query('CREATE INDEX ix_questions_tags ON questions USING gin (tags)');
    await queryRunner.query('CREATE INDEX ix_questions_rounds ON questions USING gin (rounds)');

    await queryRunner.query(`
      CREATE TABLE question_sets (
        id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_user_id          uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        name                   varchar(100) NOT NULL,
        description            varchar(500),
        subject                varchar(50),
        grade                  smallint,
        copied_from_version_id uuid,
        created_at             timestamptz NOT NULL DEFAULT now(),
        updated_at             timestamptz NOT NULL DEFAULT now(),
        deleted_at             timestamptz,
        CONSTRAINT ck_question_sets_grade CHECK (grade BETWEEN 1 AND 12)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_question_sets_owner ON question_sets (owner_user_id, updated_at DESC) WHERE deleted_at IS NULL',
    );

    await queryRunner.query(`
      CREATE TABLE question_set_items (
        set_id      uuid NOT NULL REFERENCES question_sets (id) ON DELETE CASCADE,
        question_id uuid NOT NULL REFERENCES questions (id) ON DELETE CASCADE,
        round       text,
        position    integer NOT NULL,
        PRIMARY KEY (set_id, question_id),
        CONSTRAINT ck_question_set_items_round CHECK (round IN ('warmup', 'obstacle', 'acceleration', 'finish'))
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_question_set_items_question ON question_set_items (question_id)',
    );

    await queryRunner.query(`
      CREATE TABLE question_set_versions (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        set_id         uuid NOT NULL REFERENCES question_sets (id) ON DELETE CASCADE,
        version_no     integer NOT NULL,
        status         text NOT NULL,
        name           varchar(100) NOT NULL,
        description    varchar(500),
        subject        varchar(50),
        grade          smallint,
        question_count integer NOT NULL,
        snapshot       jsonb NOT NULL,
        submitted_by   uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        submitted_at   timestamptz NOT NULL DEFAULT now(),
        reviewed_by    uuid REFERENCES users (id) ON DELETE SET NULL,
        reviewed_at    timestamptz,
        review_reason  varchar(500),
        CONSTRAINT uq_question_set_versions_no UNIQUE (set_id, version_no),
        CONSTRAINT ck_question_set_versions_status
          CHECK (status IN ('pending', 'approved', 'rejected', 'superseded', 'withdrawn')),
        CONSTRAINT ck_question_set_versions_reason CHECK (status <> 'rejected' OR review_reason IS NOT NULL)
      )
    `);
    // BR-QB-09: mỗi bộ tối đa một phiên bản chờ duyệt và một phiên bản đang public.
    await queryRunner.query(
      "CREATE UNIQUE INDEX uq_question_set_versions_pending ON question_set_versions (set_id) WHERE status = 'pending'",
    );
    await queryRunner.query(
      "CREATE UNIQUE INDEX uq_question_set_versions_approved ON question_set_versions (set_id) WHERE status = 'approved'",
    );
    // Hàng đợi kiểm duyệt và danh mục bộ public.
    await queryRunner.query(
      "CREATE INDEX ix_question_set_versions_queue ON question_set_versions (submitted_at) WHERE status = 'pending'",
    );
    await queryRunner.query(
      "CREATE INDEX ix_question_set_versions_public ON question_set_versions (reviewed_at DESC) WHERE status = 'approved'",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE question_set_versions');
    await queryRunner.query('DROP TABLE question_set_items');
    await queryRunner.query('DROP TABLE question_sets');
    await queryRunner.query('DROP TABLE questions');
    await queryRunner.query('DROP TABLE media_assets');
  }
}
