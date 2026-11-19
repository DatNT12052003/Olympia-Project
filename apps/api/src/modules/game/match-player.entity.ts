import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Người chơi của trận theo ghế, giữ tên hiển thị tại thời điểm thi (BR-AUTH-06). */
@Entity({ name: 'match_players' })
export class MatchPlayerEntity {
  @PrimaryColumn({ name: 'match_id', type: 'uuid' })
  matchId!: string;

  @PrimaryColumn({ type: 'smallint' })
  seat!: number;

  @Column({ name: 'participant_id', type: 'uuid', nullable: true })
  participantId!: string | null;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ name: 'guest_id', type: 'uuid', nullable: true })
  guestId!: string | null;

  @Column({ name: 'display_name', type: 'varchar', length: 32 })
  displayName!: string;

  @Column({ name: 'final_score', type: 'integer', nullable: true })
  finalScore!: number | null;

  @Column({ type: 'boolean', default: false })
  eliminated!: boolean;
}
