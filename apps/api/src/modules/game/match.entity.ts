import type { ControlMode, MatchStatus } from '@olympia/shared';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { MatchEndReason, ScriptSnapshot } from './engine/match-state';

/** Một trận đấu trong phòng (mục 8). */
@Entity({ name: 'matches' })
export class MatchEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'room_id', type: 'uuid' })
  roomId!: string;

  @Column({ name: 'host_user_id', type: 'uuid' })
  hostUserId!: string;

  /** Tên phòng lúc thi (lịch sử, mục 14). */
  @Column({ name: 'room_name', type: 'varchar', length: 100, default: '' })
  roomName!: string;

  @Column({ name: 'script_id', type: 'uuid', nullable: true })
  scriptId!: string | null;

  @Column({ name: 'control_mode', type: 'text' })
  controlMode!: ControlMode;

  @Column({ type: 'text' })
  status!: MatchStatus;

  @Column({ name: 'end_reason', type: 'text', nullable: true })
  endReason!: MatchEndReason | null;

  /** Kịch bản và câu hỏi chốt lúc bắt đầu (BR-SCRIPT-03, BR-QB-04). */
  @Column({ name: 'script_snapshot', type: 'jsonb' })
  scriptSnapshot!: ScriptSnapshot;

  /** Checkpoint trạng thái trận (`MatchState`, DL-013). */
  @Column({ type: 'jsonb' })
  state!: object;

  @Column({ name: 'state_version', type: 'integer', default: 0 })
  stateVersion!: number;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt!: Date;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt!: Date | null;

  /** Player/khán giả xem được đáp án và giải thích ở trang tổng kết (9.4, DL-048). */
  @Column({ name: 'answers_public', type: 'boolean', default: false })
  answersPublic!: boolean;

  /** Super Admin hủy kết quả (BR-HIST-01). */
  @Column({ name: 'voided_at', type: 'timestamptz', nullable: true })
  voidedAt!: Date | null;

  @Column({ name: 'voided_by', type: 'uuid', nullable: true })
  voidedBy!: string | null;

  @Column({ name: 'void_reason', type: 'varchar', length: 500, nullable: true })
  voidReason!: string | null;
}
