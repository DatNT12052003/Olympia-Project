import type { ParticipantRole } from '@olympia/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** `left`, `rejected`, `kicked` là trạng thái kết thúc; chỉ `pending`/`approved` đang hiệu lực. */
export type ParticipantStatusValue = 'pending' | 'approved' | 'left' | 'rejected' | 'kicked';

export const ACTIVE_PARTICIPANT_STATUSES: ParticipantStatusValue[] = ['pending', 'approved'];

@Entity({ name: 'room_participants' })
export class RoomParticipantEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'room_id', type: 'uuid' })
  roomId!: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ name: 'guest_id', type: 'uuid', nullable: true })
  guestId!: string | null;

  /** Tên trong phòng; duy nhất trong phòng (BR-AUTH-04). */
  @Column({ name: 'display_name', type: 'varchar', length: 32 })
  displayName!: string;

  @Column({ type: 'text' })
  role!: ParticipantRole;

  @Column({ type: 'text' })
  status!: ParticipantStatusValue;

  @Column({ type: 'smallint', nullable: true })
  seat!: number | null;

  @Column({ type: 'boolean', default: false })
  ready!: boolean;

  @CreateDateColumn({ name: 'joined_at', type: 'timestamptz' })
  joinedAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'left_at', type: 'timestamptz', nullable: true })
  leftAt!: Date | null;
}
