import type { RoundKey } from '@olympia/shared';
import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'question_set_items' })
export class QuestionSetItemEntity {
  @PrimaryColumn({ name: 'set_id', type: 'uuid' })
  setId!: string;

  @PrimaryColumn({ name: 'question_id', type: 'uuid' })
  questionId!: string;

  @Column({ type: 'text', nullable: true })
  round!: RoundKey | null;

  @Column({ type: 'integer' })
  position!: number;
}
