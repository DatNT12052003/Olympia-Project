import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Kịch bản và trận đấu (P4, đặc tả mục 6, 8, 9).
 *
 * - `match_scripts`: kịch bản của Host, dùng lại cho nhiều phòng (BR-SCRIPT-02).
 * - `matches`: một trận; giữ snapshot kịch bản + câu hỏi lúc bắt đầu (BR-SCRIPT-03, BR-QB-04) và
 *   bản checkpoint trạng thái để khôi phục khi mất trạng thái nóng ở Redis (DL-013).
 *   Partial unique index bảo đảm mỗi phòng tối đa một trận đang diễn ra (BR-ROOM-01).
 * - `match_answers`, `match_score_events`, `match_interventions`: câu trả lời, sổ điểm (mỗi thay
 *   đổi một bản ghi, BR-SCORE-04) và nhật ký can thiệp của Host (BR-GAME-07).
 */
export class CreateMatchTables1795000000000 implements MigrationInterface {
  name = 'CreateMatchTables1795000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE match_scripts (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_user_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        name           varchar(100) NOT NULL,
        settings       jsonb NOT NULL,
        rounds         jsonb NOT NULL,
        created_at     timestamptz NOT NULL DEFAULT now(),
        updated_at     timestamptz NOT NULL DEFAULT now(),
        deleted_at     timestamptz
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_match_scripts_owner ON match_scripts (owner_user_id, updated_at DESC) WHERE deleted_at IS NULL',
    );

    await queryRunner.query(
      'ALTER TABLE rooms ADD COLUMN script_id uuid REFERENCES match_scripts (id) ON DELETE SET NULL',
    );
    await queryRunner.query('CREATE INDEX ix_rooms_script ON rooms (script_id)');

    await queryRunner.query(`
      CREATE TABLE matches (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id         uuid NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
        host_user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        script_id       uuid REFERENCES match_scripts (id) ON DELETE SET NULL,
        control_mode    text NOT NULL,
        status          text NOT NULL,
        end_reason      text,
        script_snapshot jsonb NOT NULL,
        state           jsonb NOT NULL,
        state_version   integer NOT NULL DEFAULT 0,
        started_at      timestamptz NOT NULL DEFAULT now(),
        ended_at        timestamptz,
        CONSTRAINT ck_matches_status CHECK (status IN ('running', 'paused', 'finished')),
        CONSTRAINT ck_matches_end_reason CHECK (end_reason IS NULL OR end_reason IN ('host', 'abnormal')),
        CONSTRAINT ck_matches_control_mode CHECK (control_mode IN ('manual', 'auto'))
      )
    `);
    await queryRunner.query(
      "CREATE UNIQUE INDEX uq_matches_active_room ON matches (room_id) WHERE status IN ('running', 'paused')",
    );
    await queryRunner.query('CREATE INDEX ix_matches_room ON matches (room_id, started_at DESC)');
    await queryRunner.query(
      'CREATE INDEX ix_matches_host ON matches (host_user_id, started_at DESC)',
    );

    await queryRunner.query(`
      CREATE TABLE match_players (
        match_id        uuid NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
        seat            smallint NOT NULL,
        participant_id  uuid REFERENCES room_participants (id) ON DELETE SET NULL,
        user_id         uuid REFERENCES users (id) ON DELETE SET NULL,
        guest_id        uuid,
        display_name    varchar(32) NOT NULL,
        final_score     integer,
        eliminated      boolean NOT NULL DEFAULT false,
        PRIMARY KEY (match_id, seat),
        CONSTRAINT ck_match_players_seat CHECK (seat BETWEEN 1 AND 4)
      )
    `);
    await queryRunner.query('CREATE INDEX ix_match_players_user ON match_players (user_id)');

    await queryRunner.query(`
      CREATE TABLE match_answers (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        match_id      uuid NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
        round_index   smallint NOT NULL,
        question_ref  varchar(40) NOT NULL,
        seat          smallint NOT NULL,
        answer        jsonb NOT NULL,
        auto_result   text,
        received_at   timestamptz NOT NULL,
        elapsed_ms    integer NOT NULL,
        CONSTRAINT ck_match_answers_auto CHECK (auto_result IS NULL OR auto_result IN ('correct', 'wrong'))
      )
    `);
    // Mỗi Player trả lời một câu một lần (BR-GAME-03).
    await queryRunner.query(
      'CREATE UNIQUE INDEX uq_match_answers_once ON match_answers (match_id, question_ref, seat)',
    );

    await queryRunner.query(`
      CREATE TABLE match_score_events (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        match_id      uuid NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
        seq           integer NOT NULL,
        seat          smallint NOT NULL,
        round_index   smallint NOT NULL,
        question_ref  varchar(40),
        delta         integer NOT NULL,
        nominal       integer NOT NULL,
        reason        text NOT NULL,
        note          varchar(200),
        actor         text NOT NULL,
        created_at    timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_match_score_events_seq UNIQUE (match_id, seq),
        CONSTRAINT ck_match_score_events_actor CHECK (actor IN ('system', 'host'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE match_interventions (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        match_id       uuid NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
        actor_user_id  uuid REFERENCES users (id) ON DELETE SET NULL,
        action         varchar(40) NOT NULL,
        detail         jsonb NOT NULL,
        reason         varchar(200),
        created_at     timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_match_interventions_match ON match_interventions (match_id, created_at)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE match_interventions');
    await queryRunner.query('DROP TABLE match_score_events');
    await queryRunner.query('DROP TABLE match_answers');
    await queryRunner.query('DROP TABLE match_players');
    await queryRunner.query('DROP TABLE matches');
    await queryRunner.query('DROP INDEX ix_rooms_script');
    await queryRunner.query('ALTER TABLE rooms DROP COLUMN script_id');
    await queryRunner.query('DROP TABLE match_scripts');
  }
}
