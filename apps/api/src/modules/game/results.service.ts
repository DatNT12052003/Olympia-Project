import {
  DELETED_PLAYER_NAME,
  type HistoryItem,
  type HistoryList,
  type historyQuerySchema,
  type HostStats,
  type MatchOutcome,
  type MatchResult,
  type MyStats,
  type PlayerStats,
  ResultsErrorCode,
} from '@olympia/shared';
import type { DataSource, EntityManager } from 'typeorm';
import type { z } from 'zod';
import type { Principal, UserPrincipal } from '../../shared/auth/principal';
import { ConflictError, ForbiddenError, NotFoundError } from '../../shared/errors/app-error';
import { writeAuditLog } from '../audit/audit-log';
import type { MediaService } from '../media/media.service';
import type { MatchState } from './engine/match-state';
import { MatchPlayerEntity } from './match-player.entity';
import { MatchQuestionEntity, MatchQuestionOutcomeEntity } from './match-records.entity';
import { MatchEntity } from './match.entity';

export interface ResultsServiceDeps {
  dataSource: DataSource;
  media: Pick<MediaService, 'viewsFor'>;
  /** Người xem đã ở trong phòng (khán giả) — Room Management. */
  wasRoomMember(roomId: string, principal: Principal): Promise<boolean>;
  /** Số phòng Host đã tạo — Room Management. */
  countHostedRooms(hostUserId: string): Promise<number>;
  /** Super Admin xem mọi trận; Manager xem trận của Host thuộc tổ chức mình (DL-005). */
  staffCanView(actor: UserPrincipal, hostUserId: string): Promise<boolean>;
}

const HARD_QUESTION_LIMIT = 5;

function outcomeOf(match: Pick<MatchEntity, 'endReason' | 'voidedAt'>): MatchOutcome {
  if (match.voidedAt) return 'voided';
  if (match.endReason === 'host') return 'ended_early';
  if (match.endReason === 'abnormal') return 'abnormal';
  return 'completed';
}

/** Điều kiện SQL theo trạng thái hiển thị (alias `m`). */
const OUTCOME_SQL: Record<MatchOutcome, string> = {
  completed: "m.voided_at IS NULL AND m.end_reason = 'completed'",
  ended_early: "m.voided_at IS NULL AND m.end_reason = 'host'",
  abnormal: "m.voided_at IS NULL AND m.end_reason = 'abnormal'",
  voided: 'm.voided_at IS NOT NULL',
};

interface RankInput {
  seat: number;
  score: number;
}

/**
 * Thứ hạng theo điểm; người thắng câu hỏi phụ đứng trên những người cùng điểm (9.3). Hạng bằng
 * 1 + số người đứng trên (đồng hạng khi bằng điểm và không có câu hỏi phụ).
 */
