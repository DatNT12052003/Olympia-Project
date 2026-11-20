import {
  type joinRoomRequestSchema,
  type ParticipantRole,
  type ParticipantView,
  RoomErrorCode,
  type RoomRemovedReason,
  type RoomState,
} from '@olympia/shared';
import { type DataSource, type EntityManager, In, LessThan, QueryFailedError } from 'typeorm';
import type { z } from 'zod';
import type { LimiterFactory } from '../../infrastructure/rate-limit/rate-limiter';
import type { GuestPrincipal, Principal, UserPrincipal } from '../../shared/auth/principal';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
} from '../../shared/errors/app-error';
import type { IssuedGuestSession } from '../auth/auth.service';
import type { PasswordHasher } from '../auth/password-hasher';
import { UserEntity } from '../users/user.entity';
import { type PresenceEntry, presenceKey, type PresenceStore } from './presence-store';
import type { RoomEvents } from './room-events';
import { RoomBanEntity } from './room-ban.entity';
import { ACTIVE_PARTICIPANT_STATUSES, RoomParticipantEntity } from './room-participant.entity';
import { RoomEntity } from './room.entity';
import type { RoomScripts, RoomsService } from './rooms.service';

export interface LobbyConfig {
  reconnectGraceSeconds: number;
  roomIdleMinutes: number;
}

export interface LobbyServiceDeps {
  dataSource: DataSource;
  passwords: Pick<PasswordHasher, 'verify'>;
  presence: PresenceStore;
  events: RoomEvents;
  limiters: LimiterFactory;
  /** Cấp phiên khách gắn với phòng (DL-028). */
  startGuestSession: (roomId: string, displayName: string) => IssuedGuestSession;
  closeRoom: RoomsService['closeRoom'];
  scripts: Pick<RoomScripts, 'names'>;
  config: LobbyConfig;
  now?: () => Date;
}

/** Vai trò của người xem trong phòng, dùng cho phân quyền realtime. */
export type RoomViewer =
  | { role: 'host'; key: string; participant: null; displayName: string }
  /** Super Admin/Manager vào giám sát (BR-ROLE-04): không phải người tham gia phòng. */
  | { role: 'monitor'; key: string; participant: null; displayName: string }
  | {
      role: 'player' | 'spectator' | 'pending';
      key: string;
      participant: RoomParticipantEntity;
      displayName: string;
    };

export interface JoinResult {
  participant: ParticipantView;
  guestSession?: IssuedGuestSession;
}

/** Số khán giả người không phải Host thấy trong danh sách. */
const MEMBER_SPECTATOR_PREVIEW = 20;

function isUniqueViolation(error: unknown, constraint?: string): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const driver = error.driverError as { code?: string; constraint?: string } | undefined;
  return driver?.code === '23505' && (!constraint || driver.constraint === constraint);
}

function participantKey(participant: RoomParticipantEntity): string {
  return participant.userId ? `u:${participant.userId}` : `g:${participant.guestId}`;
}

function sameName(a: string, b: string): boolean {
  return a.localeCompare(b, 'vi', { sensitivity: 'accent' }) === 0;
}

/**
 * Sảnh chờ (mục 4.4, 4.5, 12, 13): vào phòng, duyệt, xếp ghế, đổi vai trò, kick/ban, Sẵn sàng,
 * rời phòng; dựng trạng thái phòng cho realtime; giải phóng chỗ khi hết thời gian giữ chỗ.
 * Mọi thay đổi khóa dòng phòng (SELECT ... FOR UPDATE) nên được xử lý tuần tự trong một phòng.
 */
