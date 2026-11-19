import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Một khóa cấu hình hệ thống do Super Admin sửa (DL-049). */
@Entity({ name: 'system_settings' })
export class SystemSettingEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  key!: string;

  @Column({ type: 'jsonb' })
  value!: unknown;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy!: string | null;
}
