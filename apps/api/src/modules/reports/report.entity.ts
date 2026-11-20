import type {
  ReportCategory,
  ReportResolution,
  ReportStatus,
  ReportTargetType,
} from '@olympia/shared';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Báo cáo vi phạm: câu hỏi public hoặc hành vi trong phòng (15.3, DL-050). */
@Entity({ name: 'reports' })
export class ReportEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'reporter_user_id', type: 'uuid', nullable: true })
  reporterUserId!: string | null;

  @Column({ name: 'target_type', type: 'text' })
  targetType!: ReportTargetType;

  @Column({ name: 'target_id', type: 'uuid' })
  targetId!: string;

  /** Tên phòng / bộ câu hỏi lúc báo cáo. */
  @Column({ name: 'target_label', type: 'varchar', length: 200 })
  targetLabel!: string;

  @Column({ name: 'subject_user_id', type: 'uuid', nullable: true })
  subjectUserId!: string | null;

  @Column({ name: 'subject_guest_id', type: 'uuid', nullable: true })
  subjectGuestId!: string | null;

  @Column({ name: 'subject_name', type: 'varchar', length: 32, nullable: true })
  subjectName!: string | null;

  /** Tổ chức của đối tượng (phạm vi xử lý của Manager, DL-005). */
  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;

  @Column({ type: 'text' })
  category!: ReportCategory;

  @Column({ type: 'varchar', length: 1000 })
  description!: string;

  @Column({ type: 'text', default: 'open' })
  status!: ReportStatus;

  @Column({ type: 'text', nullable: true })
  resolution!: ReportResolution | null;

  @Column({ name: 'resolution_note', type: 'varchar', length: 500, nullable: true })
  resolutionNote!: string | null;

  @Column({ name: 'resolved_by', type: 'uuid', nullable: true })
  resolvedBy!: string | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
