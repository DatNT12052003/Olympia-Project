import { randomUUID } from 'node:crypto';
import {
  MatchErrorCode,
  ROUND_TITLES,
  roundRequirement,
  withSettingDefaults,
} from '@olympia/shared';
import type { UserPrincipal } from '../../shared/auth/principal';
import { ConflictError } from '../../shared/errors/app-error';
import type { QuestionSourcesService } from '../question-bank/question-sources.service';
import type { RoomsService } from '../rooms/rooms.service';
import type { ScriptsService } from '../scripts/scripts.service';
import { createInitialState } from './engine/match-engine';
import type { MatchState, ScriptSnapshot } from './engine/match-state';
import { roundPlugin } from './engine/round-registry';
import type { MatchRuntime } from './match-runtime';
import { MatchPlayerEntity } from './match-player.entity';
import { MatchEntity } from './match.entity';

export interface MatchServiceDeps {
  rooms: Pick<RoomsService, 'beginMatch'>;
  scripts: Pick<ScriptsService, 'loadForMatch'>;
  sources: Pick<QuestionSourcesService, 'load'>;
  runtime: Pick<MatchRuntime, 'initialize'>;
  now?: () => number;
}

/** Bắt đầu trận (8.3): chốt kịch bản và câu hỏi (BR-SCRIPT-03), kiểm tra đủ câu (BR-SCRIPT-01). */
export function createMatchService(deps: MatchServiceDeps) {
  const now = deps.now ?? Date.now;

  return {
    async start(
      actor: UserPrincipal,
      roomId: string,
      options: { skipReady: boolean },
    ): Promise<{ matchId: string }> {
      const { state, snapshot } = await deps.rooms.beginMatch(
        actor,
        roomId,
        options,
        async (manager, room, players) => {
          const script = room.scriptId
            ? await deps.scripts.loadForMatch(actor.userId, room.scriptId)
            : null;
          if (!script) {
            throw new ConflictError(
              'Phòng chưa có kịch bản. Hãy chọn kịch bản trước khi bắt đầu.',
              MatchErrorCode.ScriptMissing,
            );
          }

          const rounds: ScriptSnapshot['rounds'] = [];
          for (const [index, round] of script.rounds.entries()) {
            const title = `Vòng ${index + 1} (${ROUND_TITLES[round.type]})`;
            if (!round.source) {
              throw new ConflictError(
                `${title} chưa chọn nguồn câu hỏi.`,
                MatchErrorCode.ScriptInvalid,
              );
            }
            const questions = await deps.sources.load(actor.userId, round.source, round.type);
            const requirement = roundRequirement(round);
            const needed = requirement.fixed + requirement.perPlayer * players.length;
            if (questions.length < needed) {
              throw new ConflictError(
                `${title} cần ${needed} câu hỏi cho ${players.length} người chơi, nguồn đang có ${questions.length} câu.`,
                MatchErrorCode.ScriptInvalid,
              );
            }
            const invalid = roundPlugin(round.type).validate?.(round, questions);
            if (invalid) throw new ConflictError(invalid, MatchErrorCode.ScriptInvalid);
            rounds.push({ round, questions });
          }
          const snapshot: ScriptSnapshot = {
            scriptId: script.id,
            name: script.name,
            settings: withSettingDefaults(script.settings),
            rounds,
          };

          const matchId = randomUUID();
          const startedAt = now();
          const state: MatchState = createInitialState({
            matchId,
            roomId,
            hostKey: `u:${actor.userId}`,
            snapshot,
            players: players.map((p) => ({
              seat: p.seat,
              displayName: p.displayName,
              kind: p.userId ? 'user' : 'guest',
              key: p.userId ? `u:${p.userId}` : `g:${p.guestId}`,
            })),
            mode: room.controlMode,
            now: startedAt,
          });
          await manager.insert(MatchEntity, {
            id: matchId,
            roomId,
            hostUserId: actor.userId,
            roomName: room.name,
            scriptId: script.id,
            controlMode: room.controlMode,
            status: 'running',
            endReason: null,
            scriptSnapshot: snapshot,
            state,
            stateVersion: state.version,
            startedAt: new Date(startedAt),
            endedAt: null,
          });
          await manager.insert(
            MatchPlayerEntity,
            players.map((p) => ({
              matchId,
              seat: p.seat,
              participantId: p.participantId,
              userId: p.userId,
              guestId: p.guestId,
              displayName: p.displayName,
              finalScore: null,
              eliminated: false,
            })),
          );
          return { state, snapshot };
        },
      );
      await deps.runtime.initialize(state, snapshot);
      return { matchId: state.matchId };
    },
  };
}

export type MatchService = ReturnType<typeof createMatchService>;
