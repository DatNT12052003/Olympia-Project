import type { PublicationStatus, RoundKey, SnapshotQuestion } from '@olympia/shared';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Nội dung bộ đề tại thời điểm gửi duyệt (DL-033). */
export interface SetSnapshot {
  items: {
    round: RoundKey | null;
    question: Omit<SnapshotQuestion, 'media'> & { mediaId: string | null };
  }[];
}

/** Một lần chia sẻ public của bộ đề (5.4, BR-QB-09). */
@Entity({ name: 'question_set_versions' })
export class QuestionSetVersionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'set_id', type: 'uuid' })
  setId!: string;

  @Column({ name: 'version_no', type: 'integer' })
  versionNo!: number;

  @Column({ type: 'text' })
  status!: PublicationStatus;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  subject!: string | null;

  @Column({ type: 'smallint', nullable: true })
  grade!: number | null;

  @Column({ name: 'question_count', type: 'integer' })
  questionCount!: number;

  @Column({ type: 'jsonb' })
  snapshot!: SetSnapshot;

  @Column({ name: 'submitted_by', type: 'uuid' })
  submittedBy!: string;

  @Column({ name: 'submitted_at', type: 'timestamptz' })
  submittedAt!: Date;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy!: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @Column({ name: 'review_reason', type: 'varchar', length: 500, nullable: true })
  reviewReason!: string | null;
}
