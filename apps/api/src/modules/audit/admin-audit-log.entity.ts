import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Nhật ký hành động quản trị (mục 15.1), giữ theo BR-DATA-05. */
@Entity({ name: 'admin_audit_logs' })
export class AdminAuditLogEntity {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id!: string;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId!: string | null;

  @Column({ type: 'varchar', length: 64 })
  action!: string;

  @Column({ name: 'target_type', type: 'varchar', length: 32 })
  targetType!: string;

  @Column({ name: 'target_id', type: 'uuid', nullable: true })
  targetId!: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  details!: object;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