export function createLobbyService(deps: LobbyServiceDeps) {
  const { dataSource, passwords, presence, events, config } = deps;
  const now = deps.now ?? (() => new Date());
  const passwordAttempts = deps.limiters({
    keyPrefix: 'room-password',
    points: 10,
    durationSeconds: 600,
  });

  async function lockRoom(manager: EntityManager, roomId: string): Promise<RoomEntity> {
    const room = await manager
      .getRepository(RoomEntity)
      .createQueryBuilder('r')
      .addSelect('r.passwordHash')
      .where('r.id = :roomId', { roomId })
      .setLock('pessimistic_write')
      .getOne();
    if (!room) throw new NotFoundError('Không tìm thấy phòng.');
    return room;
  }

  /** Đánh dấu có thay đổi: tăng version, cập nhật thời điểm hoạt động (BR-RT-03, DL-030). */
  async function touch(manager: EntityManager, roomId: string): Promise<void> {
    await manager.update(
      RoomEntity,
      { id: roomId },
      { stateVersion: () => 'state_version + 1', lastActivityAt: now() },
    );
  }

  function assertHost(room: RoomEntity, actor: Principal): void {
    if (actor.kind !== 'user' || actor.userId !== room.hostUserId) {
      throw new ForbiddenError('Chỉ Host của phòng được thực hiện thao tác này.');
    }
  }

  function assertGuestRoom(principal: Principal, roomId: string): void {
    if (principal.kind === 'guest' && principal.roomId !== roomId) {
      throw new ForbiddenError('Phiên khách không thuộc phòng này.');
    }
  }

  async function activeParticipants(manager: EntityManager, roomId: string) {
    return manager.find(RoomParticipantEntity, {
      where: { roomId, status: In(ACTIVE_PARTICIPANT_STATUSES) },
      order: { joinedAt: 'ASC' },
    });
  }

  /** Lượt tham gia đang hiệu lực theo khóa danh tính (`u:<userId>` hoặc `g:<guestId>`). */
  async function findActive(
    manager: EntityManager,
    roomId: string,
    key: string,
  ): Promise<RoomParticipantEntity | null> {
    const [kind, id] = key.split(':') as ['u' | 'g', string];
    return manager.findOne(RoomParticipantEntity, {
      where: {
        roomId,
        status: In(ACTIVE_PARTICIPANT_STATUSES),
        ...(kind === 'u' ? { userId: id } : { guestId: id }),
      },
    });
  }

  function firstFreeSeat(room: RoomEntity, participants: RoomParticipantEntity[]): number | null {
    const taken = new Set(participants.map((p) => p.seat).filter((seat) => seat !== null));
    for (let seat = 1; seat <= room.maxPlayers; seat += 1) {
      if (!taken.has(seat)) return seat;
    }
    return null;
  }

  function approvedCount(participants: RoomParticipantEntity[], role: ParticipantRole): number {
    return participants.filter((p) => p.status === 'approved' && p.role === role).length;
  }

  /** Duyệt người chơi và cho ngồi ghế trống thấp nhất (BR-JOIN-01). */
  function approvePlayer(
    room: RoomEntity,
    participants: RoomParticipantEntity[],
    participant: RoomParticipantEntity,
  ): void {
    if (approvedCount(participants, 'player') >= room.maxPlayers) {
      throw new ConflictError('Phòng đã đủ người chơi.', RoomErrorCode.RoomFull);
    }
    participant.status = 'approved';
    participant.seat = firstFreeSeat(room, participants);
    participant.ready = false;
  }

  function toView(participant: RoomParticipantEntity, entry?: PresenceEntry): ParticipantView {
    return {
      id: participant.id,
      displayName: participant.displayName,
      kind: participant.userId ? 'user' : 'guest',
      role: participant.role,
      status: participant.status === 'pending' ? 'pending' : 'approved',
      seat: participant.seat,
      ready: participant.ready,
      connection: entry ? entry.status : 'offline',
      disconnectedAt: entry?.status === 'disconnected' ? new Date(entry.since).toISOString() : null,
    };
  }

  async function removeFromRoom(
    manager: EntityManager,
    participant: RoomParticipantEntity,
    status: 'left' | 'rejected' | 'kicked',
  ): Promise<void> {
    participant.status = status;
    participant.seat = null;
    participant.ready = false;
    participant.leftAt = now();
    await manager.save(participant);
  }

  /** Sau khi commit: xóa trạng thái kết nối, báo người bị đưa ra và cập nhật phòng. */
  async function afterRemoval(
    roomId: string,
    participant: RoomParticipantEntity,
    reason: RoomRemovedReason,
  ): Promise<void> {
    const key = participantKey(participant);
    await presence.remove(roomId, key);
    events.removed(roomId, key, reason);
    events.stateChanged(roomId);
  }

  /** Thao tác của Host trên một người tham gia, trong transaction có khóa phòng. */
  async function hostAction<T>(
    actor: Principal,
    roomId: string,
    participantId: string,
    work: (
      manager: EntityManager,
      room: RoomEntity,
      participant: RoomParticipantEntity,
      participants: RoomParticipantEntity[],
    ) => Promise<T>,
  ): Promise<T> {
    const result = await dataSource.transaction(async (manager) => {
      const room = await lockRoom(manager, roomId);
      assertHost(room, actor);
      if (room.status !== 'open') {
        throw new ConflictError(
          'Chỉ thao tác được trong sảnh chờ khi phòng đang mở.',
          RoomErrorCode.InvalidRoomState,
        );
      }
      const participants = await activeParticipants(manager, roomId);
      const participant = participants.find((p) => p.id === participantId);
      if (!participant) throw new NotFoundError('Người tham gia không còn trong phòng.');
      const value = await work(manager, room, participant, participants);
      await touch(manager, roomId);
      return value;
    });
    return result;
  }

  async function buildState(roomId: string, audience: 'host' | 'member'): Promise<RoomState> {
    const room = await dataSource.getRepository(RoomEntity).findOneByOrFail({ id: roomId });
    const host = await dataSource.getRepository(UserEntity).findOneBy({ id: room.hostUserId });
    const participants = await activeParticipants(dataSource.manager, roomId);
    const presenceMap = await presence.get(roomId);
    const view = (p: RoomParticipantEntity) => toView(p, presenceMap.get(participantKey(p)));

    const players = participants
      .filter((p) => p.role === 'player' && p.status === 'approved')
      .sort((a, b) => (a.seat ?? 99) - (b.seat ?? 99))
      .map(view);
    const spectators = participants.filter(
      (p) => p.role === 'spectator' && p.status === 'approved',
    );
    const hostPresence = presenceMap.get(`u:${room.hostUserId}`);
    const scriptName =
      audience === 'host' && room.scriptId
        ? (await deps.scripts.names([room.scriptId])).get(room.scriptId)
        : undefined;

    return {
      version: room.stateVersion,
      audience,
      room: {
        id: room.id,
        name: room.name,
        code: room.code,
        status: room.status,
        visibility: room.visibility,
        controlMode: room.controlMode,
        maxPlayers: room.maxPlayers,
        allowSpectators: room.allowSpectators,
        maxSpectators: room.maxSpectators,
        reactionsEnabled: room.reactionsEnabled,
        script: room.scriptId && scriptName ? { id: room.scriptId, name: scriptName } : null,
      },
      host: {
        displayName: host?.displayName ?? 'Host',
        connection: hostPresence?.status ?? 'offline',
      },
      players,
      pending:
        audience === 'host' ? participants.filter((p) => p.status === 'pending').map(view) : [],
      spectators: {
        count: spectators.length,
        items: (audience === 'host'
          ? spectators
          : spectators.slice(0, MEMBER_SPECTATOR_PREVIEW)
        ).map(view),
      },
      reconnectGraceSeconds: config.reconnectGraceSeconds,
    };
  }

  /**
   * Super Admin/Manager được vào giám sát phòng (BR-ROLE-04, 15.2): Super Admin mọi phòng; Manager
   * phòng của Host là thành viên thuộc tổ chức mình quản lý (cùng phạm vi với `/api/admin/rooms`).
   */
  async function canMonitor(principal: UserPrincipal, room: RoomEntity): Promise<boolean> {
    if (principal.systemRole === 'super_admin') return true;
    if (principal.systemRole !== 'manager') return false;
    const rows = await dataSource.query<unknown[]>(
      `SELECT 1
         FROM users u
         JOIN organization_managers m ON m.organization_id = u.organization_id
        WHERE u.id = $1 AND u.system_role = 'member' AND m.user_id = $2
        LIMIT 1`,
      [room.hostUserId, principal.userId],
    );
    return rows.length > 0;
  }

  /** Người xem đã từng được nhận vào phòng. */
  async function wasMember(roomId: string, principal: Principal): Promise<boolean> {
    if (principal.kind === 'guest' && principal.roomId !== roomId) return false;
    return dataSource.getRepository(RoomParticipantEntity).existsBy({
      roomId,
      status: In(['approved', 'left']),
      ...(principal.kind === 'user'
        ? { userId: principal.userId }
        : { guestId: principal.guestId }),
    });
  }

  return {
    buildState,

    /**
     * Vào phòng (4.4). Tài khoản dùng chính danh tính; khách chưa có phiên của phòng này được
     * cấp phiên khách mới (DL-028). Vào lại khi đang trong phòng trả về lượt tham gia hiện có.
     */
    async join(
      principal: Principal | undefined,
      roomId: string,
      input: z.output<typeof joinRoomRequestSchema>,
      meta: { ip: string | undefined },
    ): Promise<JoinResult> {
      const asGuest = !principal || (principal.kind === 'guest' && principal.roomId !== roomId);
      let guestSession: IssuedGuestSession | undefined;
      let identity: UserPrincipal | GuestPrincipal;
      if (asGuest) {
        if (!input.displayName) {
          throw new BadRequestError('Cần nhập tên hiển thị để vào phòng.', 'DISPLAY_NAME_REQUIRED');
        }
        guestSession = deps.startGuestSession(roomId, input.displayName);
        identity = {
          kind: 'guest',
          guestId: guestSession.guest.id,
          displayName: input.displayName,
          roomId,
        };
      } else {
        identity = principal;
      }

      try {
        const participant = await dataSource.transaction(async (manager) => {
          const room = await lockRoom(manager, roomId);
          if (identity.kind === 'user' && identity.userId === room.hostUserId) {
            throw new ConflictError(
              'Host không tham gia phòng của mình với vai trò người chơi hay khán giả.',
              RoomErrorCode.HostCannotJoin,
            );
          }
          const existing = await findActive(manager, roomId, presenceKey(identity));
          if (existing) return existing;

          if (identity.kind === 'guest' && !room.allowGuests) {
            throw new ForbiddenError(
              'Phòng không cho phép khách. Hãy đăng nhập để tham gia.',
              RoomErrorCode.GuestsNotAllowed,
            );
          }
          // Người chơi chỉ vào khi phòng đang mở (BR-JOIN-02); khán giả vào cả khi đang thi.
          const allowed = input.role === 'player' ? ['open'] : ['open', 'in_match'];
          if (!allowed.includes(room.status)) {
            throw new ConflictError(
              input.role === 'player'
                ? 'Phòng không nhận người chơi lúc này.'
                : 'Phòng chưa mở hoặc đã đóng.',
              RoomErrorCode.RoomNotOpen,
            );
          }
          if (input.role === 'spectator' && !room.allowSpectators) {
            throw new ForbiddenError(
              'Phòng không cho phép khán giả.',
              RoomErrorCode.SpectatorsNotAllowed,
            );
          }
          const banned = await manager.existsBy(RoomBanEntity, {
            roomId,
            ...(identity.kind === 'user'
              ? { userId: identity.userId }
              : { guestId: identity.guestId }),
          });
          if (banned) {
            throw new ForbiddenError('Bạn đã bị cấm khỏi phòng này.', RoomErrorCode.Banned);
          }
          if (room.passwordHash) {
            const attemptKey = `${meta.ip ?? 'unknown'}|${roomId}`;
            const blocked = await passwordAttempts.blockedFor(attemptKey);
            if (blocked !== null) throw new TooManyRequestsError(blocked);
            if (!input.password || !(await passwords.verify(room.passwordHash, input.password))) {
              await passwordAttempts.consume(attemptKey);
              throw new ForbiddenError(
                'Mật khẩu phòng không đúng.',
                RoomErrorCode.WrongRoomPassword,
              );
            }
          }

          const participants = await activeParticipants(manager, roomId);
          let displayName = input.displayName;
          if (!displayName) {
            displayName =
              identity.kind === 'guest'
                ? identity.displayName
                : (await manager.findOneByOrFail(UserEntity, { id: identity.userId })).displayName;
          }
          const host = await manager.findOneByOrFail(UserEntity, { id: room.hostUserId });
          if (
            sameName(displayName, host.displayName) ||
            participants.some((p) => sameName(p.displayName, displayName))
          ) {
            throw new ConflictError(
              'Tên hiển thị đã có người dùng trong phòng. Hãy chọn tên khác.',
              RoomErrorCode.DisplayNameTaken,
            );
          }

          const participant = manager.create(RoomParticipantEntity, {
            roomId,
            userId: identity.kind === 'user' ? identity.userId : null,
            guestId: identity.kind === 'guest' ? identity.guestId : null,
            displayName,
            role: input.role,
            status: 'pending',
            seat: null,
            ready: false,
          });
          if (input.role === 'spectator') {
            if (approvedCount(participants, 'spectator') >= room.maxSpectators) {
              throw new ConflictError('Phòng đã đủ khán giả.', RoomErrorCode.SpectatorsFull);
            }
            participant.status = 'approved';
          } else if (approvedCount(participants, 'player') >= room.maxPlayers) {
            throw new ConflictError(
              'Phòng đã đủ người chơi. Bạn có thể vào làm khán giả.',
              RoomErrorCode.RoomFull,
            );
          } else if (room.autoApprove) {
            approvePlayer(room, participants, participant);
          }
          await manager.save(participant);
          await touch(manager, roomId);
          return participant;
        });
        events.stateChanged(roomId);
        return {
          participant: toView(participant),
          ...(guestSession ? { guestSession } : {}),
        };
      } catch (error) {
        if (isUniqueViolation(error, 'uq_room_participants_name')) {
          throw new ConflictError(
            'Tên hiển thị đã có người dùng trong phòng. Hãy chọn tên khác.',
            RoomErrorCode.DisplayNameTaken,
          );
        }
        throw error;
      }
    },

    /** Lượt tham gia hiện tại của người gọi (để khôi phục sau khi tải lại trang). */
    async me(principal: Principal, roomId: string): Promise<ParticipantView> {
      assertGuestRoom(principal, roomId);
      const participant = await findActive(dataSource.manager, roomId, presenceKey(principal));
      if (!participant) throw new NotFoundError('Bạn không còn ở trong phòng này.');
      const entry = (await presence.get(roomId)).get(participantKey(participant));
      return toView(participant, entry);
    },

    async approve(actor: Principal, roomId: string, participantId: string): Promise<void> {
      await hostAction(actor, roomId, participantId, async (manager, room, participant, all) => {
        if (participant.status !== 'pending') return;
        approvePlayer(room, all, participant);
        await manager.save(participant);
      });
      events.stateChanged(roomId);
    },

    async reject(actor: Principal, roomId: string, participantId: string): Promise<void> {
      const participant = await hostAction(actor, roomId, participantId, async (manager, _r, p) => {
        if (p.status !== 'pending') {
          throw new ConflictError('Người này đã được duyệt.', RoomErrorCode.InvalidRoomState);
        }
        await removeFromRoom(manager, p, 'rejected');
        return p;
      });
      await afterRemoval(roomId, participant, 'rejected');
    },

    /** Gán/đổi ghế; ghế đã có người thì hai người đổi chỗ cho nhau. `null` = bỏ ghế. */
    async assignSeat(
      actor: Principal,
      roomId: string,
      participantId: string,
      seat: number | null,
    ): Promise<void> {
      await hostAction(actor, roomId, participantId, async (manager, room, participant, all) => {
        if (participant.role !== 'player' || participant.status !== 'approved') {
          throw new ConflictError(
            'Chỉ xếp ghế cho người chơi đã được duyệt.',
            RoomErrorCode.InvalidRoomState,
          );
        }
        if (seat !== null && seat > room.maxPlayers) {
          throw new BadRequestError(
            'Ghế không tồn tại trong phòng này.',
            RoomErrorCode.SeatUnavailable,
          );
        }
        if (participant.seat === seat) return;
        const occupant =
          seat === null ? undefined : all.find((p) => p.id !== participant.id && p.seat === seat);
        const previousSeat = participant.seat;
        if (occupant) {
          // Đổi chỗ: bỏ ghế người đang ngồi trước để không vi phạm unique (room, seat).
          occupant.seat = null;
          await manager.save(occupant);
        }
        participant.seat = seat;
        if (seat === null) participant.ready = false;
        await manager.save(participant);
        if (occupant) {
          occupant.seat = previousSeat;
          if (previousSeat === null) occupant.ready = false;
          await manager.save(occupant);
        }
      });
      events.stateChanged(roomId);
    },

    /** Chuyển người chơi thành khán giả và ngược lại (BR-JOIN-03). */
    async changeRole(
      actor: Principal,
      roomId: string,
      participantId: string,
      role: ParticipantRole,
    ): Promise<void> {
      await hostAction(actor, roomId, participantId, async (manager, room, participant, all) => {
        if (participant.role === role && participant.status === 'approved') return;
        if (role === 'spectator') {
          if (!room.allowSpectators) {
            throw new ConflictError(
              'Phòng không cho phép khán giả.',
              RoomErrorCode.SpectatorsNotAllowed,
            );
          }
          if (approvedCount(all, 'spectator') >= room.maxSpectators) {
            throw new ConflictError('Phòng đã đủ khán giả.', RoomErrorCode.SpectatorsFull);
          }
          participant.role = 'spectator';
          participant.status = 'approved';
          participant.seat = null;
          participant.ready = false;
        } else {
          participant.role = 'player';
          approvePlayer(room, all, participant);
        }
        await manager.save(participant);
      });
      events.stateChanged(roomId);
    },

    async kick(actor: Principal, roomId: string, participantId: string): Promise<void> {
      const participant = await hostAction(actor, roomId, participantId, async (manager, _r, p) => {
        await removeFromRoom(manager, p, 'kicked');
        return p;
      });
      await afterRemoval(roomId, participant, 'kicked');
    },

    /** Mời ra và cấm vào lại phòng (BR-JOIN-03). */
    async ban(actor: Principal, roomId: string, participantId: string): Promise<void> {
      const participant = await hostAction(actor, roomId, participantId, async (manager, _r, p) => {
        await removeFromRoom(manager, p, 'kicked');
        await manager
          .createQueryBuilder()
          .insert()
          .into(RoomBanEntity)
          .values({
            roomId,
            userId: p.userId,
            guestId: p.guestId,
            displayName: p.displayName,
            bannedByUserId: actor.kind === 'user' ? actor.userId : null,
          })
          .orIgnore()
          .execute();
        return p;
      });
      await afterRemoval(roomId, participant, 'banned');
    },

    /** Người chơi có ghế bấm Sẵn sàng (4.4 bước 5). */
    async setReady(principal: Principal, roomId: string, ready: boolean): Promise<void> {
      assertGuestRoom(principal, roomId);
      await dataSource.transaction(async (manager) => {
        const room = await lockRoom(manager, roomId);
        if (room.status !== 'open') {
          throw new ConflictError('Phòng không ở sảnh chờ.', RoomErrorCode.InvalidRoomState);
        }
        const participant = await findActive(manager, roomId, presenceKey(principal));
        if (!participant) throw new NotFoundError('Bạn không còn ở trong phòng này.');
        if (
          participant.role !== 'player' ||
          participant.status !== 'approved' ||
          !participant.seat
        ) {
          throw new ConflictError(
            'Chỉ người chơi đã có vị trí mới bấm Sẵn sàng.',
            RoomErrorCode.InvalidRoomState,
          );
        }
        participant.ready = ready;
        await manager.save(participant);
        await touch(manager, roomId);
      });
      events.stateChanged(roomId);
    },

    /**
     * Rời phòng (4.5): khi chưa thi, vị trí được giải phóng. Người chơi có ghế rời khi đang thi
     * được xem như mất kết nối (giữ chỗ, BR-RC-01) nên lượt tham gia vẫn còn.
     */
    async leave(principal: Principal, roomId: string): Promise<void> {
      assertGuestRoom(principal, roomId);
      const participant = await dataSource.transaction(async (manager) => {
        const room = await lockRoom(manager, roomId);
        const found = await findActive(manager, roomId, presenceKey(principal));
        if (!found) return null;
        if (room.status === 'in_match' && found.role === 'player' && found.seat !== null) {
          return null;
        }
        await removeFromRoom(manager, found, 'left');
        await touch(manager, roomId);
        return found;
      });
      if (participant) await afterRemoval(roomId, participant, 'left');
    },

    /** Xác định vai trò người xem để cho phép theo dõi phòng qua realtime. */
    async resolveViewer(roomId: string, principal: Principal): Promise<RoomViewer | null> {
      if (principal.kind === 'guest' && principal.roomId !== roomId) return null;
      const room = await dataSource.getRepository(RoomEntity).findOneBy({ id: roomId });
      if (!room || room.status === 'draft' || room.status === 'closed') return null;
      const key = presenceKey(principal);
      if (principal.kind === 'user' && principal.userId === room.hostUserId) {
        const host = await dataSource.getRepository(UserEntity).findOneBy({ id: room.hostUserId });
        return { role: 'host', key, participant: null, displayName: host?.displayName ?? 'Host' };
      }
      const participant = await findActive(dataSource.manager, roomId, presenceKey(principal));
      if (!participant) {
        if (principal.kind !== 'user' || !(await canMonitor(principal, room))) return null;
        const self = await dataSource.getRepository(UserEntity).findOneBy({ id: principal.userId });
        return {
          role: 'monitor',
          key,
          participant: null,
          displayName: self?.displayName ?? 'Quản trị viên',
        };
      }
      return {
        role: participant.status === 'pending' ? 'pending' : participant.role,
        key,
        participant,
        displayName: participant.displayName,
      };
    },

    /**
     * Đối tượng của báo cáo hành vi trong phòng (15.3): người báo cáo phải là Host hoặc đã ở trong
     * phòng; bỏ trống người tham gia nghĩa là báo cáo Host.
     */
    async reportTarget(
      roomId: string,
      participantId: string | null,
      reporter: Principal,
    ): Promise<{
      label: string;
      hostUserId: string;
      subject: { userId: string | null; guestId: string | null; name: string };
    }> {
      const room = await dataSource.getRepository(RoomEntity).findOneBy({ id: roomId });
      const isHost = reporter.kind === 'user' && room?.hostUserId === reporter.userId;
      if (!room || (!isHost && !(await wasMember(roomId, reporter)))) {
        throw new NotFoundError('Không tìm thấy phòng.');
      }
      let subject: { userId: string | null; guestId: string | null; name: string };
      if (participantId) {
        const p = await dataSource
          .getRepository(RoomParticipantEntity)
          .findOneBy({ id: participantId, roomId });
        if (!p) throw new NotFoundError('Không tìm thấy người tham gia.');
        subject = { userId: p.userId, guestId: p.guestId, name: p.displayName };
      } else {
        const host = await dataSource.getRepository(UserEntity).findOneBy({ id: room.hostUserId });
        subject = { userId: room.hostUserId, guestId: null, name: host?.displayName ?? 'Host' };
      }
      if (reporter.kind === 'user' && subject.userId === reporter.userId) {
        throw new BadRequestError('Không thể tự báo cáo chính mình.');
      }
      return { label: room.name, hostUserId: room.hostUserId, subject };
    },

    /** Quản trị viên chặn khách khỏi phòng khi xử lý báo cáo (DL-050). */
    async staffBanGuest(
      roomId: string,
      guestId: string,
      displayName: string,
      actorUserId: string,
    ): Promise<void> {
      const removed = await dataSource.transaction(async (manager) => {
        const room = await lockRoom(manager, roomId);
        await manager
          .createQueryBuilder()
          .insert()
          .into(RoomBanEntity)
          .values({ roomId, userId: null, guestId, displayName, bannedByUserId: actorUserId })
          .orIgnore()
          .execute();
        const participant = await findActive(manager, roomId, `g:${guestId}`);
        // Đang thi thì giữ ghế tới hết trận; lệnh cấm có hiệu lực khi vào lại.
        if (!participant || room.status !== 'open') return null;
        await removeFromRoom(manager, participant, 'kicked');
        return participant;
      });
      if (removed) await afterRemoval(roomId, removed, 'banned');
    },

    /** Ẩn danh tên người dùng đã xóa tài khoản trong danh sách người tham gia (BR-DATA-03). */
    async anonymizeUser(manager: EntityManager, userId: string): Promise<void> {
      await manager.update(RoomParticipantEntity, { userId }, { displayName: 'Người dùng đã xóa' });
    },

    /** Người xem đã từng được nhận vào phòng (khán giả xem tổng kết trận, mục 9.4). */
    wasMember,

    async roomForReactions(roomId: string): Promise<RoomEntity | null> {
      return dataSource.getRepository(RoomEntity).findOneBy({ id: roomId });
    },

    /**
     * Hết thời gian giữ chỗ (BR-RC-01, DL-029): ở sảnh chờ, người mất kết nối quá hạn xem như
     * rời phòng. Trả số người đã được giải phóng.
     */
    async releaseExpiredDisconnects(): Promise<number> {
      const deadline = now().getTime() - config.reconnectGraceSeconds * 1000;
      let released = 0;
      for (const roomId of await presence.rooms()) {
        const entries = await presence.get(roomId);
        for (const [key, entry] of entries) {
          if (entry.status !== 'disconnected' || entry.since > deadline) continue;
          const room = await dataSource.getRepository(RoomEntity).findOneBy({ id: roomId });
          if (!room || room.status === 'closed' || room.status === 'draft') {
            await presence.clearRoom(roomId);
            break;
          }
          // Đang thi: Game Engine (P4) quyết định theo BR-RC-04.
          if (room.status !== 'open') continue;
          if (key === `u:${room.hostUserId}`) {
            await presence.remove(roomId, key);
            events.stateChanged(roomId);
            continue;
          }
          const participant = await dataSource.transaction(async (manager) => {
            await lockRoom(manager, roomId);
            const found = await findActive(manager, roomId, key);
            if (!found) return null;
            await removeFromRoom(manager, found, 'left');
            await touch(manager, roomId);
            return found;
          });
          if (participant) {
            released += 1;
            await afterRemoval(roomId, participant, 'timeout');
          } else {
            await presence.remove(roomId, key);
          }
        }
      }
      return released;
    },

    /** Tự đóng phòng mở không hoạt động (BR-ROOM-02, DL-030). Trả số phòng đã đóng. */
    async closeIdleRooms(): Promise<number> {
      const threshold = new Date(now().getTime() - config.roomIdleMinutes * 60_000);
      const candidates = await dataSource.getRepository(RoomEntity).find({
        where: { status: 'open', lastActivityAt: LessThan(threshold) },
        take: 100,
      });
      let closed = 0;
      for (const room of candidates) {
        const entries = await presence.get(room.id);
        if ([...entries.values()].some((entry) => entry.status === 'online')) continue;
        if (await deps.closeRoom(room.id, 'inactive', null)) closed += 1;
      }
      return closed;
    },
  };
}

export type LobbyService = ReturnType<typeof createLobbyService>;
