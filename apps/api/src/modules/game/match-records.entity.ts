import type { MatchRoundType, PlayerAnswer } from '@olympia/shared';
import { Column, CreateDateColumn, Entity, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import type { MatchQuestion } from './engine/match-state';

/** Câu hỏi đã dùng trong trận (mục 14), ghi khi rời vòng (DL-047). */
@Entity({ name: 'match_questions' })
export class MatchQuestionEntity {
  @PrimaryColumn({ name: 'match_id', type: 'uuid' })
  matchId!: string;

  @PrimaryColumn({ name: 'question_ref', type: 'varchar', length: 40 })
  questionRef!: string;

  @Column({ name: 'round_index', type: 'smallint' })
  roundIndex!: number;

  @Column({ name: 'round_type', type: 'text' })
  roundType!: MatchRoundType;

  /** Thứ tự câu trong vòng. */
  @Column({ type: 'smallint' })
  ordinal!: number;

  @Column({ name: 'source_question_id', type: 'uuid', nullable: true })
  sourceQuestionId!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  subject!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  topic!: string | null;

  @Column({ type: 'jsonb' })
  question!: MatchQuestion;
}

/** Kết quả của một ghế ở một câu (thống kê 9.4). */
@Entity({ name: 'match_question_outcomes' })
export class MatchQuestionOutcomeEntity {
  @PrimaryColumn({ name: 'match_id', type: 'uuid' })
  matchId!: string;

  @PrimaryColumn({ name: 'question_ref', type: 'varchar', length: 40 })
  questionRef!: string;

  @PrimaryColumn({ type: 'smallint' })
  seat!: number;

  @Column({ type: 'text' })
  result!: 'correct' | 'wrong' | 'skipped';

  @Column({ name: 'elapsed_ms', type: 'integer', nullable: true })
  elapsedMs!: number | null;

  @Column({ name: 'buzz_won', type: 'boolean', default: false })
  buzzWon!: boolean;
}

/** Câu trả lời của Player, thời điểm nhận theo server (BR-R3-01). */
@Entity({ name: 'match_answers' })
export class MatchAnswerEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'match_id', type: 'uuid' })
  matchId!: string;

  @Column({ name: 'round_index', type: 'smallint' })
  roundIndex!: number;

  @Column({ name: 'question_ref', type: 'varchar', length: 40 })
  questionRef!: string;

  @Column({ type: 'smallint' })
  seat!: number;

  @Column({ type: 'jsonb' })
  answer!: PlayerAnswer;

  @Column({ name: 'auto_result', type: 'text', nullable: true })
  autoResult!: 'correct' | 'wrong' | null;

  @Column({ name: 'received_at', type: 'timestamptz' })
  receivedAt!: Date;

  @Column({ name: 'elapsed_ms', type: 'integer' })
  elapsedMs!: number;
}

/** Một lần thay đổi điểm (BR-SCORE-04); tổng `delta` theo ghế = điểm hiện tại. */
@Entity({ name: 'match_score_events' })
export class MatchScoreEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'match_id', type: 'uuid' })
  matchId!: string;

  @Column({ type: 'integer' })
  seq!: number;

  @Column({ type: 'smallint' })
  seat!: number;

  @Column({ name: 'round_index', type: 'smallint' })
  roundIndex!: number;

  @Column({ name: 'question_ref', type: 'varchar', length: 40, nullable: true })
  questionRef!: string | null;

  /** Điểm thực cộng/trừ (sau khi áp quy tắc không âm, BR-SCORE-03). */
  @Column({ type: 'integer' })
  delta!: number;

  /** Điểm theo luật trước khi áp quy tắc không âm. */
  @Column({ type: 'integer' })
  nominal!: number;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  note!: string | null;

  @Column({ type: 'text' })
  actor!: 'system' | 'host';

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

/** Nhật ký can thiệp của Host: thời gian, người thực hiện, trước/sau, lý do (BR-GAME-07). */
@Entity({ name: 'match_interventions' })
export class MatchInterventionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'match_id', type: 'uuid' })
  matchId!: string;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId!: string | null;

  @Column({ type: 'varchar', length: 40 })
  action!: string;

  @Column({ type: 'jsonb' })
  detail!: object;

  @Column({ type: 'varchar', length: 200, nullable: true })
  reason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
