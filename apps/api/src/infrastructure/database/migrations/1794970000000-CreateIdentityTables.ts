import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bảng tài khoản, tổ chức, phiên đăng nhập và token một lần (P1).
 *
 * - Vai trò/trạng thái dùng `text` + CHECK thay vì enum type để dễ mở rộng bằng migration sau.
 * - Token (refresh, xác minh email, đặt lại mật khẩu) chỉ lưu SHA-256, không lưu bản gốc.
 */
export class CreateIdentityTables1794970000000 implements MigrationInterface {
  name = 'CreateIdentityTables1794970000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE organizations (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name        citext NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_organizations_name UNIQUE (name)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE users (
        id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email               citext NOT NULL,
        password_hash       text NOT NULL,
        display_name        varchar(32) NOT NULL,
        avatar_url          text,
        email_verified_at   timestamptz,
        system_role         text NOT NULL DEFAULT 'member',
        can_host            boolean NOT NULL DEFAULT true,
        status              text NOT NULL DEFAULT 'active',
        locked_at           timestamptz,
        locked_reason       varchar(500),
        organization_id     uuid REFERENCES organizations (id) ON DELETE SET NULL,
        privacy_accepted_at timestamptz NOT NULL,
        created_at          timestamptz NOT NULL DEFAULT now(),
        updated_at          timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_users_email UNIQUE (email),
        CONSTRAINT ck_users_system_role CHECK (system_role IN ('member', 'manager', 'super_admin')),
        CONSTRAINT ck_users_status CHECK (status IN ('active', 'locked')),
        CONSTRAINT ck_users_locked_at CHECK ((status = 'locked') = (locked_at IS NOT NULL))
      )
    `);
    // Manager lọc người dùng theo tổ chức mình quản lý.
    await queryRunner.query(
      'CREATE INDEX ix_users_organization_id ON users (organization_id) WHERE organization_id IS NOT NULL',
    );

    // Một Manager quản lý một hoặc nhiều tổ chức (DL-005).
    await queryRunner.query(`
      CREATE TABLE organization_managers (
        organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
        user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        created_at      timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (organization_id, user_id)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_organization_managers_user_id ON organization_managers (user_id)',
    );

    // Mỗi lần đăng nhập là một phiên; thu hồi phiên vô hiệu hóa mọi refresh token của nó.
    await queryRunner.query(`
      CREATE TABLE auth_sessions (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id        uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        user_agent     varchar(500),
        ip             varchar(64),
        created_at     timestamptz NOT NULL DEFAULT now(),
        last_used_at   timestamptz NOT NULL DEFAULT now(),
        expires_at     timestamptz NOT NULL,
        revoked_at     timestamptz,
        revoked_reason varchar(32)
      )
    `);
    // Thu hồi mọi phiên còn hiệu lực của một người dùng (khóa tài khoản, đổi mật khẩu).
    await queryRunner.query(
      'CREATE INDEX ix_auth_sessions_user_active ON auth_sessions (user_id) WHERE revoked_at IS NULL',
    );

    // Refresh token xoay vòng: dùng lại token đã dùng => thu hồi cả phiên.
    await queryRunner.query(`
      CREATE TABLE auth_refresh_tokens (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id  uuid NOT NULL REFERENCES auth_sessions (id) ON DELETE CASCADE,
        token_hash  char(64) NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        used_at     timestamptz,
        CONSTRAINT uq_auth_refresh_tokens_hash UNIQUE (token_hash)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_auth_refresh_tokens_session_id ON auth_refresh_tokens (session_id)',
    );

    await queryRunner.query(`
      CREATE TABLE user_action_tokens (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        purpose     text NOT NULL,
        token_hash  char(64) NOT NULL,
        expires_at  timestamptz NOT NULL,
        used_at     timestamptz,
        created_at  timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_user_action_tokens_hash UNIQUE (token_hash),
        CONSTRAINT ck_user_action_tokens_purpose
          CHECK (purpose IN ('email_verification', 'password_reset'))
      )
    `);
    // Vô hiệu hóa token cũ cùng mục đích khi phát token mới hoặc khi token được dùng.
    await queryRunner.query(
      'CREATE INDEX ix_user_action_tokens_user_purpose ON user_action_tokens (user_id, purpose) WHERE used_at IS NULL',
    );

    // Nhật ký quản trị (mục 15.1, BR-DATA-05).
    await queryRunner.query(`
      CREATE TABLE admin_audit_logs (
        id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        actor_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
        action        varchar(64) NOT NULL,
        target_type   varchar(32) NOT NULL,
        target_id     uuid,
        details       jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at    timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_admin_audit_logs_target ON admin_audit_logs (target_type, target_id, created_at DESC)',
    );
    await queryRunner.query(
      'CREATE INDEX ix_admin_audit_logs_created_at ON admin_audit_logs (created_at DESC)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE admin_audit_logs');
    await queryRunner.query('DROP TABLE user_action_tokens');
    await queryRunner.query('DROP TABLE auth_refresh_tokens');
    await queryRunner.query('DROP TABLE auth_sessions');
    await queryRunner.query('DROP TABLE organization_managers');
    await queryRunner.query('DROP TABLE users');
    await queryRunner.query('DROP TABLE organizations');
  }
}