export function rankPlayers(
  players: RankInput[],
  tiebreakWinner: number | null,
): Map<number, number> {
  const ahead = (a: RankInput, b: RankInput) =>
    a.score > b.score || (a.score === b.score && a.seat === tiebreakWinner && b.seat !== a.seat);
  return new Map(
    players.map((p) => [p.seat, 1 + players.filter((other) => ahead(other, p)).length]),
  );
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Kết quả trận, lịch sử và thống kê (mục 9.4, 14). Kết quả trận đã kết thúc không sửa được; chỉ
 * Super Admin hủy được kết quả, có lý do (BR-HIST-01).
 */
export function createResultsService(deps: ResultsServiceDeps) {
  const { dataSource } = deps;

  async function loadFinished(manager: EntityManager, matchId: string): Promise<MatchEntity> {
    const match = await manager.findOneBy(MatchEntity, { id: matchId });
    if (!match) throw new NotFoundError('Không tìm thấy trận đấu.');
    if (match.status !== 'finished' || !match.endedAt) {
      throw new ConflictError('Trận đấu chưa kết thúc.', ResultsErrorCode.MatchNotFinished);
    }
    return match;
  }

  /** Vai trò người xem với trận; `null` nếu không được xem (trả 404 để không lộ trận). */
  async function viewerOf(
    match: MatchEntity,
    players: MatchPlayerEntity[],
    principal: Principal,
  ): Promise<{ role: MatchResult['viewer']['role']; seat: number | null } | null> {
    if (principal.kind === 'user') {
      if (match.hostUserId === principal.userId) return { role: 'host', seat: null };
      const own = players.find((p) => p.userId === principal.userId);
      if (own) return { role: 'player', seat: own.seat };
    } else {
      const own = players.find((p) => p.guestId === principal.guestId);
      if (own) return { role: 'player', seat: own.seat };
    }
    if (await deps.wasRoomMember(match.roomId, principal)) return { role: 'spectator', seat: null };
    if (principal.kind === 'user' && (await deps.staffCanView(principal, match.hostUserId))) {
      return { role: 'staff', seat: null };
    }
    return null;
  }

  async function historyRows(
    principal: Principal,
    filters: z.output<typeof historyQuerySchema>,
  ): Promise<HistoryList> {
    const where: string[] = ["m.status = 'finished'"];
    const params: unknown[] = [];
    const param = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };

    if (filters.scope === 'hosted') {
      if (principal.kind !== 'user') throw new ForbiddenError();
      where.push(`m.host_user_id = ${param(principal.userId)}`);
    } else if (filters.scope === 'played') {
      where.push(
        principal.kind === 'user'
          ? `EXISTS (SELECT 1 FROM match_players mp WHERE mp.match_id = m.id AND mp.user_id = ${param(principal.userId)})`
          : `EXISTS (SELECT 1 FROM match_players mp WHERE mp.match_id = m.id AND mp.guest_id = ${param(principal.guestId)})`,
      );
    } else if (principal.kind !== 'user' || principal.systemRole !== 'super_admin') {
      throw new ForbiddenError();
    }
    if (filters.q) {
      const like = param(`%${escapeLike(filters.q)}%`);
      where.push(
        `(m.room_name ILIKE ${like} OR EXISTS (SELECT 1 FROM match_players mq WHERE mq.match_id = m.id AND mq.display_name ILIKE ${like}))`,
      );
    }
    if (filters.days) {
      where.push(`m.ended_at >= now() - make_interval(days => ${param(filters.days)})`);
    }
    if (filters.status) where.push(OUTCOME_SQL[filters.status]);

    const clause = where.join(' AND ');
    const [{ total }] = await dataSource.query<[{ total: number }]>(
      `SELECT count(*)::int AS total FROM matches m WHERE ${clause}`,
      params,
    );
    const rows = await dataSource.query<
      {
        id: string;
        room_name: string;
        started_at: Date;
        ended_at: Date;
        end_reason: MatchEntity['endReason'];
        voided_at: Date | null;
        tiebreak_winner: number | null;
      }[]
    >(
      `SELECT m.id, m.room_name, m.started_at, m.ended_at, m.end_reason, m.voided_at,
              (m.state->>'tiebreakWinner')::int AS tiebreak_winner
         FROM matches m
        WHERE ${clause}
        ORDER BY m.ended_at DESC, m.id
        LIMIT ${param(filters.pageSize)} OFFSET ${param((filters.page - 1) * filters.pageSize)}`,
      params,
    );

    const ids = rows.map((r) => r.id);
    const players =
      ids.length === 0
        ? []
        : await dataSource
            .getRepository(MatchPlayerEntity)
            .createQueryBuilder('p')
            .where('p.matchId IN (:...ids)', { ids })
            .orderBy('p.seat', 'ASC')
            .getMany();

    const items: HistoryItem[] = rows.map((row) => {
      const own = players.filter((p) => p.matchId === row.id);
      const outcome = outcomeOf({ endReason: row.end_reason, voidedAt: row.voided_at });
      const list = own.map((p) => ({
        seat: p.seat,
        displayName: p.displayName,
        score: p.finalScore,
      }));
      const ranks = rankPlayers(
        list.map((p) => ({ seat: p.seat, score: p.score ?? 0 })),
        row.tiebreak_winner,
      );
      const mine = own.find((p) =>
        principal.kind === 'user' ? p.userId === principal.userId : p.guestId === principal.guestId,
      );
      return {
        matchId: row.id,
        roomName: row.room_name,
        startedAt: row.started_at.toISOString(),
        endedAt: row.ended_at.toISOString(),
        durationSeconds: Math.max(
          0,
          Math.round((row.ended_at.getTime() - row.started_at.getTime()) / 1000),
        ),
        players: list,
        winners: outcome === 'voided' ? [] : list.filter((p) => ranks.get(p.seat) === 1),
        outcome,
        mySeat: mine?.seat ?? null,
      };
    });
    return { items, page: filters.page, pageSize: filters.pageSize, total };
  }

  async function playerStats(principal: Principal): Promise<PlayerStats> {
    const identity =
      principal.kind === 'user'
        ? { column: 'user_id', id: principal.userId }
        : { column: 'guest_id', id: principal.guestId };
    const matches = await dataSource.query<
      { id: string; seat: number; tiebreak_winner: number | null }[]
    >(
      `SELECT m.id, mp.seat, (m.state->>'tiebreakWinner')::int AS tiebreak_winner
         FROM matches m
         JOIN match_players mp ON mp.match_id = m.id AND mp.${identity.column} = $1
        WHERE m.status = 'finished' AND m.voided_at IS NULL`,
      [identity.id],
    );

    let wins = 0;
    if (matches.length > 0) {
      const scores = await dataSource
        .getRepository(MatchPlayerEntity)
        .createQueryBuilder('p')
        .where('p.matchId IN (:...ids)', { ids: matches.map((m) => m.id) })
        .getMany();
      for (const match of matches) {
        const ranks = rankPlayers(
          scores
            .filter((p) => p.matchId === match.id)
            .map((p) => ({ seat: p.seat, score: p.finalScore ?? 0 })),
          match.tiebreak_winner,
        );
        if (ranks.get(match.seat) === 1) wins += 1;
      }
    }

    const groups = await dataSource.query<
      { subject: string | null; topic: string | null; correct: number; total: number }[]
    >(
      `SELECT q.subject, q.topic,
              count(*) FILTER (WHERE o.result = 'correct')::int AS correct,
              count(*)::int AS total
         FROM match_question_outcomes o
         JOIN match_questions q ON q.match_id = o.match_id AND q.question_ref = o.question_ref
         JOIN match_players mp ON mp.match_id = o.match_id AND mp.seat = o.seat
         JOIN matches m ON m.id = o.match_id
        WHERE mp.${identity.column} = $1 AND m.voided_at IS NULL
        GROUP BY q.subject, q.topic
        ORDER BY total DESC, q.subject NULLS LAST, q.topic NULLS LAST`,
      [identity.id],
    );

    return {
      matches: matches.length,
      wins,
      correct: groups.reduce((sum, g) => sum + g.correct, 0),
      answered: groups.reduce((sum, g) => sum + g.total, 0),
      bySubject: groups,
    };
  }

  async function hostStats(userId: string): Promise<HostStats> {
    const [summary] = await dataSource.query<[{ matches: number; players: number }]>(
      `SELECT count(DISTINCT m.id)::int AS matches,
              count(DISTINCT coalesce(mp.user_id, mp.guest_id))::int AS players
         FROM matches m
         LEFT JOIN match_players mp ON mp.match_id = m.id
        WHERE m.host_user_id = $1 AND m.status = 'finished' AND m.voided_at IS NULL`,
      [userId],
    );
    const [accuracy] = await dataSource.query<[{ correct: number; total: number }]>(
      `SELECT count(*) FILTER (WHERE o.result = 'correct')::int AS correct, count(*)::int AS total
         FROM match_question_outcomes o
         JOIN matches m ON m.id = o.match_id
        WHERE m.host_user_id = $1 AND m.voided_at IS NULL`,
      [userId],
    );
    const hard = await dataSource.query<
      { source_question_id: string | null; content: string; wrong: number; total: number }[]
    >(
      `SELECT q.source_question_id, min(q.question->>'content') AS content,
              count(*) FILTER (WHERE o.result = 'wrong')::int AS wrong,
              count(*)::int AS total
         FROM match_question_outcomes o
         JOIN match_questions q ON q.match_id = o.match_id AND q.question_ref = o.question_ref
         JOIN matches m ON m.id = o.match_id
        WHERE m.host_user_id = $1 AND m.voided_at IS NULL
        GROUP BY q.source_question_id
       HAVING count(*) FILTER (WHERE o.result = 'wrong') > 0
        ORDER BY count(*) FILTER (WHERE o.result = 'wrong')::float / count(*) DESC, wrong DESC
        LIMIT ${HARD_QUESTION_LIMIT}`,
      [userId],
    );

    return {
      rooms: await deps.countHostedRooms(userId),
      matches: summary.matches,
      players: summary.players,
      correct: accuracy.correct,
      answered: accuracy.total,
      hardQuestions: hard.map((h) => ({
        sourceQuestionId: h.source_question_id,
        content: h.content,
        wrong: h.wrong,
        total: h.total,
      })),
    };
  }

  return {
    rankPlayers,

    history: historyRows,

    async stats(principal: Principal): Promise<MyStats> {
      const canHost =
        principal.kind === 'user' &&
        principal.emailVerified &&
        (principal.canHost || principal.systemRole !== 'member');
      return {
        player: await playerStats(principal),
        host: principal.kind === 'user' && canHost ? await hostStats(principal.userId) : null,
      };
    },

    /** Tổng kết trận (9.4): thứ hạng, điểm từng vòng, thống kê từng Player, đáp án (tùy Host). */
    async result(principal: Principal, matchId: string): Promise<MatchResult> {
      const match = await dataSource.getRepository(MatchEntity).findOneBy({ id: matchId });
      if (!match || match.status !== 'finished' || !match.endedAt) {
        throw new NotFoundError('Không tìm thấy kết quả trận.');
      }
      const players = await dataSource
        .getRepository(MatchPlayerEntity)
        .find({ where: { matchId }, order: { seat: 'ASC' } });
      const viewer = await viewerOf(match, players, principal);
      if (!viewer) throw new NotFoundError('Không tìm thấy kết quả trận.');

      const state = match.state as MatchState;
      const questions = await dataSource
        .getRepository(MatchQuestionEntity)
        .find({ where: { matchId }, order: { roundIndex: 'ASC', ordinal: 'ASC' } });
      const outcomes = await dataSource
        .getRepository(MatchQuestionOutcomeEntity)
        .findBy({ matchId });

      const tiebreakWinner = state.tiebreakWinner ?? null;
      const scoreOf = (seat: number) =>
        players.find((p) => p.seat === seat)?.finalScore ??
        state.players.find((p) => p.seat === seat)?.score ??
        0;
      const ranks = rankPlayers(
        players.map((p) => ({ seat: p.seat, score: scoreOf(p.seat) })),
        tiebreakWinner,
      );
      const voided = match.voidedAt !== null;

      const resultPlayers = players
        .map((p) => {
          const own = outcomes.filter((o) => o.seat === p.seat);
          const timed = own.filter((o) => o.elapsedMs !== null);
          const statePlayer = state.players.find((s) => s.seat === p.seat);
          const rank = ranks.get(p.seat) ?? players.length;
          return {
            seat: p.seat,
            displayName: p.displayName,
            rank,
            score: scoreOf(p.seat),
            roundScores: statePlayer?.roundScores ?? [],
            winner: !voided && rank === 1,
            eliminated: p.eliminated,
            wonTiebreak: !voided && tiebreakWinner === p.seat,
            stats: {
              correct: own.filter((o) => o.result === 'correct').length,
              wrong: own.filter((o) => o.result === 'wrong').length,
              skipped: own.filter((o) => o.result === 'skipped').length,
              avgAnswerMs:
                timed.length === 0
                  ? null
                  : Math.round(timed.reduce((sum, o) => sum + o.elapsedMs!, 0) / timed.length),
              buzzWins: own.filter((o) => o.buzzWon).length,
            },
          };
        })
        .sort((a, b) => a.rank - b.rank || a.seat - b.seat);

      const hardQuestions = questions
        .map((q) => {
          const own = outcomes.filter((o) => o.questionRef === q.questionRef);
          return {
            ref: q.questionRef,
            content: q.question.content,
            wrong: own.filter((o) => o.result === 'wrong').length,
            total: own.length,
          };
        })
        .filter((q) => q.wrong > 0)
        .sort((a, b) => b.wrong / b.total - a.wrong / a.total || b.wrong - a.wrong)
        .slice(0, HARD_QUESTION_LIMIT);

      const privileged = viewer.role === 'host' || viewer.role === 'staff';
      const showAnswers = privileged || match.answersPublic;
      let questionViews: MatchResult['questions'] = null;
      if (showAnswers) {
        const media = await deps.media.viewsFor(questions.map((q) => q.question.mediaId));
        questionViews = questions.map((q) => ({
          ref: q.questionRef,
          roundIndex: q.roundIndex,
          content: q.question.content,
          media: q.question.mediaId ? (media.get(q.question.mediaId) ?? null) : null,
          answer: q.question.answer,
          explanation: q.question.explanation,
          outcomes: outcomes
            .filter((o) => o.questionRef === q.questionRef)
            .sort((a, b) => a.seat - b.seat)
            .map((o) => ({ seat: o.seat, result: o.result })),
        }));
      }

      return {
        matchId: match.id,
        roomId: match.roomId,
        roomName: match.roomName,
        scriptName: match.scriptSnapshot.name,
        startedAt: match.startedAt.toISOString(),
        endedAt: match.endedAt.toISOString(),
        outcome: outcomeOf(match),
        voided:
          match.voidedAt && match.voidReason
            ? { at: match.voidedAt.toISOString(), reason: match.voidReason }
            : null,
        rounds: state.rounds,
        players: resultPlayers,
        hardQuestions,
        answersPublic: match.answersPublic,
        questions: questionViews,
        viewer: {
          role: viewer.role,
          seat: viewer.seat,
          canToggleAnswers: viewer.role === 'host',
          canVoid: principal.kind === 'user' && principal.systemRole === 'super_admin' && !voided,
        },
      };
    },

    /** Host bật/tắt công bố đáp án cho Player và khán giả (DL-048). */
    async setAnswersPublic(
      actor: UserPrincipal,
      matchId: string,
      answersPublic: boolean,
    ): Promise<void> {
      await dataSource.transaction(async (manager) => {
        const match = await loadFinished(manager, matchId);
        if (match.hostUserId !== actor.userId) throw new NotFoundError('Không tìm thấy trận đấu.');
        await manager.update(MatchEntity, { id: matchId }, { answersPublic });
      });
    },

    /** Super Admin hủy kết quả trận, có lý do (BR-HIST-01). */
    async voidResult(actor: UserPrincipal, matchId: string, reason: string): Promise<void> {
      if (actor.systemRole !== 'super_admin') throw new ForbiddenError();
      await dataSource.transaction(async (manager) => {
        const match = await loadFinished(manager, matchId);
        if (match.voidedAt) {
          throw new ConflictError('Kết quả trận đã bị hủy.', ResultsErrorCode.MatchAlreadyVoided);
        }
        await manager.update(
          MatchEntity,
          { id: matchId },
          { voidedAt: new Date(), voidedBy: actor.userId, voidReason: reason },
        );
        await writeAuditLog(manager, {
          actorUserId: actor.userId,
          action: 'match.void',
          targetType: 'match',
          targetId: matchId,
          details: { reason, roomName: match.roomName },
        });
      });
    },

    /** Ẩn danh người chơi đã xóa tài khoản trong lịch sử trận (BR-DATA-03). */
    async anonymizePlayer(manager: EntityManager, userId: string): Promise<void> {
      await manager.update(
        MatchPlayerEntity,
        { userId },
        { displayName: DELETED_PLAYER_NAME, userId: null },
      );
    },
  };
}

export type ResultsService = ReturnType<typeof createResultsService>;
