import type { ScriptRound, ScriptSettings } from '@olympia/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Kịch bản trận đấu của Host (mục 6), dùng lại cho nhiều phòng (BR-SCRIPT-02). */
@Entity({ name: 'match_scripts' })
export class MatchScriptEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'owner_user_id', type: 'uuid' })
  ownerUserId!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'jsonb' })
  settings!: ScriptSettings;

  @Column({ type: 'jsonb' })
  rounds!: ScriptRound[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  /** Xóa mềm: phòng đang tham chiếu bị bỏ chọn kịch bản. */
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
