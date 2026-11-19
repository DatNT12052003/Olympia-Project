import type { ControlMode, RoomStatus, RoomVisibility } from '@olympia/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'rooms' })
export class RoomEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'host_user_id', type: 'uuid' })
  hostUserId!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @Column({ name: 'max_players', type: 'smallint' })
  maxPlayers!: number;

  @Column({ type: 'text' })
  visibility!: RoomVisibility;

  @Column({ name: 'password_hash', type: 'text', nullable: true, select: false })
  passwordHash!: string | null;

  @Column({ name: 'allow_spectators', type: 'boolean', default: true })
  allowSpectators!: boolean;

  @Column({ name: 'max_spectators', type: 'integer', default: 50 })
  maxSpectators!: number;

  @Column({ name: 'allow_guests', type: 'boolean', default: true })
  allowGuests!: boolean;

  @Column({ name: 'auto_approve', type: 'boolean', default: false })
  autoApprove!: boolean;

  @Column({ name: 'control_mode', type: 'text', default: 'manual' })
  controlMode!: ControlMode;

  @Column({ name: 'reactions_enabled', type: 'boolean', default: true })
  reactionsEnabled!: boolean;

  /** Kịch bản đã chọn cho trận (mục 6). */
  @Column({ name: 'script_id', type: 'uuid', nullable: true })
  scriptId!: string | null;

  @Column({ type: 'text', default: 'draft' })
  status!: RoomStatus;

  @Column({ type: 'char', length: 6, nullable: true })
  code!: string | null;

  /** Tăng sau mỗi thay đổi trạng thái phòng (BR-RT-03). */
  @Column({ name: 'state_version', type: 'integer', default: 0 })
  stateVersion!: number;

  @Column({ name: 'opened_at', type: 'timestamptz', nullable: true })
  openedAt!: Date | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt!: Date | null;

  @Column({ name: 'closed_reason', type: 'varchar', length: 32, nullable: true })
  closedReason!: 'host' | 'inactive' | null;

  @Column({ name: 'last_activity_at', type: 'timestamptz' })
  lastActivityAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
