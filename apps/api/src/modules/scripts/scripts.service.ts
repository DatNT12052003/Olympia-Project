import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYABLE_ROUNDS,
  type RoundCheck,
  roundRequirement,
  type ScriptDetail,
  ScriptErrorCode,
  type scriptInputSchema,
  type ScriptRound,
  type ScriptSummary,
  type SourceInfo,
  supportedPlayersFor,
} from '@olympia/shared';
import { type DataSource, In, IsNull } from 'typeorm';
import type { z } from 'zod';
import type { UserPrincipal } from '../../shared/auth/principal';
import { BadRequestError, NotFoundError } from '../../shared/errors/app-error';
import type { QuestionSourcesService } from '../question-bank/question-sources.service';
import type { RoomScripts } from '../rooms/rooms.service';
import { MatchScriptEntity } from './match-script.entity';

type ScriptInput = z.output<typeof scriptInputSchema>;

export interface ScriptsServiceDeps {
  dataSource: DataSource;
  sources: Pick<QuestionSourcesService, 'assertSelectable' | 'describe'>;
}

const LIST_LIMIT = 100;

/** Đánh giá đủ câu của một vòng với nguồn hiện có (BR-SCRIPT-01). */
export function checkRound(round: ScriptRound, source: SourceInfo | null): RoundCheck {
  const requirement = roundRequirement(round);
  const issues: string[] = [];
  let supportedPlayers = 0;
  if (!source) {
    issues.push('Chưa chọn nguồn câu hỏi.');
  } else if (source.unavailable) {
    issues.push('Nguồn câu hỏi không còn dùng được, hãy chọn nguồn khác.');
  } else {
    supportedPlayers = supportedPlayersFor(source.available, requirement, MAX_PLAYERS);
    if (supportedPlayers < MIN_PLAYERS) {
      const needed = requirement.fixed + requirement.perPlayer * MIN_PLAYERS;
      issues.push(
        `Thiếu câu hỏi: cần ít nhất ${needed} câu xếp cho vòng này (đủ ${MIN_PLAYERS} người chơi), nguồn đang có ${source.available}.`,
      );
    }
  }
  return { ...requirement, supportedPlayers, issues };
}

/**
 * Kịch bản trận đấu (mục 6): Host tạo, sửa, nhân bản ("Lưu thành mẫu"), xóa; mọi kịch bản dùng lại
 * được cho nhiều phòng (BR-SCRIPT-02). Chỉ vòng đã có plugin mới được thêm (P4: Khởi động).
 */
