import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Người bị cấm không vào lại được phòng (BR-JOIN-03). */
@Entity({ name: 'room_bans' })
export class RoomBanEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'room_id', type: 'uuid' })
  roomId!: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ name: 'guest_id', type: 'uuid', nullable: true })
  guestId!: string | null;

  @Column({ name: 'display_name', type: 'varchar', length: 32 })
  displayName!: string;

  @Column({ name: 'banned_by_user_id', type: 'uuid', nullable: true })
  bannedByUserId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
