import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type SystemRoleValue = 'member' | 'manager' | 'super_admin';
export type UserStatusValue = 'active' | 'locked' | 'pending_deletion' | 'deleted';

@Entity({ name: 'users' })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** `citext`: so khớp không phân biệt hoa thường; ứng dụng vẫn chuẩn hóa về chữ thường. */
  @Column({ type: 'citext' })
  email!: string;

  @Column({ name: 'password_hash', type: 'text', select: false })
  passwordHash!: string;

  @Column({ name: 'display_name', type: 'varchar', length: 32 })
  displayName!: string;

  @Column({ name: 'avatar_url', type: 'text', nullable: true })
  avatarUrl!: string | null;

  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt!: Date | null;

  @Column({ name: 'system_role', type: 'text', default: 'member' })
  systemRole!: SystemRoleValue;

  @Column({ name: 'can_host', type: 'boolean', default: true })
  canHost!: boolean;

  @Column({ type: 'text', default: 'active' })
  status!: UserStatusValue;

  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt!: Date | null;

  @Column({ name: 'locked_reason', type: 'varchar', length: 500, nullable: true })
  lockedReason!: string | null;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;

  /** Thời điểm yêu cầu xóa tài khoản; hết ân hạn thì ẩn danh hóa (DL-008). */
  @Column({ name: 'deletion_requested_at', type: 'timestamptz', nullable: true })
  deletionRequestedAt!: Date | null;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  /** Số lần bị cảnh báo khi xử lý báo cáo vi phạm (DL-050). */
  @Column({ name: 'warning_count', type: 'integer', default: 0 })
  warningCount!: number;

  @Column({ name: 'privacy_accepted_at', type: 'timestamptz' })
  privacyAcceptedAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
