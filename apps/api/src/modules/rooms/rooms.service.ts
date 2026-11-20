import {
  type createRoomRequestSchema,
  type HostRoom,
  type HostRoomList,
  MatchErrorCode,
  MIN_PLAYERS,
  RoomErrorCode,
  type RoomPreview,
  type RoomStatus,
  type updateRoomRequestSchema,
} from '@olympia/shared';
import { type DataSource, type EntityManager, In, QueryFailedError } from 'typeorm';
import type { z } from 'zod';
import type { UserPrincipal } from '../../shared/auth/principal';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors/app-error';
import type { PasswordHasher } from '../auth/password-hasher';
import { UserEntity } from '../users/user.entity';
import type { PresenceStore } from './presence-store';
import { generateRoomCode } from './room-code';
import type { RoomEvents } from './room-events';
import { ACTIVE_PARTICIPANT_STATUSES, RoomParticipantEntity } from './room-participant.entity';
import { RoomEntity } from './room.entity';

export interface RoomsConfig {
  maxActiveRoomsPerHost: number;
  maxSpectatorsPerRoom: number;
}

/** Kịch bản của Host do module Kịch bản cung cấp (Room Management không đọc bảng kịch bản). */
export interface RoomScripts {
  /** Tên các kịch bản còn hiệu lực theo id. */
  names(ids: string[]): Promise<Map<string, string>>;
  /** Ném lỗi nếu kịch bản không thuộc Host hoặc đã xóa. */
  assertUsable(ownerUserId: string, scriptId: string): Promise<void>;
}

export const noRoomScripts: RoomScripts = {
  names: () => Promise.resolve(new Map()),
  assertUsable: () => Promise.reject(new BadRequestError('Không tìm thấy kịch bản.')),
};

export interface RoomsServiceDeps {
  dataSource: DataSource;
  passwords: Pick<PasswordHasher, 'hash'>;
  presence: Pick<PresenceStore, 'clearRoom'>;
  events: RoomEvents;
  scripts: RoomScripts;
  config: RoomsConfig;
  now?: () => Date;
}

/** Người chơi có ghế khi bắt đầu trận. */
export interface SeatedPlayer {
  participantId: string;
  seat: number;
  displayName: string;
  userId: string | null;
  guestId: string | null;
}

const ACTIVE_ROOM_STATUSES: RoomStatus[] = ['open', 'in_match'];
const CODE_RETRIES = 5;

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string } | undefined)?.code === '23505'
  );
}

interface RoomCounts {
  players: number;
  spectators: number;
}

/** Số người chơi/khán giả đã được duyệt theo phòng. */
export async function countParticipants(
  manager: EntityManager,
  roomIds: string[],
): Promise<Map<string, RoomCounts>> {
  const result = new Map<string, RoomCounts>();
  if (roomIds.length === 0) return result;
  const rows = await manager
    .getRepository(RoomParticipantEntity)
    .createQueryBuilder('p')
    .select('p.roomId', 'roomId')
    .addSelect('p.role', 'role')
    .addSelect('COUNT(*)::int', 'count')
    .where('p.roomId IN (:...roomIds)', { roomIds })
    .andWhere("p.status = 'approved'")
    .groupBy('p.roomId')
    .addGroupBy('p.role')
    .getRawMany<{ roomId: string; role: 'player' | 'spectator'; count: number }>();
  for (const row of rows) {
    const counts = result.get(row.roomId) ?? { players: 0, spectators: 0 };
    if (row.role === 'player') counts.players = row.count;
    else counts.spectators = row.count;
    result.set(row.roomId, counts);
  }
  return result;
}

function toHostRoom(
  room: RoomEntity,
  hasPassword: boolean,
  counts: RoomCounts | undefined,
  scriptNames: Map<string, string>,
): HostRoom {
  const scriptName = room.scriptId ? scriptNames.get(room.scriptId) : undefined;
  return {
    id: room.id,
    name: room.name,
    description: room.description,
    maxPlayers: room.maxPlayers,
    visibility: room.visibility,
    hasPassword,
    allowSpectators: room.allowSpectators,
    maxSpectators: room.maxSpectators,
    allowGuests: room.allowGuests,
    autoApprove: room.autoApprove,
    controlMode: room.controlMode,
    reactionsEnabled: room.reactionsEnabled,
    script: room.scriptId && scriptName ? { id: room.scriptId, name: scriptName } : null,
    status: room.status,
    code: room.code,
    playerCount: counts?.players ?? 0,
    spectatorCount: counts?.spectators ?? 0,
    createdAt: room.createdAt.toISOString(),
    openedAt: room.openedAt?.toISOString() ?? null,
  };
}

