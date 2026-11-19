import type { AnswerType, Difficulty, QuestionAnswer, RoundKey } from '@olympia/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'questions' })
export class QuestionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'owner_user_id', type: 'uuid' })
  ownerUserId!: string;

  @Column({ name: 'answer_type', type: 'text' })
  answerType!: AnswerType;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'jsonb' })
  answer!: QuestionAnswer;

  @Column({ type: 'text', nullable: true })
  explanation!: string | null;

  @Column({ name: 'media_id', type: 'uuid', nullable: true })
  mediaId!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  subject!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  topic!: string | null;

  @Column({ type: 'smallint', nullable: true })
  grade!: number | null;

  @Column({ type: 'text', nullable: true })
  difficulty!: Difficulty | null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  rounds!: RoundKey[];

  @Column({ name: 'default_points', type: 'integer', nullable: true })
  defaultPoints!: number | null;

  @Column({ name: 'default_time_seconds', type: 'integer', nullable: true })
  defaultTimeSeconds!: number | null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  tags!: string[];

  /** Nội dung + đáp án + thẻ đã chuẩn hóa (chữ thường, bỏ dấu) để tìm kiếm. */
  @Column({ name: 'search_text', type: 'text', default: '' })
  searchText!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  /** Xóa mềm (BR-QB-03). */
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
