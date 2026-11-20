import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phòng thi, người tham gia và danh sách cấm (P3, đặc tả mục 4).
 *
 * Ràng buộc nghiệp vụ quan trọng được giữ ở DB bằng partial unique index:
 * mã phòng duy nhất trong phòng đang hoạt động, mỗi ghế một người, mỗi tài khoản/khách một
 * lượt tham gia đang hiệu lực, tên hiển thị không trùng trong phòng (BR-AUTH-04).
 */
export class CreateRoomTables1794980000000 implements MigrationInterface {
  name = 'CreateRoomTables1794980000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE rooms (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        host_user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        name              varchar(100) NOT NULL,
        description       varchar(500),
        max_players       smallint NOT NULL,
        visibility        text NOT NULL,
        password_hash     text,
        allow_spectators  boolean NOT NULL DEFAULT true,
        max_spectators    integer NOT NULL DEFAULT 50,
        allow_guests      boolean NOT NULL DEFAULT true,
        auto_approve      boolean NOT NULL DEFAULT false,
        control_mode      text NOT NULL DEFAULT 'manual',
        reactions_enabled boolean NOT NULL DEFAULT true,
        status            text NOT NULL DEFAULT 'draft',
        code              char(6),
        state_version     integer NOT NULL DEFAULT 0,
        opened_at         timestamptz,
        closed_at         timestamptz,
        closed_reason     varchar(32),
        last_activity_at  timestamptz NOT NULL DEFAULT now(),
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_rooms_max_players CHECK (max_players BETWEEN 2 AND 4),
        CONSTRAINT ck_rooms_max_spectators CHECK (max_spectators >= 1),
        CONSTRAINT ck_rooms_visibility CHECK (visibility IN ('public', 'private')),
        CONSTRAINT ck_rooms_control_mode CHECK (control_mode IN ('manual', 'auto')),
        CONSTRAINT ck_rooms_status CHECK (status IN ('draft', 'open', 'in_match', 'closed')),
        CONSTRAINT ck_rooms_code CHECK (status = 'draft' OR code IS NOT NULL),
        CONSTRAINT ck_rooms_password_private CHECK (visibility = 'private' OR password_hash IS NULL)
      )
    `);
    // Mã phòng chỉ cần duy nhất trong số phòng đang hoạt động (4.1).
    await queryRunner.query(
      "CREATE UNIQUE INDEX uq_rooms_active_code ON rooms (code) WHERE status IN ('open', 'in_match')",
    );
    // "Phòng thi của tôi" và đếm phòng đang mở của Host (BR-ROOM-03).
    await queryRunner.query('CREATE INDEX ix_rooms_host_status ON rooms (host_user_id, status)');
    // Danh sách phòng công khai đang mở (4.2).
    await queryRunner.query(
      "CREATE INDEX ix_rooms_public_open ON rooms (opened_at DESC) WHERE status = 'open' AND visibility = 'public'",
    );
    // Quét phòng không hoạt động (BR-ROOM-02).
    await queryRunner.query(
      "CREATE INDEX ix_rooms_open_activity ON rooms (last_activity_at) WHERE status = 'open'",
    );

    await queryRunner.query(`
      CREATE TABLE room_participants (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id       uuid NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
        user_id       uuid REFERENCES users (id) ON DELETE CASCADE,
        guest_id      uuid,
        display_name  varchar(32) NOT NULL,
        role          text NOT NULL,
        status        text NOT NULL,
        seat          smallint,
        ready         boolean NOT NULL DEFAULT false,
        joined_at     timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now(),
        left_at       timestamptz,
        CONSTRAINT ck_room_participants_identity CHECK ((user_id IS NULL) <> (guest_id IS NULL)),
        CONSTRAINT ck_room_participants_role CHECK (role IN ('player', 'spectator')),
        CONSTRAINT ck_room_participants_status
          CHECK (status IN ('pending', 'approved', 'left', 'rejected', 'kicked')),
        CONSTRAINT ck_room_participants_seat CHECK (
          seat IS NULL OR (seat BETWEEN 1 AND 4 AND role = 'player' AND status = 'approved')
        )
      )
    `);
    await queryRunner.query(
      "CREATE UNIQUE INDEX uq_room_participants_user ON room_participants (room_id, user_id) WHERE user_id IS NOT NULL AND status IN ('pending', 'approved')",
    );
    await queryRunner.query(
      "CREATE UNIQUE INDEX uq_room_participants_guest ON room_participants (room_id, guest_id) WHERE guest_id IS NOT NULL AND status IN ('pending', 'approved')",
    );
    await queryRunner.query(
      "CREATE UNIQUE INDEX uq_room_participants_seat ON room_participants (room_id, seat) WHERE seat IS NOT NULL AND status = 'approved'",
    );
    await queryRunner.query(
      "CREATE UNIQUE INDEX uq_room_participants_name ON room_participants (room_id, lower(display_name)) WHERE status IN ('pending', 'approved')",
    );
    await queryRunner.query(
      "CREATE INDEX ix_room_participants_active ON room_participants (room_id) WHERE status IN ('pending', 'approved')",
    );

    await queryRunner.query(`
      CREATE TABLE room_bans (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id           uuid NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
        user_id           uuid REFERENCES users (id) ON DELETE CASCADE,
        guest_id          uuid,
        display_name      varchar(32) NOT NULL,
        banned_by_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
        created_at        timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_room_bans_identity CHECK ((user_id IS NULL) <> (guest_id IS NULL))
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX uq_room_bans_user ON room_bans (room_id, user_id) WHERE user_id IS NOT NULL',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX uq_room_bans_guest ON room_bans (room_id, guest_id) WHERE guest_id IS NOT NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE room_bans');
    await queryRunner.query('DROP TABLE room_participants');
    await queryRunner.query('DROP TABLE rooms');
  }
}
