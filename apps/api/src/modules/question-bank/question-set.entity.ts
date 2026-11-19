import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Bộ đề của Host (5.3): bản làm việc, sửa được; chia sẻ public qua phiên bản snapshot. */
@Entity({ name: 'question_sets' })
export class QuestionSetEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'owner_user_id', type: 'uuid' })
  ownerUserId!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  subject!: string | null;

  @Column({ type: 'smallint', nullable: true })
  grade!: number | null;

  /** Sao chép từ phiên bản bộ public nào (BR-QB-05). */
  @Column({ name: 'copied_from_version_id', type: 'uuid', nullable: true })
  copiedFromVersionId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