/**
 * Quản lý phòng phía Host (mục 4.1–4.3): tạo, cấu hình, mở/đóng, đổi mã, danh sách; và tra cứu
 * công khai (mã phòng, phòng công khai).
 */
export function createRoomsService(deps: RoomsServiceDeps) {
  const { dataSource, passwords, presence, events, scripts, config } = deps;
  const now = deps.now ?? (() => new Date());

  function withPasswordQuery(manager: EntityManager) {
    return manager.getRepository(RoomEntity).createQueryBuilder('r').addSelect('r.passwordHash');
  }

  /** Phòng của Host, khóa dòng để thay đổi tuần tự; phòng của người khác trả 404. */
  async function loadOwnRoom(
    manager: EntityManager,
    actor: UserPrincipal,
    roomId: string,
  ): Promise<RoomEntity> {
    const room = await withPasswordQuery(manager)
      .where('r.id = :roomId', { roomId })
      .setLock('pessimistic_write')
      .getOne();
    if (!room || room.hostUserId !== actor.userId) throw new NotFoundError('Không tìm thấy phòng.');
    return room;
  }

  function assertSpectatorLimit(maxSpectators: number | undefined): void {
    if (maxSpectators !== undefined && maxSpectators > config.maxSpectatorsPerRoom) {
      throw new BadRequestError(
        `Số khán giả tối đa là ${config.maxSpectatorsPerRoom}.`,
        'MAX_SPECTATORS_EXCEEDED',
      );
    }
  }

  /** Mở phòng: kiểm tra giới hạn phòng đang hoạt động (BR-ROOM-03) và cấp mã phòng. */
  async function openRoom(manager: EntityManager, room: RoomEntity): Promise<void> {
    // Khóa dòng người dùng để hai lần mở phòng đồng thời không vượt giới hạn.
    await manager
      .getRepository(UserEntity)
      .createQueryBuilder('u')
      .where('u.id = :id', { id: room.hostUserId })
      .setLock('pessimistic_write')
      .getOne();
    const active = await manager.countBy(RoomEntity, {
      hostUserId: room.hostUserId,
      status: In(ACTIVE_ROOM_STATUSES),
    });
    if (active >= config.maxActiveRoomsPerHost) {
      throw new ConflictError(
        `Bạn chỉ được mở đồng thời ${config.maxActiveRoomsPerHost} phòng. Hãy đóng bớt phòng đang mở.`,
        RoomErrorCode.RoomLimitReached,
      );
    }
    const current = now();
    await manager.update(
      RoomEntity,
      { id: room.id },
      {
        status: 'open',
        code: generateRoomCode(),
        openedAt: current,
        lastActivityAt: current,
        stateVersion: () => 'state_version + 1',
      },
    );
  }

  /** Thử lại khi trùng mã phòng (unique index trên phòng đang hoạt động). */
  async function withCodeRetry<T>(work: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await work();
      } catch (error) {
        if (!isUniqueViolation(error) || attempt >= CODE_RETRIES) throw error;
      }
    }
  }

  async function present(roomId: string): Promise<HostRoom> {
    const room = await withPasswordQuery(dataSource.manager)
      .where('r.id = :roomId', { roomId })
      .getOneOrFail();
    const counts = await countParticipants(dataSource.manager, [room.id]);
    const names = await scripts.names(room.scriptId ? [room.scriptId] : []);
    return toHostRoom(room, room.passwordHash !== null, counts.get(room.id), names);
  }

  async function toPreviews(rooms: RoomEntity[]): Promise<RoomPreview[]> {
    if (rooms.length === 0) return [];
    const counts = await countParticipants(
      dataSource.manager,
      rooms.map((room) => room.id),
    );
    const hosts = await dataSource.getRepository(UserEntity).findBy({
      id: In([...new Set(rooms.map((room) => room.hostUserId))]),
    });
    return rooms.map((room) => {
      const roomCounts = counts.get(room.id);
      return {
        id: room.id,
        code: room.code ?? '',
        name: room.name,
        hostName: hosts.find((host) => host.id === room.hostUserId)?.displayName ?? 'Host',
        status: room.status,
        visibility: room.visibility,
        requiresPassword: room.passwordHash !== null,
        allowGuests: room.allowGuests,
        allowSpectators: room.allowSpectators,
        players: { taken: roomCounts?.players ?? 0, total: room.maxPlayers },
        spectators: { taken: roomCounts?.spectators ?? 0, total: room.maxSpectators },
      };
    });
  }

  return {
    activeLimit: config.maxActiveRoomsPerHost,

    async create(
      actor: UserPrincipal,
      input: z.output<typeof createRoomRequestSchema>,
    ): Promise<HostRoom> {
      assertSpectatorLimit(input.maxSpectators);
      if (input.scriptId) await scripts.assertUsable(actor.userId, input.scriptId);
      const passwordHash = input.password ? await passwords.hash(input.password) : null;
      const roomId = await withCodeRetry(() =>
        dataSource.transaction(async (manager) => {
          const room = manager.create(RoomEntity, {
            hostUserId: actor.userId,
            name: input.name,
            description: input.description,
            maxPlayers: input.maxPlayers,
            visibility: input.visibility,
            passwordHash,
            allowSpectators: input.allowSpectators,
            maxSpectators: input.maxSpectators,
            allowGuests: input.allowGuests,
            autoApprove: input.autoApprove,
            controlMode: input.controlMode,
            reactionsEnabled: input.reactionsEnabled,
            scriptId: input.scriptId,
            status: 'draft',
            lastActivityAt: now(),
          });
          await manager.save(room);
          if (input.open) await openRoom(manager, room);
          return room.id;
        }),
      );
      return present(roomId);
    },

    async listMine(actor: UserPrincipal, status?: RoomStatus): Promise<HostRoomList> {
      const query = withPasswordQuery(dataSource.manager)
        .where('r.hostUserId = :hostId', { hostId: actor.userId })
        .orderBy(
          "CASE r.status WHEN 'in_match' THEN 0 WHEN 'open' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END",
        )
        .addOrderBy('r.updatedAt', 'DESC')
        .take(200);
      if (status) query.andWhere('r.status = :status', { status });
      const rooms = await query.getMany();
      const counts = await countParticipants(
        dataSource.manager,
        rooms.map((room) => room.id),
      );
      const names = await scripts.names(
        rooms.flatMap((room) => (room.scriptId ? [room.scriptId] : [])),
      );
      const activeCount = await dataSource.getRepository(RoomEntity).countBy({
        hostUserId: actor.userId,
        status: In(ACTIVE_ROOM_STATUSES),
      });
      return {
        items: rooms.map((room) =>
          toHostRoom(room, room.passwordHash !== null, counts.get(room.id), names),
        ),
        activeCount,
        activeLimit: config.maxActiveRoomsPerHost,
      };
    },

    async get(actor: UserPrincipal, roomId: string): Promise<HostRoom> {
      const room = await dataSource.getRepository(RoomEntity).findOneBy({ id: roomId });
      if (!room || room.hostUserId !== actor.userId)
        throw new NotFoundError('Không tìm thấy phòng.');
      return present(roomId);
    },

    async update(
      actor: UserPrincipal,
      roomId: string,
      input: z.output<typeof updateRoomRequestSchema>,
    ): Promise<HostRoom> {
      assertSpectatorLimit(input.maxSpectators);
      if (input.scriptId) await scripts.assertUsable(actor.userId, input.scriptId);
      const passwordHash =
        typeof input.password === 'string' ? await passwords.hash(input.password) : undefined;

      const notify = await dataSource.transaction(async (manager) => {
        const room = await loadOwnRoom(manager, actor, roomId);
        if (room.status !== 'draft' && room.status !== 'open') {
          throw new ConflictError(
            'Chỉ sửa được phòng nháp hoặc đang mở (không sửa khi đang thi).',
            RoomErrorCode.InvalidRoomState,
          );
        }
        const counts = (await countParticipants(manager, [room.id])).get(room.id);
        if (input.maxPlayers !== undefined && input.maxPlayers < (counts?.players ?? 0)) {
          throw new ConflictError(
            'Số người chơi tối đa nhỏ hơn số người chơi đang trong phòng.',
            RoomErrorCode.InvalidRoomState,
          );
        }
        if (input.maxSpectators !== undefined && input.maxSpectators < (counts?.spectators ?? 0)) {
          throw new ConflictError(
            'Số khán giả tối đa nhỏ hơn số khán giả đang trong phòng.',
            RoomErrorCode.InvalidRoomState,
          );
        }

        const visibility = input.visibility ?? room.visibility;
        const nextPasswordHash =
          visibility === 'public'
            ? null
            : passwordHash !== undefined
              ? passwordHash
              : input.password === null
                ? null
                : room.passwordHash;
        if (input.password && visibility === 'public') {
          throw new BadRequestError('Chỉ phòng riêng tư mới đặt mật khẩu.');
        }

        const { password: _password, ...fields } = input;
        await manager.update(
          RoomEntity,
          { id: room.id },
          {
            ...fields,
            passwordHash: nextPasswordHash,
            stateVersion: () => 'state_version + 1',
            lastActivityAt: now(),
          },
        );
        // Giảm số người chơi: bỏ ghế vượt quá số ghế mới.
        if (input.maxPlayers !== undefined) {
          await manager
            .createQueryBuilder()
            .update(RoomParticipantEntity)
            .set({ seat: null, ready: false })
            .where('room_id = :roomId AND seat > :max', { roomId: room.id, max: input.maxPlayers })
            .execute();
        }
        return room.status === 'open';
      });
      if (notify) events.stateChanged(roomId);
      return present(roomId);
    },

    async remove(actor: UserPrincipal, roomId: string): Promise<void> {
      await dataSource.transaction(async (manager) => {
        const room = await loadOwnRoom(manager, actor, roomId);
        if (room.status !== 'draft') {
          throw new ConflictError('Chỉ xóa được phòng nháp.', RoomErrorCode.InvalidRoomState);
        }
        await manager.delete(RoomEntity, { id: room.id });
      });
    },

    async open(actor: UserPrincipal, roomId: string): Promise<HostRoom> {
      await withCodeRetry(() =>
        dataSource.transaction(async (manager) => {
          const room = await loadOwnRoom(manager, actor, roomId);
          if (room.status !== 'draft') {
            throw new ConflictError('Phòng đã được mở.', RoomErrorCode.InvalidRoomState);
          }
          await openRoom(manager, room);
        }),
      );
      return present(roomId);
    },

    /** Đóng phòng (Host hoặc tự động khi không hoạt động, BR-ROOM-02). */
    async close(actor: UserPrincipal | null, roomId: string): Promise<HostRoom> {
      await closeRoom(roomId, 'host', actor);
      return present(roomId);
    },

    /** "Tạo link mới": đổi mã phòng, mã cũ hết hiệu lực (DL-027). */
    async regenerateCode(actor: UserPrincipal, roomId: string): Promise<HostRoom> {
      await withCodeRetry(() =>
        dataSource.transaction(async (manager) => {
          const room = await loadOwnRoom(manager, actor, roomId);
          if (room.status !== 'open' && room.status !== 'in_match') {
            throw new ConflictError('Phòng chưa mở.', RoomErrorCode.InvalidRoomState);
          }
          await manager.update(
            RoomEntity,
            { id: room.id },
            { code: generateRoomCode(), stateVersion: () => 'state_version + 1' },
          );
        }),
      );
      events.stateChanged(roomId);
      return present(roomId);
    },

    /** Tra phòng đang hoạt động theo mã (trang Vào phòng). */
    async lookup(code: string): Promise<RoomPreview> {
      const room = await withPasswordQuery(dataSource.manager)
        .where('r.code = :code', { code })
        .andWhere('r.status IN (:...statuses)', { statuses: ACTIVE_ROOM_STATUSES })
        .getOne();
      if (!room) throw new NotFoundError('Không tìm thấy phòng đang mở với mã này.');
      const [preview] = await toPreviews([room]);
      return preview!;
    },

    /** Phòng công khai đang mở (mục 4.2, DL-032). */
    async listPublic(): Promise<RoomPreview[]> {
      const rooms = await withPasswordQuery(dataSource.manager)
        .where("r.status = 'open' AND r.visibility = 'public'")
        .orderBy('r.openedAt', 'DESC')
        .take(50)
        .getMany();
      return toPreviews(rooms);
    },

    closeRoom,

    /** Quản trị viên đóng phòng vi phạm (15.1, 15.2); phòng phải đang mở (đã kết thúc trận). */
    forceClose(roomId: string): Promise<boolean> {
      return closeRoom(roomId, 'moderation', null);
    },

    /** Số phòng Host đã tạo (thống kê Host, mục 14). */
    countHosted(hostUserId: string): Promise<number> {
      return dataSource.getRepository(RoomEntity).countBy({ hostUserId });
    },

    /**
     * Bắt đầu trận (8.3): khóa phòng, kiểm tra Host, phòng đang mở, đủ người chơi có ghế và đã
     * Sẵn sàng (BR-JOIN-04), rồi chạy `work` của Game Engine trong cùng transaction và chuyển
     * phòng sang Đang thi (BR-ROOM-01).
     */
    async beginMatch<T>(
      actor: UserPrincipal,
      roomId: string,
      options: { skipReady: boolean },
      work: (manager: EntityManager, room: RoomEntity, players: SeatedPlayer[]) => Promise<T>,
    ): Promise<T> {
      const result = await dataSource.transaction(async (manager) => {
        const room = await loadOwnRoom(manager, actor, roomId);
        if (room.status !== 'open') {
          throw new ConflictError(
            room.status === 'in_match' ? 'Phòng đang có trận diễn ra.' : 'Phòng chưa mở.',
            room.status === 'in_match'
              ? MatchErrorCode.AlreadyRunning
              : RoomErrorCode.InvalidRoomState,
          );
        }
        const seated = await manager.find(RoomParticipantEntity, {
          where: { roomId, role: 'player', status: 'approved' },
          order: { seat: 'ASC' },
        });
        const players = seated.filter((p) => p.seat !== null && p.seat <= room.maxPlayers);
        if (players.length < MIN_PLAYERS) {
          throw new ConflictError(
            `Cần ít nhất ${MIN_PLAYERS} người chơi đã có vị trí để bắt đầu.`,
            MatchErrorCode.NotEnoughPlayers,
          );
        }
        if (!options.skipReady && players.some((p) => !p.ready)) {
          throw new ConflictError('Còn người chơi chưa Sẵn sàng.', MatchErrorCode.PlayersNotReady);
        }
        const value = await work(
          manager,
          room,
          players.map((p) => ({
            participantId: p.id,
            seat: p.seat!,
            displayName: p.displayName,
            userId: p.userId,
            guestId: p.guestId,
          })),
        );
        await manager.update(
          RoomEntity,
          { id: room.id },
          { status: 'in_match', stateVersion: () => 'state_version + 1', lastActivityAt: now() },
        );
        return value;
      });
      events.stateChanged(roomId);
      return result;
    },

    /** Trận kết thúc: phòng quay về Đang mở để tổ chức trận tiếp theo (BR-ROOM-01). */
    async finishMatch(manager: EntityManager, roomId: string): Promise<void> {
      await manager.update(
        RoomEntity,
        { id: roomId, status: 'in_match' },
        { status: 'open', stateVersion: () => 'state_version + 1', lastActivityAt: now() },
      );
      await manager.update(
        RoomParticipantEntity,
        { roomId, status: In(ACTIVE_PARTICIPANT_STATUSES) },
        { ready: false },
      );
    },
  };

  /**
   * Đóng phòng: mọi người tham gia rời phòng, xóa trạng thái kết nối, thông báo realtime.
   * `actor` null khi hệ thống tự đóng.
   */
  async function closeRoom(
    roomId: string,
    reason: 'host' | 'inactive' | 'moderation',
    actor: UserPrincipal | null,
  ): Promise<boolean> {
    const closed = await dataSource.transaction(async (manager) => {
      const room = actor
        ? await loadOwnRoom(manager, actor, roomId)
        : await manager.findOne(RoomEntity, {
            where: { id: roomId },
            lock: { mode: 'pessimistic_write' },
          });
      if (!room) return false;
      if (room.status === 'closed') return false;
      // Hệ thống tự đóng: phòng vừa chuyển sang Đang thi thì bỏ qua (không còn "không hoạt động").
      if (!actor && room.status !== 'open') return false;
      if (room.status !== 'open') {
        throw new ConflictError(
          'Chỉ đóng được phòng đang mở (không đóng khi đang thi hoặc còn nháp).',
          RoomErrorCode.InvalidRoomState,
        );
      }
      const current = now();
      await manager.update(
        RoomEntity,
        { id: room.id },
        {
          status: 'closed',
          closedAt: current,
          closedReason: reason,
          stateVersion: () => 'state_version + 1',
        },
      );
      await manager.update(
        RoomParticipantEntity,
        { roomId: room.id, status: In(ACTIVE_PARTICIPANT_STATUSES) },
        { status: 'left', seat: null, ready: false, leftAt: current },
      );
      return true;
    });
    if (closed) {
      await presence.clearRoom(roomId);
      events.closed(roomId);
    }
    return closed;
  }
}

export type RoomsService = ReturnType<typeof createRoomsService>;