export function createScriptsService({ dataSource, sources }: ScriptsServiceDeps) {
  const repo = dataSource.getRepository(MatchScriptEntity);

  async function loadOwn(actor: UserPrincipal, scriptId: string): Promise<MatchScriptEntity> {
    const script = await repo.findOneBy({
      id: scriptId,
      ownerUserId: actor.userId,
      deletedAt: IsNull(),
    });
    if (!script) throw new NotFoundError('Không tìm thấy kịch bản.');
    return script;
  }

  async function validate(
    actor: UserPrincipal,
    input: ScriptInput,
    previous: ScriptRound[] = [],
  ): Promise<void> {
    for (const round of input.rounds) {
      if (!(PLAYABLE_ROUNDS as readonly string[]).includes(round.type)) {
        throw new BadRequestError(
          'Vòng thi này chưa được hỗ trợ.',
          ScriptErrorCode.RoundNotSupported,
        );
      }
      if (round.source) {
        const before = previous.find((r) => r.type === round.type)?.source ?? null;
        await sources.assertSelectable(actor.userId, round.source, before);
      }
    }
  }

  async function roundsOf(script: MatchScriptEntity) {
    return Promise.all(
      script.rounds.map(async (round) => {
        const source = round.source
          ? await sources.describe(script.ownerUserId, round.source, round.type)
          : null;
        return { round, source, check: checkRound(round, source) };
      }),
    );
  }

  async function detail(script: MatchScriptEntity): Promise<ScriptDetail> {
    return {
      id: script.id,
      name: script.name,
      settings: script.settings,
      rounds: await roundsOf(script),
      updatedAt: script.updatedAt.toISOString(),
    };
  }

  return {
    async list(actor: UserPrincipal): Promise<ScriptSummary[]> {
      const scripts = await repo.find({
        where: { ownerUserId: actor.userId, deletedAt: IsNull() },
        order: { updatedAt: 'DESC' },
        take: LIST_LIMIT,
      });
      return Promise.all(
        scripts.map(async (script) => {
          const rounds = await roundsOf(script);
          return {
            id: script.id,
            name: script.name,
            rounds: script.rounds.map((r) => r.type),
            supportedPlayers: Math.min(...rounds.map((r) => r.check.supportedPlayers)),
            updatedAt: script.updatedAt.toISOString(),
          };
        }),
      );
    },

    async get(actor: UserPrincipal, scriptId: string): Promise<ScriptDetail> {
      return detail(await loadOwn(actor, scriptId));
    },

    async create(actor: UserPrincipal, input: ScriptInput): Promise<ScriptDetail> {
      await validate(actor, input);
      const script = await repo.save(
        repo.create({
          ownerUserId: actor.userId,
          name: input.name,
          settings: input.settings,
          rounds: input.rounds,
        }),
      );
      return detail(script);
    },

    async update(
      actor: UserPrincipal,
      scriptId: string,
      input: ScriptInput,
    ): Promise<ScriptDetail> {
      const script = await loadOwn(actor, scriptId);
      await validate(actor, input, script.rounds);
      script.name = input.name;
      script.settings = input.settings;
      script.rounds = input.rounds;
      // Trận đang diễn ra không bị ảnh hưởng: trận dùng snapshot (BR-SCRIPT-03).
      return detail(await repo.save(script));
    },

    /** "Lưu thành mẫu": tạo bản sao độc lập để dùng/chỉnh tiếp. */
    async duplicate(actor: UserPrincipal, scriptId: string, name?: string): Promise<ScriptDetail> {
      const source = await loadOwn(actor, scriptId);
      const copyName = name ?? `Bản sao – ${source.name}`.slice(0, 100);
      const script = await repo.save(
        repo.create({
          ownerUserId: actor.userId,
          name: copyName,
          settings: source.settings,
          rounds: source.rounds,
        }),
      );
      return detail(script);
    },

    /** Xóa mềm; phòng đang chọn kịch bản này sẽ phải chọn kịch bản khác trước khi bắt đầu. */
    async remove(actor: UserPrincipal, scriptId: string): Promise<void> {
      const script = await loadOwn(actor, scriptId);
      script.deletedAt = new Date();
      await repo.save(script);
    },

    /** Kịch bản còn hiệu lực của Host (Game Engine chốt snapshot khi bắt đầu trận). */
    async loadForMatch(ownerUserId: string, scriptId: string): Promise<MatchScriptEntity | null> {
      return repo.findOneBy({ id: scriptId, ownerUserId, deletedAt: IsNull() });
    },

    /** Cho Room Management: tên kịch bản và kiểm tra quyền chọn. */
    roomScripts: {
      async names(ids: string[]) {
        if (ids.length === 0) return new Map<string, string>();
        const scripts = await repo.find({
          where: { id: In([...new Set(ids)]), deletedAt: IsNull() },
          select: { id: true, name: true },
        });
        return new Map(scripts.map((s) => [s.id, s.name]));
      },
      async assertUsable(ownerUserId: string, scriptId: string) {
        if (!(await repo.existsBy({ id: scriptId, ownerUserId, deletedAt: IsNull() }))) {
          throw new BadRequestError('Không tìm thấy kịch bản.', ScriptErrorCode.ScriptInvalid);
        }
      },
    } satisfies RoomScripts,
  };
}

export type ScriptsService = ReturnType<typeof createScriptsService>;
